'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useLibrary } from '@/lib/store/library';
import type { Book } from '@/lib/types';
import { FormatTag } from '@/components/ui/Tag';

// three.js แตะ window ตรงๆ และ bundle ใหญ่ — ปิด SSR และโหลดเฉพาะตอนเข้าหน้านี้
const RoomScene = dynamic(() => import('@/components/room/RoomScene'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-[#12101a] text-[13px] text-white/60">
      กำลังโหลดฉาก 3 มิติ…
    </div>
  ),
});

export default function RoomPage() {
  const { books, load, loading } = useLibrary();
  const [picked, setPicked] = useState<Book | null>(null);

  useEffect(() => { if (!books.length) load(); }, [books.length, load]);

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-white/10 bg-[#12101a] px-3 text-white md:h-14 md:gap-3.5 md:px-5">
        <Link href="/library" className="text-[13px] text-white/60 hover:text-white">← ไลบรารี</Link>
        <div className="flex-1 text-center text-[13px] font-semibold">ห้องอ่านหนังสือ</div>
        <span className="hidden text-[11.5px] text-white/40 sm:inline">
          {books.length > 260 ? `แสดง 260 จาก ${books.length} เล่ม` : `${books.length} เล่ม`}
        </span>
      </header>

      <div className="relative flex-1">
        {loading ? (
          <div className="grid h-full place-items-center bg-[#12101a] text-[13px] text-white/60">กำลังโหลดไลบรารี…</div>
        ) : !books.length ? (
          <div className="grid h-full place-items-center bg-[#12101a] px-6 text-center">
            <div>
              <p className="font-semibold text-white">ชั้นหนังสือยังว่างอยู่</p>
              <p className="mt-2 text-[13px] text-white/60">เชื่อม Calibre library แล้วสแกนก่อน</p>
              <Link
                href="/library"
                className="mt-4 inline-block h-[38px] rounded-[10px] bg-brand px-4 text-[13.5px] font-semibold leading-[38px] text-white"
              >
                ไปหน้าไลบรารี
              </Link>
            </div>
          </div>
        ) : (
          <RoomScene books={books} onOpen={setPicked} />
        )}

        {/* หยิบหนังสือขึ้นมาดู */}
        {picked && (
          <div
            className="absolute inset-0 z-20 grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
            onClick={() => setPicked(null)}
          >
            <div
              className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-4">
                {picked.coverFileId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/drive/file/${picked.coverFileId}`}
                    alt={picked.title}
                    className="h-[150px] w-[100px] shrink-0 rounded-lg object-cover shadow"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-bold leading-snug">{picked.title}</h3>
                  <p className="mt-1 text-[12.5px] text-muted">{picked.authors.join(', ') || '—'}</p>
                  {picked.series && (
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {picked.series.name} #{picked.series.index}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...new Set(picked.files.map((f) => f.format))].map((f) => (
                      <FormatTag key={f} format={f} />
                    ))}
                  </div>
                  {picked.percent > 0 && (
                    <p className="mt-2 text-[11.5px] font-semibold text-accent-d">
                      อ่านแล้ว {Math.round(picked.percent)}%
                    </p>
                  )}
                </div>
              </div>

              {picked.description && (
                <p className="mt-4 line-clamp-4 text-[12.5px] leading-relaxed text-muted">
                  {picked.description.replace(/<[^>]+>/g, '')}
                </p>
              )}

              <div className="mt-5 flex gap-2">
                <Link
                  href={`/read/${picked.id}`}
                  className="h-[40px] flex-1 rounded-[10px] bg-brand text-center text-[13.5px] font-semibold leading-[40px] text-white transition hover:bg-brand-d"
                >
                  อ่านเล่มนี้
                </Link>
                <button
                  onClick={() => setPicked(null)}
                  className="h-[40px] rounded-[10px] border border-line px-4 text-[13.5px] font-semibold transition hover:bg-shell"
                >
                  วางกลับ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
