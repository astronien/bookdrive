'use client';

import { useEffect, useRef, useState } from 'react';
import { db, getBookBlob } from '@/lib/db/idb';
import { useLibrary } from '@/lib/store/library';
import type { Book, Progress } from '@/lib/types';

export type ReaderTheme = 'light' | 'sepia' | 'dark';

const THEMES: Record<ReaderTheme, Record<string, any>> = {
  light: { body: { background: '#fdfcf8', color: '#2b2b2b' } },
  sepia: { body: { background: '#f4ecd8', color: '#4a3f2e' } },
  dark:  { body: { background: '#16181f', color: '#c6c9d4' } },
};

export default function EpubReader({
  book, theme = 'light', fontSize = 18,
}: { book: Book; theme?: ReaderTheme; fontSize?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const [status, setStatus] = useState('กำลังโหลด…');
  const saveProgress = useLibrary((s) => s.saveProgress);

  useEffect(() => {
    let destroyed = false;
    let bookObj: any;

    (async () => {
      // epubjs แตะ window ตอน import — โหลดแบบ dynamic เท่านั้น
      const ePub = (await import('epubjs')).default;

      const blob = await getBookBlob(book.driveFileId);
      if (destroyed) return;

      bookObj = ePub(await blob.arrayBuffer());
      const rendition = bookObj.renderTo(hostRef.current!, {
        flow: 'paginated',
        width: '100%',
        height: '100%',
        spread: 'auto',
        allowScriptedContent: false,
      });
      renditionRef.current = rendition;

      // กู้ตำแหน่งที่อ่านค้างไว้
      const row = await db.meta.get(`progress/${book.id}`);
      const saved = row?.data as Progress | undefined;
      await rendition.display(saved?.epubCfi ?? undefined);

      // locations ใช้เวลาคำนวณ 2–5 วิ — cache ไว้ครั้งเดียวพอ
      setStatus('กำลังคำนวณตำแหน่ง…');
      const cached = await db.locations.get(book.id);
      if (cached) {
        bookObj.locations.load(cached.locations);
      } else {
        await bookObj.locations.generate(1600);
        await db.locations.put({ bookId: book.id, locations: bookObj.locations.save() });
      }
      setStatus('');

      rendition.on('relocated', (loc: any) => {
        const percent = (bookObj.locations.percentageFromCfi(loc.start.cfi) ?? 0) * 100;
        // store จะ debounce ให้เอง ไม่ยิง Drive ทุกหน้าที่พลิก
        saveProgress(book.id, { epubCfi: loc.start.cfi, percent });
      });

      rendition.on('keyup', (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight') rendition.next();
        if (e.key === 'ArrowLeft') rendition.prev();
      });
    })().catch((e) => setStatus(`เปิดไฟล์ไม่ได้: ${e.message}`));

    return () => {
      destroyed = true;
      bookObj?.destroy?.();
    };
  }, [book.id, book.driveFileId, saveProgress]);

  // เปลี่ยนธีม/ขนาดตัวอักษรโดยไม่ต้อง re-render ทั้งเล่ม
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    r.themes.register('current', THEMES[theme]);
    r.themes.select('current');
    r.themes.fontSize(`${fontSize}px`);
  }, [theme, fontSize]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      {status && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-muted">
          {status}
        </div>
      )}
    </div>
  );
}
