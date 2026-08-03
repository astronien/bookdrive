'use client';

/* ปกมาจาก /api/drive/file/{id} ซึ่ง next/image optimize ไม่ได้อยู่แล้ว (ต้องมี token)
   ปิดกฎทั้งไฟล์ตรงนี้ เพราะคอมเมนต์ต่อบรรทัดใช้ไม่ได้ใน JSX children */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
 *
 * ส่วนหัวทำเป็น hero มืดแบบหน้าแนะนำของ Netflix: ปกเป็นภาพพื้นเต็มกรอบ
 * ข้อความขาวชิดซ้าย ปุ่มเป็นแคปซูล — ไม่ใช่ปกจาง ๆ บนพื้นขาวแบบเดิม
 */
export default function BookSheet({ book, onClose }: { book: Book; onClose: () => void }) {
  const router = useRouter();
  const setPreferredFormat = useLibrary((s) => s.setPreferredFormat);
  const saveProgress = useLibrary((s) => s.saveProgress);
  const [busy, setBusy] = useState(false);
  // ต้องรอ mount ก่อนถึงจะมี document ให้ portal ใช้ — SSR ไม่มี DOM
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const formats = useMemo(() => [...new Set(book.files.map((f) => f.format))], [book.files]);
  const active = pickFile(book)?.format;
  const cover = book.coverFileId ? `/api/drive/file/${book.coverFileId}` : null;
  const pct = Math.min(100, Math.round(book.percent ?? 0));

  // แถวข้อมูลสั้น ๆ คั่นด้วยจุดใต้ชื่อเรื่อง เอาเฉพาะที่มีค่าจริง
  const chips = [
    book.series ? `เล่ม ${book.series.index}` : null,
    book.publishedDate?.slice(0, 4),
    book.language?.toUpperCase(),
    book.publisher,
  ].filter(Boolean) as string[];

  const plain = book.description
    ? book.description.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim()
    : '';

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

  if (!mounted) return null;

  /* ยิงเข้า document.body ผ่าน portal — การ์ดหนังสืออยู่ใน TiltCard ที่มี transform
     ซึ่งทำให้ position:fixed ยึดกับการ์ดแทนที่จะยึดกับ viewport แล้ว modal จะไปโผล่
     ในกรอบการ์ดใบเล็ก ๆ แทนที่จะเต็มจอ */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={book.title}
    >
      <button
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[3px]"
      />

      <div
        className="relative flex w-full flex-col overflow-hidden bg-white shadow-2xl
                   sm:max-h-[88vh] sm:w-[min(820px,100%)] sm:rounded-2xl"
      >
        <button
          onClick={onClose}
          aria-label="ปิด"
          className="absolute right-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-full
                     bg-black/45 text-white backdrop-blur transition hover:bg-black/70"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="overflow-y-auto overscroll-contain">
          {/* ---------- hero ----------
              ปก 2:3 ยัดลงกรอบกว้างแล้วโดน crop เหลือแถบกลาง — เอาแบบนั้นตามที่สั่ง
              ตัวปกเต็ม ๆ ไปอยู่เป็นรูปเล็กเหนือชื่อเรื่องแทน จะได้ยังเห็นทั้งใบ */}
          <div className="relative isolate min-h-[330px] bg-[#0b0d14] sm:min-h-[360px]">
            {cover && (
              <img
                src={cover}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover object-center brightness-[0.85]"
              />
            )}

            {/* ผ้าคลุมสองทิศ — ซ้ายไปขวากันตัวหนังสือจมภาพ ล่างขึ้นบนกันปุ่มจมภาพ
                ถ้าใช้ทิศเดียวจะมีปกบางเล่มที่สว่างจัดตรงมุมแล้วอ่านไม่ออก

                ค่าความทึบต้องคิดแบบคูณกัน ไม่ใช่บวก เพราะสองชั้นนี้ทับกัน
                ที่มุมซ้ายล่างซึ่งเป็นที่อยู่ของข้อความ ความสว่างที่เหลือ =
                brightness × (1 - ทึบซ้าย) × (1 - ทึบล่าง)
                ของเดิม 0.5 × 0 × 0 = ดำสนิท มองไม่เห็นปกเลย
                ของใหม่ 0.85 × 0.30 × 0.55 ≈ 0.14 — ยังเห็นภาพแต่ตัวหนังสือขาวยังอ่านออก */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

            <div className="relative z-10 flex min-h-[330px] flex-col justify-end p-5 sm:min-h-[360px] sm:p-8">
              <div className="max-w-[min(100%,520px)] [text-shadow:0_1px_4px_rgb(0_0_0/0.85)]">
                {/* ปกใบเล็กเหนือชื่อเรื่อง — ภาพพื้นหลังโดน crop จนดูไม่ออกว่าปกหน้าตายังไง
                    ใบนี้เลยเป็นตัวที่ให้เห็นทั้งใบจริง ๆ จงใจทำเล็กไม่ให้แย่งที่ชื่อเรื่อง */}
                <div className="mb-3 flex items-end gap-3">
                  {cover && (
                    <img
                      src={cover}
                      alt={book.title}
                      className="w-[52px] shrink-0 rounded-md object-cover shadow-xl
                                 ring-1 ring-white/25 sm:w-[62px]"
                      style={{ aspectRatio: '2 / 3' }}
                    />
                  )}
                  <div className="flex flex-wrap gap-1.5 pb-0.5">
                    {formats.map((f) => <FormatTag key={f} format={f} />)}
                  </div>
                </div>

                <h2 className="text-[24px] font-extrabold leading-tight text-white drop-shadow-lg sm:text-[30px]">
                  {book.title}
                </h2>

                {book.authors.length > 0 && (
                  <div className="mt-1.5 text-[13.5px] font-semibold text-white/90">
                    {book.authors.join(', ')}
                  </div>
                )}

                {chips.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold text-white/75">
                    {chips.map((c, i) => (
                      <span key={c + i} className="flex items-center gap-2">
                        {i > 0 && <span className="text-white/40">•</span>}
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {plain && (
                  <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-white/85">{plain}</p>
                )}

                {pct > 0 && (
                  <div className="mt-4 max-w-[300px]">
                    <div className="mb-1 flex justify-between text-[11px] font-semibold text-white/80">
                      <span>อ่านไปแล้ว</span><span>{pct}%</span>
                    </div>
                    <div className="h-[4px] w-full rounded-full bg-white/25">
                      <div className="h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                {/* ปุ่มแคปซูล ขาวทึบ = ปุ่มหลัก / เทาโปร่ง = ปุ่มรอง ตามภาพต้นแบบ */}
                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => router.push(`/read/${book.id}`)}
                    className="inline-flex h-[44px] items-center gap-2 rounded-full bg-white px-6
                               text-[14px] font-bold text-[#0b0d14] shadow-lg transition hover:bg-white/85 [text-shadow:none]"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M6 4.5v15l13-7.5z" />
                    </svg>
                    {pct > 0 ? `อ่านต่อ · ${pct}%` : 'เริ่มอ่าน'}
                  </button>

                  <OfflineButton
                    book={book}
                    className="!h-[44px] !rounded-full !border-0 !bg-white/20 !px-5 !text-white
                               backdrop-blur transition hover:!bg-white/30"
                  />

                  {pct > 0 && (
                    <button
                      onClick={reset}
                      disabled={busy}
                      className="h-[44px] rounded-full bg-white/10 px-4 text-[13px] font-semibold
                                 text-white/80 backdrop-blur transition hover:bg-white/20 disabled:opacity-50"
                    >
                      รีเซ็ต
                    </button>
                  )}
                </div>
              </div>
            </div>

            {book.series && (
              <Link
                href={`/series/${encodeURIComponent(book.series.name)}`}
                onClick={onClose}
                className="absolute bottom-5 right-5 z-20 hidden max-w-[240px] truncate rounded-full
                           bg-black/55 px-3.5 py-2 text-[12px] font-semibold text-white/90
                           backdrop-blur transition hover:bg-black/80 sm:block"
              >
                📚 {book.series.name} →
              </Link>
            )}
          </div>

          {/* ---------- เนื้อหาส่วนล่าง พื้นขาวตามธีมเดิมของแอป ---------- */}
          <div className="px-5 pb-7 pt-6 sm:px-8">
            {formats.length > 1 && (
              <div className="mb-6">
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

            {plain && (
              <div className="mb-6">
                <div className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-muted">เรื่องย่อ</div>
                {/* metadata.opf ของ Calibre ใส่ HTML มาด้วย (<p>, <br>) แต่มาจากไฟล์ของผู้ใช้เอง
                    จึงล้าง tag ทิ้งแล้วแสดงเป็นข้อความล้วน ปลอดภัยกว่า dangerouslySetInnerHTML */}
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink/85">{plain}</p>
              </div>
            )}

            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
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
    </div>,
    document.body
  );
}
