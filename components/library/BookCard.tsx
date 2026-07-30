'use client';

import Link from 'next/link';
import type { Book } from '@/lib/types';

const PALETTES = [
  ['#e07a5f', '#3d405b'], ['#2a9d8f', '#264653'], ['#e9c46a', '#f4a261'],
  ['#6a4c93', '#1982c4'], ['#ff595e', '#8ac926'], ['#f72585', '#7209b7'],
];

function hashOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function BookCard({ book }: { book: Book }) {
  const [a, b] = PALETTES[hashOf(book.id) % PALETTES.length];
  const cover = book.coverFileId ? `/api/drive/file/${book.coverFileId}` : null;
  const formats = [...new Set(book.files.map((f) => f.format))];

  return (
    <Link href={`/read/${book.id}`} className="group block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-[9px] shadow-[0_4px_16px_rgba(25,29,68,.10)] transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_12px_40px_rgba(25,29,68,.20)]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={book.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full flex-col justify-end p-3.5 text-white"
            style={{ background: `linear-gradient(150deg, ${a}, ${b})` }}
          >
            <div className="text-[14.5px] font-bold leading-tight drop-shadow">{book.title}</div>
            <div className="mt-1 text-[10.5px] opacity-80">{book.authors[0] ?? '—'}</div>
          </div>
        )}

        {/* หลายฟอร์แมต = การ์ดเดียว แสดงป้ายทุกฟอร์แมตที่มี เหมือน Calibre */}
        <div className="absolute right-2 top-2 flex gap-1">
          {formats.map((f) => (
            <span
              key={f}
              className="rounded bg-black/50 px-1.5 py-0.5 text-[8.5px] font-bold tracking-wider text-white backdrop-blur"
            >
              {f.toUpperCase()}
            </span>
          ))}
        </div>

        {book.percent > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/25">
            <div className="h-full bg-accent" style={{ width: `${book.percent}%` }} />
          </div>
        )}
      </div>

      <div className="pt-2.5">
        <div className="line-clamp-2 text-[12.8px] font-semibold leading-snug">{book.title}</div>
        <div className="mt-0.5 truncate text-[11.2px] text-muted">{book.authors.join(', ') || '—'}</div>
        {book.series && (
          <div className="mt-0.5 truncate text-[10.5px] text-muted">
            {book.series.name} #{book.series.index}
          </div>
        )}
        {book.percent > 0 && (
          <div className="mt-0.5 text-[10.5px] font-semibold text-accent-d">
            อ่านแล้ว {Math.round(book.percent)}%
          </div>
        )}
      </div>
    </Link>
  );
}
