'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { db, getBookBlob } from '@/lib/db/idb';
import { useLibrary } from '@/lib/store/library';
import type { Book, BookFile, Progress } from '@/lib/types';
import { THEMES, type ReaderPrefs } from '@/lib/reader/prefs';

export interface PdfOutlineItem { title: string; page: number }

interface Props {
  book: Book;
  file: BookFile;
  prefs: ReaderPrefs;
  onOutline?: (items: PdfOutlineItem[]) => void;
  onPages?: (n: number) => void;
  /** ให้หน้าแม่สั่งกระโดดหน้าได้ */
  gotoRef?: React.MutableRefObject<((page: number) => void) | null>;
}

/**
 * PDF reader
 *
 * เรนเดอร์เฉพาะหน้าที่ใกล้ viewport — ไฟล์ 600 หน้าถ้าวาดหมดทีเดียวจะกินแรมเป็นกิกะไบต์
 * ใช้ IntersectionObserver คอยเติมและคืนหน้าที่เลื่อนพ้นไปแล้ว
 */
export default function PdfReader({ book, file, prefs, onOutline, onPages, gotoRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('กำลังโหลด…');
  const [zoom, setZoom] = useState(1);
  const saveProgress = useLibrary((s) => s.saveProgress);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const saveRef = useRef(saveProgress);
  saveRef.current = saveProgress;

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      // pdfjs แตะ DOMMatrix/Worker ตอน import — โหลดแบบ dynamic เท่านั้น
      const pdfjs = await import('pdfjs-dist');
      // ผูก worker กับเวอร์ชันที่ติดตั้งจริง ป้องกัน worker/API คนละเวอร์ชันซึ่งพังแบบเงียบ ๆ
      pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

      const blob = await getBookBlob(file.driveFileId);
      if (cancelled) return;

      const buf = await blob.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      if (cancelled) return;

      onPages?.(doc.numPages);

      // สารบัญ
      try {
        const outline = await doc.getOutline();
        if (outline?.length) {
          const items: PdfOutlineItem[] = [];
          for (const o of outline.slice(0, 200)) {
            try {
              const dest = typeof o.dest === 'string' ? await doc.getDestination(o.dest) : o.dest;
              const idx = dest ? await doc.getPageIndex(dest[0]) : 0;
              items.push({ title: o.title, page: idx + 1 });
            } catch {
              /* บาง entry ชี้ไปที่ปลายทางที่ไม่มีจริง ข้ามไป */
            }
          }
          onOutline?.(items);
        }
      } catch {
        /* PDF ไม่มีสารบัญก็เรื่องปกติ */
      }

      const host = hostRef.current!;
      host.innerHTML = '';

      // สร้างกล่องเปล่าไว้ก่อนทุกหน้า เพื่อให้ scrollbar ยาวถูกต้องตั้งแต่แรก
      const page1 = await doc.getPage(1);
      const base = page1.getViewport({ scale: 1 });
      const holders: HTMLDivElement[] = [];

      for (let i = 1; i <= doc.numPages; i++) {
        const d = document.createElement('div');
        d.dataset.page = String(i);
        d.className = 'relative mx-auto mb-4 bg-white shadow-md';
        d.style.width = '100%';
        d.style.aspectRatio = `${base.width} / ${base.height}`;
        host.appendChild(d);
        holders.push(d);
      }

      const rendered = new Map<number, HTMLCanvasElement>();

      const draw = async (n: number) => {
        if (rendered.has(n) || cancelled) return;
        const holder = holders[n - 1];
        const page = await doc.getPage(n);
        const cssW = holder.clientWidth || 700;
        const vp = page.getViewport({ scale: cssW / base.width });
        const canvas = document.createElement('canvas');
        const dpr = Math.min(window.devicePixelRatio, 2);
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = '100%';
        canvas.style.display = 'block';
        holder.appendChild(canvas);
        rendered.set(n, canvas);
        const ctx = canvas.getContext('2d')!;
        ctx.scale(dpr, dpr);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
      };

      const free = (n: number) => {
        const c = rendered.get(n);
        if (!c) return;
        c.remove();
        rendered.delete(n);
      };

      // ต้องประกาศก่อนสร้าง observer — callback อ้างถึงตัวนี้ TS จะฟ้อง used before declaration
      let current = 1;

      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) draw(n);
            else if (Math.abs(n - current) > 4) free(n);
          }
        },
        { root: host.parentElement, rootMargin: '900px 0px' }
      );
      holders.forEach((h) => io.observe(h));

      const scroller = host.parentElement!;

      const onScroll = () => {
        const mid = scroller.scrollTop + scroller.clientHeight / 2;
        let n = 1;
        for (let i = 0; i < holders.length; i++) {
          if (holders[i].offsetTop <= mid) n = i + 1;
          else break;
        }
        if (n !== current) {
          current = n;
          saveRef.current(book.id, {
            pdfPage: n,
            pdfScrollTop: scroller.scrollTop,
            percent: (n / doc.numPages) * 100,
          });
        }
      };
      scroller.addEventListener('scroll', onScroll, { passive: true });

      if (gotoRef) {
        gotoRef.current = (p: number) => {
          const h = holders[Math.max(1, Math.min(doc.numPages, p)) - 1];
          if (h) scroller.scrollTo({ top: h.offsetTop - 8, behavior: 'smooth' });
        };
      }

      // กลับไปหน้าที่ค้างไว้
      const row = await db.meta.get(`progress/${book.id}`);
      const saved = row?.data as Progress | undefined;
      if (saved?.pdfPage && saved.pdfPage > 1) {
        requestAnimationFrame(() => {
          const h = holders[saved.pdfPage! - 1];
          if (h) scroller.scrollTop = h.offsetTop - 8;
        });
      }

      await draw(1);
      setStatus('');

      cleanup = () => {
        io.disconnect();
        scroller.removeEventListener('scroll', onScroll);
        if (gotoRef) gotoRef.current = null;
        doc.destroy();
      };
    })().catch((e) => setStatus(`เปิดไฟล์ไม่ได้: ${(e as Error).message}`));

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [book.id, file.driveFileId, gotoRef, onOutline, onPages]);

  // เปลี่ยนซูมแล้ววาดใหม่ทั้งหมด — ทำผ่าน key ของ container ง่ายกว่าไล่ resize ทีละ canvas
  const t = THEMES[prefs.theme];

  return (
    <div className="h-full overflow-y-auto" style={{ background: t.bg }}>
      <div
        ref={hostRef}
        className="mx-auto py-4"
        style={{ maxWidth: `${prefs.width * zoom}px`, padding: `${prefs.margin / 2}px 12px` }}
      />
      {status && (
        <div className="pointer-events-none fixed inset-0 grid place-items-center text-[13px]" style={{ color: t.fg }}>
          {status}
        </div>
      )}
      <div className="pointer-events-none sticky bottom-3 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-white backdrop-blur">
          <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))} className="px-2 text-[15px]">−</button>
          <span className="w-12 text-center text-[11px]">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))} className="px-2 text-[15px]">+</button>
        </div>
      </div>
    </div>
  );
}
