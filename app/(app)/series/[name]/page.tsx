'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/lib/store/library';
import BookCard from '@/components/library/BookCard';

export default function SeriesPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const seriesName = decodeURIComponent(name);
  const { books, load, loading } = useLibrary();

  useEffect(() => { if (!books.length) load(); }, [books.length, load]);

  const volumes = books
    .filter((b) => b.series?.name === seriesName)
    .sort((a, b) => (a.series?.index ?? 0) - (b.series?.index ?? 0));

  const authors = [...new Set(volumes.flatMap((b) => b.authors))];
  const finished = volumes.filter((b) => b.percent >= 95).length;
  const totalPercent = volumes.length
    ? volumes.reduce((s, b) => s + b.percent, 0) / volumes.length
    : 0;

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3.5 border-b border-line bg-white px-[22px]">
        <Link href="/library" className="text-[13px] text-muted hover:text-ink">← ไลบรารี</Link>
        <div className="flex-1 truncate text-center text-[13px] font-semibold">{seriesName}</div>
        <div className="w-[70px]" />
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] pb-16 pt-6">
        <div className="mb-6">
          <h1 className="text-[25px] font-bold tracking-tight">{seriesName}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {volumes.length} เล่ม
            {authors.length > 0 && <> · {authors.join(', ')}</>}
            {finished > 0 && <> · อ่านจบแล้ว {finished} เล่ม</>}
          </p>
          {totalPercent > 0 && (
            <div className="mt-3 h-1 max-w-[320px] overflow-hidden rounded bg-line">
              <div className="h-full rounded bg-accent" style={{ width: `${totalPercent}%` }} />
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-[13px] text-muted">กำลังโหลด…</p>
        ) : !volumes.length ? (
          <div className="rounded-xl border border-dashed border-line py-16 text-center">
            <p className="font-semibold">ไม่พบชุดหนังสือนี้</p>
            <Link
              href="/library"
              className="mt-4 inline-block h-[38px] rounded-[10px] border border-line px-4 text-[13.5px] font-semibold leading-[38px] transition hover:bg-shell"
            >
              กลับไปไลบรารี
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-x-[18px] gap-y-[22px]">
            {volumes.map((b) => (
              <div key={b.id} className="relative">
                {/* เลขเล่มจาก calibre:series_index */}
                <span className="absolute -left-1.5 -top-1.5 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-navy px-1.5 text-[11px] font-bold text-white shadow">
                  {b.series?.index ?? '?'}
                </span>
                <BookCard book={b} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
