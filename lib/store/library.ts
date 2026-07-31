'use client';

import { create } from 'zustand';
import { db } from '@/lib/db/idb';
import { queue } from '@/lib/sync/engine';
import { parseOpf, calibreIdFromFolder, titleFromFolder } from '@/lib/parse/opf';
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
  phase: 'idle' | 'listing' | 'metadata' | 'saving';
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
  scanCalibre: (refresh?: boolean) => Promise<number>;
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
    const built = await pool(
      todo,
      8, // อ่าน opf ทีละ 8 ไฟล์ — เร็วพอโดยไม่ชน rate limit ของ Drive
      async (f): Promise<Book> => {
        let meta: ReturnType<typeof parseOpf> | null = null;
        if (f.opfFileId) {
          try {
            const r = await fetch(`/api/drive/file/${f.opfFileId}`);
            if (r.ok) meta = parseOpf(await r.text());
          } catch {
            /* opf พังหรือโหลดไม่ได้ — ถอยไปใช้ชื่อโฟลเดอร์แทน */
          }
        }

        const files = [...f.files].sort((a, b) => FORMAT_RANK[a.format] - FORMAT_RANK[b.format]);
        const prev = known.get(f.folderId);

        return {
          // เก็บสิ่งที่เป็นของผู้ใช้ไว้เสมอตอน refresh — id ผูกกับ progress/ไฮไลต์
          id: prev?.id ?? crypto.randomUUID(),
          addedAt: prev?.addedAt ?? now,
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
      },
      (done, total) => set({ scan: { phase: 'metadata', done, total } })
    );

    if (!built.length) {
      set({ scan: { phase: 'idle', done: 0, total: 0 } });
      return 0;
    }

    set({ scan: { phase: 'saving', done: built.length, total: built.length } });

    // แทนที่เล่มเดิมด้วยตัวที่เพิ่งอ่านใหม่ (เทียบด้วย folderId) แล้วต่อท้ายเล่มใหม่
    const byFolder = new Map(built.map((b) => [b.folderId!, b]));
    const merged = [
      ...get().books.map((b) => (b.folderId && byFolder.has(b.folderId) ? byFolder.get(b.folderId)! : b)),
      ...built.filter((b) => !known.has(b.folderId!)),
    ].sort((a, b) => a.title.localeCompare(b.title, 'th'));

    set({ books: merged });
    await persist({
      ...emptyLib(),
      calibreFolderId: folderId,
      calibreFolderName: get().calibreFolderName,
      books: merged,
    });

    set({ scan: { phase: 'idle', done: 0, total: 0 } });
    return built.length;
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

    return out.sort((a, b) => {
      const ta = a.kind === 'book' ? a.book.title : a.name;
      const tb = b.kind === 'book' ? b.book.title : b.name;
      return ta.localeCompare(tb, 'th');
    });
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
