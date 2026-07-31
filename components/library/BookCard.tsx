'use client';

import { useState } from 'react';
import Link from 'next/link';
import TiltCard from '@/components/ui/TiltCard';
import Book3D from '@/components/ui/Book3D';
import { FormatTag } from '@/components/ui/Tag';
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

export default function BookCard({
  book, badge,
}: {
  book: Book;
  /** ป้ายเสริมมุมซ้ายบน เช่น เลขเล่มในหน้าชุดหนังสือ */
  badge?: React.ReactNode;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [a, b] = PALETTES[hashOf(book.id) % PALETTES.length];
  const cover = book.coverFileId && !coverFailed ? `/api/drive/file/${book.coverFileId}` : null;
  const formats = [...new Set(book.files.map((f) => f.format))];
  // ความหนาผันตามขนาดไฟล์ — ทุกเล่มหนาเท่ากันจะดูเป็นของปลอมทันที
  const bytes = book.files.reduce((n, f) => n + (f.size || 0), 0);
  const depth = Math.round(24 + Math.min(1, Math.log10(Math.max(bytes, 1) / 3e5 + 1) / 1.6) * 26);

  return (
    <Link href={`/read/${book.id}`} className="group block">
      <TiltCard className="rounded-[9px]">
        {/* ป้ายต่าง ๆ ต้องอยู่นอกกล่อง overflow-hidden
            เพราะ overflow-hidden ตัด preserve-3d ทิ้ง ลูกข้างในจะไม่ได้ความลึก */}
        <div className="d3 relative aspect-[2/3]">
          <Book3D title={book.title} color={a} colorDark={b} depth={depth}
            cover={
              cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt={book.title}
                  loading="lazy"
                  decoding="async"
                  onError={() => setCoverFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="flex h-full flex-col justify-end p-3.5 text-white"
                  style={{ background: `linear-gradient(150deg, ${a}, ${b})` }}
                >
                  <div className="text-[14.5px] font-bold leading-tight drop-shadow">{book.title}</div>
                  <div className="mt-1 text-[10.5px] opacity-80">{book.authors[0] ?? '—'}</div>
                </div>
              )
            }
          >
            {book.percent > 0 && (
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/25">
                <div className="h-full bg-accent" style={{ width: `${book.percent}%` }} />
              </div>
            )}
          </Book3D>

          {badge && (
            <div
              className="pointer-events-none absolute -left-1.5 -top-1.5"
              style={{ transform: 'translateZ(38px)' }}
            >
              {badge}
            </div>
          )}
        </div>
      </TiltCard>

      <div className="pt-2.5">
        <div className="mb-1 flex flex-wrap gap-1">
          {formats.map((f) => <FormatTag key={f} format={f} />)}
        </div>
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
