'use client';

import { create } from 'zustand';
import { db } from '@/lib/db/idb';
import { queue } from '@/lib/sync/engine';
import type { Book, Library, Progress } from '@/lib/types';

const deviceId =
  typeof window !== 'undefined'
    ? (localStorage.getItem('bd-device') ??
       (() => { const v = crypto.randomUUID(); localStorage.setItem('bd-device', v); return v; })())
    : 'server';

interface State {
  books: Book[];
  loading: boolean;
  query: string;
  format: 'all' | 'epub' | 'pdf' | 'cbz';
  load: () => Promise<void>;
  scan: () => Promise<number>;
  setQuery: (q: string) => void;
  setFormat: (f: State['format']) => void;
  filtered: () => Book[];
  saveProgress: (bookId: string, patch: Partial<Progress>) => Promise<void>;
}

export const useLibrary = create<State>((set, get) => ({
  books: [],
  loading: true,
  query: '',
  format: 'all',

  async load() {
    // อ่านจาก IndexedDB ก่อน -> แสดงผลทันทีแม้ออฟไลน์
    const local = await db.meta.get('library');
    if (local) set({ books: (local.data as Library).books, loading: false });

    try {
      const res = await fetch('/api/drive/appdata/library');
      const { data, etag } = await res.json();
      if (data) {
        await db.meta.put({ name: 'library', data, etag });
        set({ books: (data as Library).books });
      }
    } catch { /* ออฟไลน์ — ใช้ของใน IndexedDB ต่อไป */ }
    set({ loading: false });
  },

  /** สแกนโฟลเดอร์ Drive แล้วเพิ่มเฉพาะไฟล์ที่ยังไม่มีในไลบรารี */
  async scan() {
    const res = await fetch('/api/drive/list');
    const { files } = await res.json();
    const known = new Set(get().books.map((b) => b.driveFileId));
    const now = new Date().toISOString();

    const added: Book[] = files
      .filter((f: any) => !known.has(f.id))
      .map((f: any) => ({
        id: crypto.randomUUID(),
        driveFileId: f.id,
        driveModifiedTime: f.modifiedTime,
        format: f.format,
        size: Number(f.size ?? 0),
        title: f.name.replace(/\.[^.]+$/, ''),
        authors: [],
        tags: [],
        shelfIds: [],
        addedAt: now,
        status: 'unread' as const,
        percent: 0,
      }));

    if (!added.length) return 0;

    const books = [...get().books, ...added];
    const lib: Library = { version: 2, updatedAt: now, deviceId, books };
    const prev = await db.meta.get('library');
    await db.meta.put({ name: 'library', data: lib, etag: prev?.etag, dirty: true });
    set({ books });
    queue({ scope: 'library' });
    // ขั้นถัดไป: ส่ง added เข้า worker เพื่อแตก metadata + ปก (lib/parse/*)
    return added.length;
  },

  setQuery: (query) => set({ query }),
  setFormat: (format) => set({ format }),

  filtered() {
    const { books, query, format } = get();
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (format !== 'all' && b.format !== format) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.authors.some((a) => a.toLowerCase().includes(q)) ||
        b.tags.some((t) => t.toLowerCase().includes(q))
      );
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

    // อัปเดต % ในไลบรารีด้วย เพื่อให้ progress bar บนการ์ดขยับทันที
    set({ books: get().books.map((b) => (b.id === bookId ? { ...b, percent: next.percent, status: 'reading' } : b)) });

    queue({ scope: 'progress', bookId });
    queue({ scope: 'library' });
  },
}));
