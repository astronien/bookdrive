'use client';

import Link from 'next/link';
import type { Book } from '@/lib/types';

/**
 * แถว "อ่านต่อ" บนสุดของหน้าไลบรารี
 * BookFusion วางไว้เด่นที่สุดเพราะคนเปิดแอปมาเพื่ออ่านต่อ ไม่ใช่มาไล่ดูทั้งชั้น
 */
export default function ContinueRow({ books }: { books: Book[] }) {
  if (!books.length) return null;

  return (
    <section className="mb-7">
      <div className="hrow">
        {books.map((b) => {
          const cover = b.coverFileId ? `/api/drive/file/${b.coverFileId}` : null;
          return (
            <Link key={b.id} href={`/read/${b.id}`}
              className="group flex w-[340px] items-center gap-4 rounded-2xl bg-white p-3 shadow-[0_2px_14px_rgba(27,31,46,.07)] transition hover:shadow-[0_10px_28px_rgba(27,31,46,.13)]">
              <div className="h-[112px] w-[78px] shrink-0 overflow-hidden rounded-lg bg-shell shadow-sm">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={b.title} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center px-2 text-center text-[10px] font-semibold text-muted">
                    {b.title.slice(0, 40)}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] text-muted">{b.authors[0] ?? '—'}</div>
                <div className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-snug">{b.title}</div>

                <div className="mt-3 flex items-center gap-2">
                  <Ring pct={b.percent ?? 0} />
                  <span className="text-[13px] font-semibold text-mint">อ่านต่อ</span>
                  <span className="ml-auto text-[11px] text-muted">{Math.round(b.percent ?? 0)}%</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Ring({ pct }: { pct: number }) {
  const R = 9;
  const C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
      <circle cx="12" cy="12" r={R} fill="none" stroke="#e9ecf5" strokeWidth="3" />
      <circle cx="12" cy="12" r={R} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, pct / 100))} />
    </svg>
  );
}
