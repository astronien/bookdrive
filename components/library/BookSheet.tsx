'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OfflineButton from '@/components/OfflineButton';
import { FormatTag } from '@/components/ui/Tag';
import { useLibrary } from '@/lib/store/library';
import type { Book, BookFormat } from '@/lib/types';
import { pickFile } from '@/lib/types';

/**
 * รายละเอียดหนังสือ — ชั้นเดียวใช้ได้สองหน้าตา
 * จอใหญ่  = modal ลอยกลางจอ ไลบรารียังอยู่ข้างหลัง ปิดแล้ว scroll ไม่หาย
 * มือถือ  = full-screen sheet เลื่อนขึ้นจากล่าง เพราะ modal เล็ก ๆ บนจอแคบอ่านไม่ออก
 *
 * ทั้งสองแบบใช้ DOM ชุดเดียวกัน ต่างกันแค่ Tailwind breakpoint — ไม่มี branch ใน JS
 * จึงไม่มีปัญหา hydration mismatch แบบที่เกิดถ้าเช็ค window.innerWidth ตอน render
 */
export default function BookSheet({ book, onClose }: { book: Book; onClose: () => void }) {
  const router = useRouter();
  const setPreferredFormat = useLibrary((s) => s.setPreferredFormat);
  const saveProgress = useLibrary((s) => s.saveProgress);
  const [busy, setBusy] = useState(false);

  const formats = useMemo(
    () => [...new Set(book.files.map((f) => f.format))],
    [book.files]
  );
  const active = pickFile(book)?.format;
  const cover = book.coverFileId ? `/api/drive/file/${book.coverFileId}` : null;
  const pct = Math.min(100, Math.round(book.percent ?? 0));

  // Esc ปิด และล็อกไม่ให้หน้าข้างหลังเลื่อนตาม — บนมือถือถ้าไม่ล็อก
  // การปัดใน sheet จะไปเลื่อนไลบรารีข้างหลังแทน
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  async function reset() {
    if (!confirm('ล้างความคืบหน้าของเล่มนี้ให้กลับไปเป็น 0%?')) return;
    setBusy(true);
    await saveProgress(book.id, { percent: 0, epubCfi: undefined, pdfPage: undefined, pdfScrollTop: undefined });
    setBusy(false);
  }

  const meta: [string, string | undefined][] = [
    ['ผู้เขียน', book.authors.join(', ') || undefined],
    ['ชุดหนังสือ', book.series ? `${book.series.name} เล่ม ${book.series.index}` : undefined],
    ['สำนักพิมพ์', book.publisher],
    ['ปีที่พิมพ์', book.publishedDate?.slice(0, 4)],
    ['ภาษา', book.language],
    ['ISBN', book.isbn],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={book.title}
    >
      {/* ฉากหลัง — คลิกที่ว่างเพื่อปิด เป็นพฤติกรรมที่คนคาดหวังจาก modal */}
      <button
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-navy/45 backdrop-blur-[2px]"
      />

      <div
        className="relative flex w-full flex-col overflow-hidden bg-white shadow-2xl
                   sm:max-h-[86vh] sm:w-[min(760px,100%)] sm:rounded-2xl"
      >
        {/* ---------- ปกจาง ๆ เป็นพื้นหลังส่วนหัว ----------
            เบลอแรงและกดความทึบลงเพื่อให้ตัวหนังสือดำบนขาวยังอ่านออก
            ไล่เฉดลงไปหาขาวด้านล่าง ไม่งั้นขอบภาพจะตัดเป็นเส้นตรงดูแข็ง */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[340px] overflow-hidden">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              aria-hidden
              className="h-full w-full scale-125 object-cover opacity-[0.22] blur-2xl saturate-150"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/70 to-white" />
        </div>

        <button
          onClick={onClose}
          aria-label="ปิด"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full
                     bg-white/80 text-ink shadow-sm backdrop-blur transition hover:bg-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="relative overflow-y-auto overscroll-contain px-5 pb-6 pt-6 sm:px-7 sm:pt-7">
          <div className="flex gap-4 sm:gap-6">
            {/* ปกจริง ขนาดเล็กลงบนมือถือเพื่อไม่ให้ดันเนื้อหาตกจอ */}
            <div className="w-[104px] shrink-0 sm:w-[150px]">
              <div className="aspect-[2/3] overflow-hidden rounded-lg bg-shell shadow-lg ring-1 ring-black/5">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={book.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center p-2 text-center text-[11px] font-semibold text-muted">
                    {book.title}
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-[19px] font-extrabold leading-snug sm:text-[23px]">{book.title}</h2>
              {book.authors.length > 0 && (
                <div className="mt-1 text-[13px] text-muted">{book.authors.join(', ')}</div>
              )}

              {book.series && (
                <Link
                  href={`/series/${encodeURIComponent(book.series.name)}`}
                  onClick={onClose}
                  className="mt-2 inline-block text-[12.5px] font-semibold text-brand hover:underline"
                >
                  {book.series.name} · เล่ม {book.series.index} →
                </Link>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {formats.map((f) => <FormatTag key={f} format={f} />)}
              </div>

              {pct > 0 && (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-[11.5px] font-semibold text-muted">
                    <span>อ่านไปแล้ว</span><span>{pct}%</span>
                  </div>
                  <div className="h-[5px] w-full rounded-full bg-line">
                    <div className="h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ---------- เลือกฟอร์แมต ----------
              โผล่เฉพาะตอนมีให้เลือกจริง เล่มที่มีไฟล์เดียวเห็นปุ่มเดียวก็สับสนเปล่า ๆ */}
          {formats.length > 1 && (
            <div className="mt-6">
              <div className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-muted">
                เปิดด้วยฟอร์แมต
              </div>
              <div className="flex flex-wrap gap-2">
                {formats.map((f) => (
                  <button
                    key={f}
                    onClick={() => setPreferredFormat(book.id, f as BookFormat)}
                    className={`h-9 rounded-[10px] border px-3.5 text-[12.5px] font-bold uppercase transition ${
                      f === active
                        ? 'border-brand bg-brand text-white'
                        : 'border-line bg-white hover:bg-shell'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---------- ปุ่มหลัก ----------
              บนมือถือปักไว้ล่างสุดแบบ sticky เพราะเรื่องย่อยาว ๆ จะดันปุ่มตกจอไป */}
          <div className="sticky bottom-0 z-10 -mx-5 mt-6 flex flex-wrap gap-2 border-t border-line
                          bg-white/95 px-5 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
            <button
              onClick={() => router.push(`/read/${book.id}`)}
              className="h-[42px] flex-1 rounded-[10px] bg-brand px-6 text-[13.5px] font-bold text-white
                         transition hover:brightness-110 sm:flex-none"
            >
              {pct > 0 ? `อ่านต่อ · ${pct}%` : 'เริ่มอ่าน'}
            </button>
            <OfflineButton book={book} className="h-[42px]" />
            {pct > 0 && (
              <button
                onClick={reset}
                disabled={busy}
                className="h-[42px] rounded-[10px] border border-line px-4 text-[13px] font-semibold
                           text-muted transition hover:bg-shell disabled:opacity-50"
              >
                รีเซ็ต
              </button>
            )}
          </div>

          {book.description && (
            <div className="mt-6">
              <div className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-muted">เรื่องย่อ</div>
              {/* metadata.opf ของ Calibre ใส่ HTML มาด้วย (<p>, <br>) แต่มาจากไฟล์ของผู้ใช้เอง
                  จึงล้าง tag ทิ้งแล้วแสดงเป็นข้อความล้วน ปลอดภัยกว่า dangerouslySetInnerHTML */}
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink/85">
                {book.description.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim()}
              </p>
            </div>
          )}

          <div className="mt-6 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {meta.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex gap-2 border-b border-line/70 py-1.5 text-[12.5px]">
                <span className="w-[74px] shrink-0 text-muted">{k}</span>
                <span className="min-w-0 flex-1 break-words font-medium">{v}</span>
              </div>
            ))}
          </div>

          {book.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {book.tags.map((t) => (
                <span key={t} className="rounded-full bg-shell px-2.5 py-1 text-[11.5px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 text-[11px] text-muted/80">
            {book.files.map((f) => `${f.format.toUpperCase()} · ${(f.size / 1048576).toFixed(1)} MB`).join('   ')}
          </div>
        </div>
      </div>
    </div>
  );
}
