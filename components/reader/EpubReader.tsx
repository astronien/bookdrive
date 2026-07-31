'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { db, getBookBlob } from '@/lib/db/idb';
import { useLibrary } from '@/lib/store/library';
import { addAnnotation, listAnnotations, removeAnnotation } from '@/lib/reader/annotations';
import { FONT_STACK, THEMES, type ReaderPrefs } from '@/lib/reader/prefs';
import type { Annotation, Book, BookFile, HighlightColor, Progress } from '@/lib/types';

export interface TocItem { label: string; href: string; depth: number }
export interface SearchHit { cfi: string; excerpt: string }

export interface EpubHandle {
  prev: () => void;
  next: () => void;
  goTo: (target: string) => void;
  search: (q: string) => Promise<SearchHit[]>;
  highlight: (color: HighlightColor) => Promise<void>;
  clearSelection: () => void;
}

interface Props {
  book: Book;
  file: BookFile;
  prefs: ReaderPrefs;
  onToc?: (items: TocItem[]) => void;
  onLocation?: (info: { percent: number; chapter: string }) => void;
  /** มีข้อความถูกเลือกอยู่หรือไม่ ใช้เปิดเมนูไฮไลต์ */
  onSelection?: (sel: { text: string; x: number; y: number } | null) => void;
  onAnnotations?: (items: Annotation[]) => void;
}

const EpubReader = forwardRef<EpubHandle, Props>(function EpubReader(
  { book, file, prefs, onToc, onLocation, onSelection, onAnnotations }, ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);
  const rendRef = useRef<any>(null);
  const [status, setStatus] = useState('กำลังโหลด…');
  const saveProgress = useLibrary((s) => s.saveProgress);

  const cb = useRef({ onToc, onLocation, onSelection, onAnnotations, saveProgress });
  cb.current = { onToc, onLocation, onSelection, onAnnotations, saveProgress };

  const selRef = useRef<{ cfi: string; text: string } | null>(null);

  // ---------- โหลดหนังสือ ----------
  useEffect(() => {
    let dead = false;

    (async () => {
      const ePub = (await import('epubjs')).default;
      const blob = await getBookBlob(file.driveFileId);
      if (dead) return;

      const b = ePub(await blob.arrayBuffer());
      bookRef.current = b;

      const rendition = b.renderTo(hostRef.current!, {
        flow: prefs.flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
        width: '100%',
        height: '100%',
        spread: 'auto',
        allowScriptedContent: false,
      });
      rendRef.current = rendition;

      const row = await db.meta.get(`progress/${book.id}`);
      const saved = row?.data as Progress | undefined;
      await rendition.display(saved?.epubCfi ?? undefined);

      // สารบัญ
      try {
        const nav = await b.loaded.navigation;
        const flat: TocItem[] = [];
        const walk = (items: any[], depth: number) => {
          for (const it of items ?? []) {
            flat.push({ label: (it.label ?? '').trim(), href: it.href, depth });
            if (it.subitems?.length) walk(it.subitems, depth + 1);
          }
        };
        walk(nav.toc, 0);
        cb.current.onToc?.(flat);
      } catch {
        /* บางเล่มไม่มี nav ที่อ่านได้ */
      }

      // locations ใช้คำนวณ % — ช้า 2–5 วิ จึง cache ไว้ใช้ครั้งต่อไป
      setStatus('กำลังคำนวณตำแหน่ง…');
      const cached = await db.locations.get(book.id);
      if (cached) b.locations.load(cached.locations);
      else {
        await b.locations.generate(1600);
        if (!dead) await db.locations.put({ bookId: book.id, locations: b.locations.save() });
      }
      if (dead) return;
      setStatus('');

      // วาดไฮไลต์ที่เคยทำไว้
      const anns = await listAnnotations(book.id);
      cb.current.onAnnotations?.(anns);
      for (const a of anns) {
        if (a.cfi) {
          try {
            rendition.annotations.highlight(a.cfi, { id: a.id }, undefined, `hl-${a.color}`);
          } catch { /* cfi ใช้ไม่ได้กับไฟล์รุ่นนี้ */ }
        }
      }

      rendition.on('relocated', (loc: any) => {
        const percent = (b.locations.percentageFromCfi(loc.start.cfi) ?? 0) * 100;
        cb.current.saveProgress(book.id, { epubCfi: loc.start.cfi, percent });
        const chapter =
          b.navigation?.get?.(loc.start.href)?.label?.trim() ?? '';
        cb.current.onLocation?.({ percent, chapter });
      });

      // จับการเลือกข้อความในเอกสารที่อยู่ใน iframe
      rendition.on('selected', (cfiRange: string, contents: any) => {
        const text = contents.window.getSelection()?.toString?.() ?? '';
        if (!text.trim()) return;
        selRef.current = { cfi: cfiRange, text: text.trim() };
        const r = contents.window.getSelection().getRangeAt(0).getBoundingClientRect();
        const frame = (contents.document.defaultView.frameElement as HTMLElement)?.getBoundingClientRect();
        cb.current.onSelection?.({
          text: text.trim(),
          x: (frame?.left ?? 0) + r.left + r.width / 2,
          y: (frame?.top ?? 0) + r.top,
        });
      });

      rendition.on('markClicked', async (cfiRange: string) => {
        const items = await listAnnotations(book.id);
        const hit = items.find((x) => x.cfi === cfiRange);
        if (hit && confirm(`ลบไฮไลต์นี้?\n\n"${hit.text.slice(0, 80)}"`)) {
          await removeAnnotation(book.id, hit.id);
          rendition.annotations.remove(cfiRange, 'highlight');
          cb.current.onAnnotations?.(await listAnnotations(book.id));
        }
      });
    })().catch((e) => setStatus(`เปิดไฟล์ไม่ได้: ${(e as Error).message}`));

    return () => {
      dead = true;
      try { rendRef.current?.destroy?.(); } catch { /* noop */ }
      try { bookRef.current?.destroy?.(); } catch { /* noop */ }
      rendRef.current = null;
      bookRef.current = null;
    };
    // prefs.flow ต้องสร้าง rendition ใหม่ ที่เหลือปรับสด ๆ ได้
  }, [book.id, file.driveFileId, prefs.flow]);

  // ---------- ปรับหน้าตาแบบไม่ต้องโหลดใหม่ ----------
  useEffect(() => {
    const r = rendRef.current;
    if (!r) return;
    const t = THEMES[prefs.theme];
    r.themes.register('bd', {
      body: {
        background: t.bg,
        color: t.fg,
        'font-family': `${FONT_STACK[prefs.fontFamily]} !important`,
        'line-height': `${prefs.lineHeight} !important`,
        'text-align': prefs.justify ? 'justify' : 'start',
        padding: `${prefs.margin}px 0`,
      },
      a: { color: `${t.link} !important` },
      p: { 'line-height': `${prefs.lineHeight} !important` },
      '.hl-yellow': { background: 'rgba(255,217,74,.45)' },
      '.hl-green': { background: 'rgba(110,231,168,.45)' },
      '.hl-blue': { background: 'rgba(124,196,250,.45)' },
      '.hl-pink': { background: 'rgba(249,168,212,.45)' },
      '.hl-purple': { background: 'rgba(196,181,253,.45)' },
    });
    r.themes.select('bd');
    r.themes.fontSize(`${prefs.fontSize}px`);
  }, [prefs]);

  // ---------- API ให้หน้าแม่สั่งงาน ----------
  useImperativeHandle(ref, () => ({
    prev: () => rendRef.current?.prev(),
    next: () => rendRef.current?.next(),
    goTo: (target: string) => rendRef.current?.display(target),
    clearSelection: () => { selRef.current = null; cb.current.onSelection?.(null); },
    async search(q: string) {
      const b = bookRef.current;
      if (!b || q.trim().length < 2) return [];
      const out: SearchHit[] = [];
      // ค้นทีละ section ของ spine — epub.js ไม่มี full-text index ให้
      for (const item of b.spine.spineItems) {
        try {
          await item.load(b.load.bind(b));
          const found = item.find(q) as { cfi: string; excerpt: string }[];
          out.push(...found);
          item.unload();
        } catch { /* section เสีย ข้ามไป */ }
        if (out.length > 120) break;
      }
      return out;
    },
    async highlight(color: HighlightColor) {
      const sel = selRef.current;
      const r = rendRef.current;
      if (!sel || !r) return;
      const a = await addAnnotation(book.id, {
        type: 'highlight',
        color,
        cfi: sel.cfi,
        text: sel.text,
      });
      try {
        r.annotations.highlight(sel.cfi, { id: a.id }, undefined, `hl-${color}`);
      } catch { /* noop */ }
      selRef.current = null;
      cb.current.onSelection?.(null);
      cb.current.onAnnotations?.(await listAnnotations(book.id));
    },
  }), [book.id]);

  return (
    <div className="relative h-full w-full" style={{ background: THEMES[prefs.theme].bg }}>
      <div ref={hostRef} className="h-full w-full" />
      {status && (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center text-[13px]"
          style={{ color: THEMES[prefs.theme].fg }}
        >
          {status}
        </div>
      )}
    </div>
  );
});

export default EpubReader;
