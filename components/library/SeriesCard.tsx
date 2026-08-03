'use client';

import Link from 'next/link';
import TiltCard from '@/components/ui/TiltCard';
import Book3D from '@/components/ui/Book3D';
import { CountTag, DoneTag, FormatTag } from '@/components/ui/Tag';
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
  const formats = [...new Set(books.flatMap((x) => x.files.map((f) => f.format)))];
  const avg = books.reduce((s, x) => s + x.percent, 0) / books.length;

  return (
    <Link href={`/series/${encodeURIComponent(name)}`} className="group block">
      <TiltCard className="rounded-[9px]">
        <div className="d3 relative aspect-[2/3]">
          {/* เล่มที่ซ้อนอยู่ข้างหลัง ถอยลึกคนละระยะเพื่อให้เกิด parallax ตอนเอียง */}
          <div
            className="absolute inset-y-2 left-3 right-[-7px] rounded-[9px] bg-line/70"
            style={{ transform: 'translateZ(-38px)' }}
          />
          <div
            className="absolute inset-y-1 left-1.5 right-[-3px] rounded-[9px] bg-line"
            style={{ transform: 'translateZ(-26px)' }}
          />

          <Book3D title={name} color={a} colorDark={b} depth={40}
            cover={
              cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt={name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full flex-col justify-end p-3.5 text-white"
                  style={{ background: `linear-gradient(150deg, ${a}, ${b})` }}
                >
                  <div className="text-[14.5px] font-bold leading-tight drop-shadow">{name}</div>
                </div>
              )
            }
          >

          </Book3D>

        </div>
      </TiltCard>

      <div className="mt-2.5 h-[3px] w-full rounded-full bg-line">
        {inProgress && <div className="h-full rounded-full bg-amber" style={{ width: `${avg}%` }} />}
      </div>

      <div className="pt-2">
        <div className="truncate text-[11.2px] text-muted">{authors.join(', ') || '—'}</div>
        <div className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug">{name}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <CountTag>{books.length} เล่ม</CountTag>
          {readCount > 0 && <DoneTag>อ่านจบ {readCount}</DoneTag>}
          {formats.map((f) => <FormatTag key={f} format={f} />)}
        </div>
      </div>
    </Link>
  );
}
