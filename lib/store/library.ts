'use client';

import { create } from 'zustand';
import { db } from '@/lib/db/idb';
import { queue } from '@/lib/sync/engine';
import { parseOpf, calibreIdFromFolder, titleFromFolder, type OpfMeta } from '@/lib/parse/opf';
import { extractMetaFromEpub } from '@/lib/parse/epub';
import {
  FORMAT_RANK,
  type Book,
  type BookFile,
  type BookFormat,
  type Library,
  type Progress,
} from '@/lib/types';

const deviceId =
  typeof window !== 'undefined'
    ? localStorage.getItem('bd-device') ??
      (() => {
        const v = crypto.randomUUID();
        localStorage.setItem('bd-device', v);
        return v;
      })()
    : 'server';

const emptyLib = (): Library => ({
  version: 3,
  updatedAt: new Date().toISOString(),
  deviceId,
  books: [],
});

/** รันงาน async หลายตัวโดยจำกัดจำนวนที่วิ่งพร้อมกัน */
async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
  onTick?: (done: number, total: number) => void
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
        onTick?.(++done, items.length);
      }
    })
  );
  return out;
}

/** ค่าที่ใช้เรียงของการ์ดหนึ่งใบ — ชุดหนังสือต้องยุบหลายเล่มให้เหลือค่าเดียว */
function entryKeys(e: ShelfEntry) {
  const books = e.kind === 'book' ? [e.book] : e.books;
  const max = (f: (b: Book) => string | undefined) =>
    books.reduce((acc, b) => { const v = f(b); return v && v > acc ? v : acc; }, '');

  return {
    title: e.kind === 'book' ? e.book.title : e.name,
    // เล่มไหนในชุดที่เพิ่ง "เพิ่ม/เปิด" ล่าสุด ให้ถือเป็นของทั้งชุด
    added: max((b) => b.addedAt),
    opened: max((b) => b.lastOpenedAt),
    // ใช้ค่าเฉลี่ย ไม่ใช่ค่าสูงสุด — อ่านจบ 1 เล่มจาก 20 เล่มไม่ใช่ชุดที่ใกล้จบ
    progress: books.reduce((s, b) => s + (b.percent ?? 0), 0) / books.length,
    author: books[0]?.authors[0] ?? '',
    isSeries: e.kind === 'series',
  };
}

/** comparator ของหน้าไลบรารี ให้ตรงกับ SortKey ที่ผู้ใช้เลือกจริงๆ */
function entryCmp(sort: SortKey) {
  return (x: ShelfEntry, y: ShelfEntry) => {
    const a = entryKeys(x);
    const b = entryKeys(y);
    const byTitle = a.title.localeCompare(b.title, 'th');
    // ค่าว่างต้องไปท้ายเสมอ ไม่ใช่ขึ้นหัวเพราะ '' น้อยกว่าทุกอย่าง
    const descStr = (p: string, q: string) => (p === q ? 0 : !p ? 1 : !q ? -1 : q.localeCompare(p));

    switch (sort) {
      case 'added': return descStr(a.added, b.added) || byTitle;
      case 'opened': return descStr(a.opened, b.opened) || byTitle;
      case 'progress': return b.progress - a.progress || byTitle;
      case 'author': return a.author.localeCompare(b.author, 'th') || byTitle;
      // เรียงตามชุด = ชุดหนังสือขึ้นก่อน แล้วค่อยตามด้วยเล่มเดี่ยว
      case 'series': return Number(b.isSeries) - Number(a.isSeries) || byTitle;
      default: return byTitle;
    }
  };
}

/** การ์ดหนึ่งใบในหน้าไลบรารี — เล่มเดี่ยว หรือชุดหนังสือที่ยุบรวมกัน */
export type ShelfEntry =
  | { kind: 'book'; book: Book }
  | { kind: 'series'; name: string; books: Book[] };

export type SortKey = 'title' | 'added' | 'opened' | 'progress' | 'author' | 'series';
export type StatusFilter = 'all' | 'unread' | 'reading' | 'finished';

export interface Filters {
  query: string;
  format: 'all' | BookFormat;
  status: StatusFilter;
  author: string | null;
  tag: string | null;
  /** แสดงเฉพาะเล่มที่ดาวน์โหลดไว้อ่านออฟไลน์แล้ว */
  offlineOnly: boolean;
}

export interface ScanProgress {
  phase: 'idle' | 'listing' | 'metadata' | 'epub' | 'saving';
  done: number;
  total: number;
}

interface State {
  books: Book[];
  calibreFolderId?: string;
  calibreFolderName?: string;
  loading: boolean;
  scan: ScanProgress;

  filters: Filters;
  sort: SortKey;
  offlineIds: Set<string>;

  load: () => Promise<void>;
  connectCalibre: (folderId: string, name: string) => Promise<void>;
  scanCalibre: (refresh?: boolean) => Promise<{ added: number; removed: number }>;
  setFilter: (patch: Partial<Filters>) => void;
  setSort: (s: SortKey) => void;
  resetFilters: () => void;
  refreshOffline: () => Promise<void>;
  filtered: () => Book[];
  facets: () => { authors: [string, number][]; tags: [string, number][] };
  grouped: () => ShelfEntry[];
  setPreferredFormat: (bookId: string, f: BookFormat) => Promise<void>;
  saveProgress: (bookId: string, patch: Partial<Progress>) => Promise<void>;
}

async function persist(lib: Library) {
  const prev = await db.meta.get('library');
  await db.meta.put({ name: 'library', data: lib, etag: prev?.etag, dirty: true });
  queue({ scope: 'library' });
}

export const useLibrary = create<State>((set, get) => ({
  books: [],
  loading: true,
  scan: { phase: 'idle', done: 0, total: 0 },
  filters: { query: '', format: 'all', status: 'all', author: null, tag: null, offlineOnly: false },
  sort: 'title',
  offlineIds: new Set<string>(),

  async load() {
    const local = await db.meta.get('library');
    if (local) {
      const lib = local.data as Library;
      set({
        books: lib.books ?? [],
        calibreFolderId: lib.calibreFolderId,
        calibreFolderName: lib.calibreFolderName,
        loading: false,
      });
    }
    try {
      const res = await fetch('/api/drive/appdata/library');
      const { data, etag } = await res.json();
      if (data) {
        await db.meta.put({ name: 'library', data, etag });
        const lib = data as Library;
        set({
          books: lib.books ?? [],
          calibreFolderId: lib.calibreFolderId,
          calibreFolderName: lib.calibreFolderName,
        });
      }
    } catch {
      /* ออฟไลน์ — ใช้ของใน IndexedDB */
    }
    set({ loading: false });
  },

  async connectCalibre(folderId, name) {
    const lib: Library = {
      ...emptyLib(),
      calibreFolderId: folderId,
      calibreFolderName: name,
      books: get().books,
    };
    set({ calibreFolderId: folderId, calibreFolderName: name });
    await persist(lib);
  },

  /**
   * สแกน Calibre library
   *
   * โครงของ Calibre คือ Author/Title (id)/ โดยมี metadata.opf กับ cover.jpg วางไว้ให้แล้ว
   * จึงไม่ต้องแกะ EPUB เอง — อ่าน opf ตรงๆ เร็วกว่ามากและได้ series/tags/rating ครบ
   */
  async scanCalibre(refresh = false) {
    const folderId = get().calibreFolderId;
    if (!folderId) throw new Error('ยังไม่ได้เลือกโฟลเดอร์ Calibre library');

    set({ scan: { phase: 'listing', done: 0, total: 0 } });

    const res = await fetch('/api/drive/calibre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    if (!res.ok) {
      set({ scan: { phase: 'idle', done: 0, total: 0 } });
      throw new Error((await res.json()).error ?? 'สแกนไม่สำเร็จ');
    }
    const { books: found } = (await res.json()) as {
      books: {
        folderId: string;
        folderName: string;
        authorFolderName: string;
        opfFileId?: string;
        coverFileId?: string;
        files: BookFile[];
      }[];
    };

    const known = new Map(get().books.filter((b) => b.folderId).map((b) => [b.folderId!, b]));
    // refresh = อ่าน opf ใหม่ทุกเล่มเพื่ออัปเดต metadata (เช่นตอนแก้บั๊กที่ทำให้อ่าน opf ไม่ได้)
    const todo = refresh ? found : found.filter((f) => !known.has(f.folderId));

    set({ scan: { phase: 'metadata', done: 0, total: todo.length } });

    const now = new Date().toISOString();

    // แยกสองกลุ่ม: มี metadata.opf (เบา) กับไม่มี (ต้องแกะจากไฟล์ EPUB ซึ่งหนักกว่ามาก)
    const withOpf = todo.filter((f) => f.opfFileId);
    const withoutOpf = todo.filter((f) => !f.opfFileId);

    const build = async (
      f: (typeof todo)[number],
      meta: OpfMeta | null,
      source: 'opf' | 'epub' | 'folder'
    ): Promise<Book> => {
      const files = [...f.files].sort((a, b) => FORMAT_RANK[a.format] - FORMAT_RANK[b.format]);
      const prev = known.get(f.folderId);

      // "เพิ่มเมื่อ" ต้องเป็นเวลาที่ไฟล์ขึ้นไปอยู่บน Drive ไม่ใช่เวลาที่เรากดสแกน
      // ถ้าใช้เวลาสแกน หนังสือทุกเล่มจะได้ timestamp เดียวกันหมด แล้ว "เรียงตามเพิ่มล่าสุด"
      // ก็ไม่ต่างจากเรียงตามชื่อเรื่องเลย (เจอจริงตอนทดสอบ: 221 เล่ม addedAt ซ้ำกันทั้งหมด)
      const driveAdded = files.reduce((acc, x) => (x.modifiedTime > acc ? x.modifiedTime : acc), '');

      return {
        metaSource: source,
        // เก็บสิ่งที่เป็นของผู้ใช้ไว้เสมอตอน refresh — id ผูกกับ progress/ไฮไลต์
        id: prev?.id ?? crypto.randomUUID(),
        addedAt: driveAdded || prev?.addedAt || now,
        lastOpenedAt: prev?.lastOpenedAt,
        status: prev?.status ?? 'unread',
        percent: prev?.percent ?? 0,
        preferredFormat: prev?.preferredFormat,
        shelfIds: prev?.shelfIds ?? [],

        source: 'calibre',
        folderId: f.folderId,
        calibreId: meta?.calibreId ?? calibreIdFromFolder(f.folderName),
        files,
        coverFileId: f.coverFileId,

        title: meta?.title || titleFromFolder(f.folderName),
        authors: meta?.authors?.length ? meta.authors : f.authorFolderName ? [f.authorFolderName] : [],
        series: meta?.series,
        publisher: meta?.publisher,
        publishedDate: meta?.publishedDate,
        language: meta?.language,
        isbn: meta?.isbn,
        description: meta?.description,
        rating: meta?.rating,
        tags: meta?.tags ?? [],
      };
    };

    const built: Book[] = [];

    // 1) เล่มที่มี metadata.opf — โหลดไฟล์เล็ก ทำได้ทีละ 8
    set({ scan: { phase: 'metadata', done: 0, total: withOpf.length } });
    built.push(...await pool(withOpf, 8, async (f) => {
      let meta: OpfMeta | null = null;
      try {
        const r = await fetch(`/api/drive/file/${f.opfFileId}`);
        if (r.ok) meta = parseOpf(await r.text());
      } catch {
        /* opf พังหรือโหลดไม่ได้ */
      }
      return build(f, meta, meta ? 'opf' : 'folder');
    }, (done, total) => set({ scan: { phase: 'metadata', done, total } })));

    // 2) เล่มที่ไม่มี metadata.opf — แกะจากไฟล์ EPUB
    //    ต้องโหลดทั้งเล่ม (หลาย MB) จึงลดเหลือทีละ 3 และข้ามเล่มที่เคยแกะแล้วและไฟล์ไม่เปลี่ยน
    if (withoutOpf.length) {
      set({ scan: { phase: 'epub', done: 0, total: withoutOpf.length } });
      built.push(...await pool(withoutOpf, 3, async (f) => {
        const prev = known.get(f.folderId);
        const epub = f.files.find((x) => x.format === 'epub');
        const unchanged =
          prev?.metaSource === 'epub' &&
          epub &&
          prev.files.some((x) => x.driveFileId === epub.driveFileId && x.modifiedTime === epub.modifiedTime);

        if (unchanged && prev) {
          // ไฟล์ไม่ขยับตั้งแต่ครั้งก่อน ไม่ต้องโหลดใหม่ให้เสียเวลาและโควตา
          const cached: OpfMeta = {
            title: prev.title,
            authors: prev.authors,
            series: prev.series,
            publisher: prev.publisher,
            publishedDate: prev.publishedDate,
            language: prev.language,
            isbn: prev.isbn,
            description: prev.description,
            rating: prev.rating,
            tags: prev.tags,
            calibreId: prev.calibreId,
          };
          return build(f, cached, 'epub');
        }

        let meta: OpfMeta | null = null;
        if (epub) {
          try {
            const r = await fetch(`/api/drive/file/${epub.driveFileId}`);
            if (r.ok) meta = await extractMetaFromEpub(await r.blob());
          } catch {
            /* ไฟล์เสียหรือโหลดไม่ได้ — ถอยไปใช้ชื่อโฟลเดอร์ */
          }
        }
        return build(f, meta, meta ? 'epub' : 'folder');
      }, (done, total) => set({ scan: { phase: 'epub', done, total } })));
    }

    // ไม่มีเล่มใหม่ ไม่ได้แปลว่าไม่มีอะไรต้องทำ — เล่มผีอาจต้องถูกตัดออก
    // จึงห้าม return ตรงนี้ทิ้งเหมือนเดิม ปล่อยให้ไหลลงไปทำขั้น prune ก่อน

    set({ scan: { phase: 'saving', done: built.length, total: built.length } });

    // แทนที่เล่มเดิมด้วยตัวที่เพิ่งอ่านใหม่ (เทียบด้วย folderId) แล้วต่อท้ายเล่มใหม่
    const byFolder = new Map(built.map((b) => [b.folderId!, b]));
    let merged = [
      ...get().books.map((b) => (b.folderId && byFolder.has(b.folderId) ? byFolder.get(b.folderId)! : b)),
      ...built.filter((b) => !known.has(b.folderId!)),
    ].sort((a, b) => a.title.localeCompare(b.title, 'th'));

    /* ---------- ตัดเล่มที่หายไปจาก Drive แล้ว ----------
       ถ้าไม่ทำขั้นนี้จะเกิดเล่มผีค้างอยู่ตลอดไป: พอผู้ใช้ลบหนังสือใน Calibre
       แล้วเพิ่มกลับเข้ามาใหม่ Calibre จะสร้าง "โฟลเดอร์ใหม่" ให้ (folderId คนละตัว)
       การ merge ข้างบนเทียบด้วย folderId จึงมองว่าเป็นคนละเล่ม แล้วเพิ่มเข้ามาอีกใบ
       ส่วนใบเก่าไม่เคยถูกลบเพราะโค้ดเดิมเก็บ get().books ไว้ทั้งหมดโดยไม่เคยตรวจว่ายังมีจริงไหม

       เจอจริงในไลบรารี: "ระบบจอมยุทธ์สุดโกงแห่งโลกคู่ขนาน 1-300" โผล่สองใบ
       calibreId 336 เท่ากันทั้งคู่ แต่ folderId คนละตัว modifiedTime ห่างกันปีกว่า */
    const alive = new Set(found.map((f) => f.folderId));
    const ghosts = merged.filter((b) => b.source === 'calibre' && b.folderId && !alive.has(b.folderId));

    /* กันพลาด: ถ้ารอบนี้ Drive คืนมาน้อยกว่าครึ่งของที่เคยมี แปลว่าน่าจะสแกนไม่ครบ
       (เน็ตหลุด, token หมดอายุกลางคัน, เลือกโฟลเดอร์ผิด) ห้ามลบอะไรทั้งนั้น
       ยอมให้มีเล่มผีค้างดีกว่าลบไลบรารีของผู้ใช้ทิ้งเพราะ request เดียวพลาด */
    const prevCalibre = get().books.filter((b) => b.source === 'calibre').length;
    const trustworthy = found.length * 2 >= prevCalibre;
    let removed = 0;

    if (ghosts.length && trustworthy) {
      const dead = new Set(ghosts.map((b) => b.folderId));
      merged = merged.filter((b) => !(b.folderId && dead.has(b.folderId)));
      removed = ghosts.length;
    }

    set({ books: merged });
    await persist({
      ...emptyLib(),
      calibreFolderId: folderId,
      calibreFolderName: get().calibreFolderName,
      books: merged,
    });

    set({ scan: { phase: 'idle', done: 0, total: 0 } });
    return { added: built.length, removed };
  },

  setFilter: (patch) => set({ filters: { ...get().filters, ...patch } }),
  setSort: (sort) => set({ sort }),
  resetFilters: () =>
    set({ filters: { query: '', format: 'all', status: 'all', author: null, tag: null, offlineOnly: false } }),

  /** เล่มไหนมีไฟล์อยู่ใน IndexedDB แล้วบ้าง — ใช้ทั้งกรองและแสดงไอคอน */
  async refreshOffline() {
    const rows = await db.blobs.toArray();
    const have = new Set(rows.map((r) => r.driveFileId));
    const ids = new Set<string>();
    for (const b of get().books) {
      if (b.files.some((f) => have.has(f.driveFileId))) ids.add(b.id);
    }
    set({ offlineIds: ids });
  },

  filtered() {
    const { books, filters: f, sort, offlineIds } = get();
    const q = f.query.trim().toLowerCase();

    const out = books.filter((b) => {
      if (f.format !== 'all' && !b.files.some((x) => x.format === f.format)) return false;
      if (f.author && !b.authors.includes(f.author)) return false;
      if (f.tag && !b.tags.includes(f.tag)) return false;
      if (f.offlineOnly && !offlineIds.has(b.id)) return false;

      if (f.status !== 'all') {
        // ไม่เชื่อ b.status อย่างเดียว เพราะเล่มเก่าที่สแกนมาก่อนยังเป็น unread ทั้งที่อ่านไปแล้ว
        const pct = b.percent ?? 0;
        const st = pct >= 95 ? 'finished' : pct > 0 ? 'reading' : 'unread';
        if (st !== f.status) return false;
      }

      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.authors.some((a) => a.toLowerCase().includes(q)) ||
        b.tags.some((t) => t.toLowerCase().includes(q)) ||
        (b.series?.name.toLowerCase().includes(q) ?? false)
      );
    });

    const byTitle = (a: Book, b: Book) => a.title.localeCompare(b.title, 'th');
    const desc = (x?: string, y?: string) => (y ?? '').localeCompare(x ?? '');

    switch (sort) {
      case 'added': out.sort((a, b) => desc(a.addedAt, b.addedAt) || byTitle(a, b)); break;
      case 'opened': out.sort((a, b) => desc(a.lastOpenedAt, b.lastOpenedAt) || byTitle(a, b)); break;
      case 'progress': out.sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0) || byTitle(a, b)); break;
      case 'author': out.sort((a, b) => (a.authors[0] ?? '').localeCompare(b.authors[0] ?? '', 'th') || byTitle(a, b)); break;
      case 'series':
        out.sort((a, b) =>
          (a.series?.name ?? 'zzz').localeCompare(b.series?.name ?? 'zzz', 'th') ||
          (a.series?.index ?? 0) - (b.series?.index ?? 0) ||
          byTitle(a, b));
        break;
      default: out.sort(byTitle);
    }
    return out;
  },

  /** นับจำนวนต่อผู้เขียน/แท็ก เพื่อให้เมนูกรองบอกได้ว่ามีกี่เล่ม */
  facets() {
    const authors = new Map<string, number>();
    const tags = new Map<string, number>();
    for (const b of get().books) {
      for (const a of b.authors) authors.set(a, (authors.get(a) ?? 0) + 1);
      for (const t of b.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    }
    const sortFn = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0], 'th');
    return {
      authors: [...authors.entries()].sort(sortFn),
      tags: [...tags.entries()].sort(sortFn),
    };
  },

  /**
   * ยุบเล่มที่อยู่ชุดเดียวกันให้เหลือการ์ดเดียว
   * ชุดที่มีเล่มเดียวไม่ต้องยุบ — ยุบแล้วผู้ใช้ต้องคลิกเพิ่มโดยไม่ได้อะไรกลับมา
   */
  grouped() {
    const books = get().filtered();
    const series = new Map<string, Book[]>();
    const singles: Book[] = [];

    for (const b of books) {
      const name = b.series?.name?.trim();
      if (!name) { singles.push(b); continue; }
      const arr = series.get(name) ?? [];
      arr.push(b);
      series.set(name, arr);
    }

    const out: ShelfEntry[] = singles.map((book) => ({ kind: 'book' as const, book }));

    for (const [name, list] of series) {
      if (list.length === 1) {
        out.push({ kind: 'book', book: list[0] });
      } else {
        out.push({
          kind: 'series',
          name,
          books: [...list].sort((a, b) => (a.series?.index ?? 0) - (b.series?.index ?? 0)),
        });
      }
    }

    // ต้องเรียงซ้ำตรงนี้ ไม่ใช่พึ่งลำดับจาก filtered()
    // เพราะการยุบชุดหนังสือทำลายลำดับเดิมไปแล้ว (singles ถูก push ก่อน series เสมอ)
    return out.sort(entryCmp(get().sort));
  },

  async setPreferredFormat(bookId, f) {
    const books = get().books.map((b) => (b.id === bookId ? { ...b, preferredFormat: f } : b));
    set({ books });
    await persist({
      ...emptyLib(),
      calibreFolderId: get().calibreFolderId,
      calibreFolderName: get().calibreFolderName,
      books,
    });
  },

  async saveProgress(bookId, patch) {
    const name = `progress/${bookId}`;
    const row = await db.meta.get(name);
    const base: Progress = (row?.data as Progress) ?? {
      bookId, updatedAt: '', deviceId, percent: 0, totalReadingMs: 0, sessions: [],
    };
    const next: Progress = { ...base, ...patch, deviceId, updatedAt: new Date().toISOString() };
    await db.meta.put({ name, data: next, etag: row?.etag, dirty: true });

    set({
      books: get().books.map((b) =>
        b.id === bookId ? { ...b, percent: next.percent, status: 'reading' as const } : b
      ),
    });

    queue({ scope: 'progress', bookId });
    queue({ scope: 'library' });
  },
}));
