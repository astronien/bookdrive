'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useLibrary } from '@/lib/store/library';
import type { ReaderTheme } from '@/components/reader/EpubReader';

// reader แตะ DOM/window ตรงๆ — ปิด SSR
const EpubReader = dynamic(() => import('@/components/reader/EpubReader'), { ssr: false });

export default function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { books, load } = useLibrary();
  const [theme, setTheme] = useState<ReaderTheme>('light');
  const [fontSize, setFontSize] = useState(18);
  const [panel, setPanel] = useState(false);

  useEffect(() => { if (!books.length) load(); }, [books.length, load]);

  const book = books.find((b) => b.id === id);
  if (!book) return <div className="grid h-full place-items-center text-muted">กำลังโหลด…</div>;

  return (
    <div className={`flex h-screen flex-col ${theme === 'dark' ? 'reader-dark' : theme === 'sepia' ? 'reader-sepia' : 'bg-[#fdfcf8]'}`}>
      <header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-black/5 px-5">
        <Link href="/library" className="text-[13px] text-muted hover:text-ink">← ไลบรารี</Link>
        <div className="flex-1 truncate text-center text-[13px] font-semibold opacity-60">{book.title}</div>
        <button onClick={() => setPanel((v) => !v)} className="text-[13px] font-semibold text-muted hover:text-ink">Aa</button>
      </header>

      {panel && (
        <div className="absolute right-5 top-[58px] z-10 w-[280px] rounded-2xl bg-white p-4 shadow-2xl">
          <label className="mb-2 block text-[11.5px] font-semibold uppercase tracking-wide text-muted">ธีม</label>
          <div className="mb-4 flex gap-2">
            {(['light', 'sepia', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`h-11 flex-1 rounded-[9px] border-2 text-[11px] font-semibold ${theme === t ? 'border-accent' : 'border-line'}`}
                style={{ background: t === 'light' ? '#fdfcf8' : t === 'sepia' ? '#f4ecd8' : '#2a2d3a', color: t === 'dark' ? '#ccc' : '#333' }}
              >
                Aa
              </button>
            ))}
          </div>
          <label className="mb-2 block text-[11.5px] font-semibold uppercase tracking-wide text-muted">
            ขนาดตัวอักษร — {fontSize}px
          </label>
          <input type="range" min={13} max={30} value={fontSize} onChange={(e) => setFontSize(+e.target.value)} className="w-full accent-accent" />
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {book.format === 'epub'
          ? <EpubReader book={book} theme={theme} fontSize={fontSize} />
          : <div className="grid h-full place-items-center text-muted">PDF reader — ดู lib/parse/pdf.ts (M2)</div>}
      </div>

      <footer className="flex h-[52px] shrink-0 items-center gap-4 border-t border-black/5 px-6 text-[11.5px] text-muted">
        <div className="h-1 flex-1 rounded bg-black/10">
          <div className="h-full rounded bg-accent" style={{ width: `${book.percent}%` }} />
        </div>
        <span>{Math.round(book.percent)}%</span>
      </footer>
    </div>
  );
}
