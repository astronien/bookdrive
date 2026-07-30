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

/** ชุดหนังสือหลายเล่ม — แสดงเป็นการ์ดซ้อนกัน คลิกเข้าไปเลือกเล่ม */
export default function SeriesCard({ name, books }: { name: string; books: Book[] }) {
  const [a, b] = PALETTES[hashOf(name) % PALETTES.length];
  const first = books.find((x) => x.coverFileId) ?? books[0];
  const cover = first?.coverFileId ? `/api/drive/file/${first.coverFileId}` : null;

  const readCount = books.filter((x) => x.percent >= 95).length;
  const inProgress = books.some((x) => x.percent > 0 && x.percent < 95);
  const authors = [...new Set(books.flatMap((x) => x.authors))];

  return (
    <Link href={`/series/${encodeURIComponent(name)}`} className="group block">
      <div className="relative aspect-[2/3]">
        {/* การ์ดซ้อนด้านหลัง สื่อว่ามีหลายเล่ม */}
        <div className="absolute inset-y-2 left-3 right-[-6px] rounded-[9px] bg-line/70 transition group-hover:translate-x-1" />
        <div className="absolute inset-y-1 left-1.5 right-[-3px] rounded-[9px] bg-line transition group-hover:translate-x-0.5" />

        <div className="relative h-full overflow-hidden rounded-[9px] shadow-[0_4px_16px_rgba(25,29,68,.10)] transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_12px_40px_rgba(25,29,68,.20)]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full flex-col justify-end p-3.5 text-white"
              style={{ background: `linear-gradient(150deg, ${a}, ${b})` }}
            >
              <div className="text-[14.5px] font-bold leading-tight drop-shadow">{name}</div>
            </div>
          )}

          <span className="absolute left-2 top-2 rounded bg-navy/85 px-1.5 py-0.5 text-[9.5px] font-bold text-white backdrop-blur">
            {books.length} เล่ม
          </span>

          {readCount > 0 && (
            <span className="absolute right-2 top-2 rounded bg-accent/90 px-1.5 py-0.5 text-[9.5px] font-bold text-[#08312e]">
              อ่านจบ {readCount}
            </span>
          )}

          {inProgress && (
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/25">
              <div
                className="h-full bg-accent"
                style={{ width: `${books.reduce((s, x) => s + x.percent, 0) / books.length}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="pt-2.5">
        <div className="line-clamp-2 text-[12.8px] font-semibold leading-snug">{name}</div>
        <div className="mt-0.5 truncate text-[11.2px] text-muted">{authors.join(', ') || '—'}</div>
      </div>
    </Link>
  );
}
