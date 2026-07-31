'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/lib/store/library';
import { db } from '@/lib/db/idb';
import { pickFile, type BookFormat, type Annotation, type Progress } from '@/lib/types';
import { DEFAULT_PREFS, FONT_STACK, THEMES, fmtDuration, loadPrefs, savePrefs, type ReaderPrefs } from '@/lib/reader/prefs';
import { HIGHLIGHT_COLORS, listAnnotations, removeAnnotation } from '@/lib/reader/annotations';
import OfflineButton from '@/components/OfflineButton';
import type { EpubHandle, SearchHit, TocItem } from '@/components/reader/EpubReader';
import type { PdfOutlineItem } from '@/components/reader/PdfReader';

// import ตรง ๆ ไม่ผ่าน next/dynamic เพราะ EpubReader ต้องรับ ref
// (next/dynamic ห่อ component อีกชั้น การส่ง ref ผ่านเข้าไปไม่การันตี)
// ทั้งสองตัวปลอดภัยกับ SSR อยู่แล้ว เพราะ epubjs/pdfjs ถูก import ข้างใน effect เท่านั้น
import EpubReader from '@/components/reader/EpubReader';
import PdfReader from '@/components/reader/PdfReader';

type Panel = 'toc' | 'prefs' | 'search' | 'notes' | null;

export default function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { books, load, setPreferredFormat } = useLibrary();

  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [panel, setPanel] = useState<Panel>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [outline, setOutline] = useState<PdfOutlineItem[]>([]);
  const [pdfPages, setPdfPages] = useState(0);
  const [chapter, setChapter] = useState('');
  const [percent, setPercent] = useState(0);
  const [anns, setAnns] = useState<Annotation[]>([]);
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [readMs, setReadMs] = useState(0);
  const [chrome, setChrome] = useState(true);

  const epubRef = useRef<EpubHandle>(null);
  const pdfGoto = useRef<((p: number) => void) | null>(null);

  useEffect(() => { setPrefs(loadPrefs()); }, []);
  useEffect(() => { if (!books.length) load(); }, [books.length, load]);

  const book = books.find((b) => b.id === id);
  const file = useMemo(() => (book ? pickFile(book) : undefined), [book]);

  useEffect(() => {
    if (book) { setPercent(book.percent); listAnnotations(book.id).then(setAnns); }
  }, [book?.id]);

  const update = useCallback((patch: Partial<ReaderPrefs>) => {
    setPrefs((p) => { const n = { ...p, ...patch }; savePrefs(n); return n; });
  }, []);

  // ---------- นับเวลาอ่านจริง ----------
  useEffect(() => {
    if (!book) return;
    const start = Date.now();
    let acc = 0;
    let lastTick = start;

    const flush = async () => {
      const now = Date.now();
      // นับเฉพาะตอนแท็บอยู่หน้าจอ ไม่งั้นเปิดค้างข้ามคืนแล้วได้ 8 ชั่วโมง
      if (document.visibilityState === 'visible') acc += now - lastTick;
      lastTick = now;
      if (acc < 5000) return;
      const row = await db.meta.get(`progress/${book.id}`);
      const base = (row?.data as Progress | undefined)?.totalReadingMs ?? 0;
      useLibrary.getState().saveProgress(book.id, { totalReadingMs: base + acc });
      setReadMs(base + acc);
      acc = 0;
    };

    const iv = setInterval(flush, 30_000);
    document.addEventListener('visibilitychange', flush);
    db.meta.get(`progress/${book.id}`).then((r) =>
      setReadMs((r?.data as Progress | undefined)?.totalReadingMs ?? 0)
    );

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', flush);
      flush();
    };
  }, [book?.id]);

  // ---------- คีย์บอร์ด ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') epubRef.current?.next();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') epubRef.current?.prev();
      else if (e.key === ' ') { e.preventDefault(); epubRef.current?.next(); }
      else if (e.key === 'Escape') { setPanel(null); setSel(null); }
      else if (e.key === 't') setPanel((p) => (p === 'toc' ? null : 'toc'));
      else if (e.key === 'f') { e.preventDefault(); setPanel('search'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!book) return <div className="grid h-full place-items-center text-muted">กำลังโหลด…</div>;
  if (!file) return <div className="grid h-full place-items-center text-muted">เล่มนี้ไม่มีไฟล์ที่เปิดได้</div>;

  const formats = [...new Set(book.files.map((f) => f.format))];
  const t = THEMES[prefs.theme];
  const isEpub = file.format === 'epub';
  const isPdf = file.format === 'pdf';
  const nav = isPdf ? outline.map((o) => ({ label: o.title, href: String(o.page), depth: 0 })) : toc;

  async function runSearch() {
    if (!epubRef.current || q.trim().length < 2) return;
    setSearching(true);
    setHits(await epubRef.current.search(q.trim()));
    setSearching(false);
  }

  return (
    <div className="relative flex h-full flex-col" style={{ background: t.bg, color: t.fg }}>
      {/* ---------- แถบบน ---------- */}
      <header
        className={`flex h-[52px] shrink-0 items-center gap-1.5 border-b px-3 transition-opacity ${chrome ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        style={{ borderColor: 'rgba(128,128,128,.18)' }}
      >
        <Link href="/library" aria-label="กลับไปไลบรารี"
          className="shrink-0 rounded px-2 py-1 text-[13px] opacity-70 hover:opacity-100">
          <span className="md:hidden">←</span><span className="hidden md:inline">← ไลบรารี</span>
        </Link>

        <button onClick={() => setPanel(panel === 'toc' ? null : 'toc')}
          className="shrink-0 rounded px-2 py-1 text-[12.5px] opacity-70 hover:opacity-100" title="สารบัญ (T)">สารบัญ</button>
        {isEpub && (
          <>
            <button onClick={() => setPanel(panel === 'search' ? null : 'search')}
              className="hidden shrink-0 rounded px-2 py-1 text-[12.5px] opacity-70 hover:opacity-100 sm:block" title="ค้นหาในเล่ม (F)">ค้นหา</button>
            <button onClick={() => setPanel(panel === 'notes' ? null : 'notes')}
              className="hidden shrink-0 rounded px-2 py-1 text-[12.5px] opacity-70 hover:opacity-100 sm:block">
              ไฮไลต์{anns.length ? ` (${anns.length})` : ''}
            </button>
          </>
        )}

        <div className="min-w-0 flex-1 px-2 text-center">
          <div className="truncate text-[12.5px] font-semibold md:text-[13px]">{book.title}</div>
          {chapter && <div className="hidden truncate text-[10.5px] opacity-55 sm:block">{chapter}</div>}
        </div>

        {formats.length > 1 && (
          <div className="flex shrink-0 gap-0.5 rounded-lg bg-black/10 p-0.5">
            {formats.map((f) => (
              <button key={f} onClick={() => setPreferredFormat(book.id, f as BookFormat)}
                className={`rounded-md px-2 py-1 text-[10.5px] font-bold tracking-wide ${f === file.format ? 'bg-white text-ink shadow-sm' : 'opacity-60'}`}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        <button onClick={() => setPanel(panel === 'prefs' ? null : 'prefs')}
          className="shrink-0 rounded px-2 py-1 text-[14px] font-semibold opacity-70 hover:opacity-100">Aa</button>
        <button onClick={() => setChrome(false)} title="ซ่อนแถบเครื่องมือ"
          className="hidden shrink-0 rounded px-2 py-1 text-[12.5px] opacity-70 hover:opacity-100 sm:block">⤢</button>
      </header>

      {/* ---------- เนื้อหา ---------- */}
      <div className="relative min-h-0 flex-1" onClick={() => !chrome && setChrome(true)}>
        {isEpub ? (
          <EpubReader
            ref={epubRef} book={book} file={file} prefs={prefs}
            onToc={setToc} onAnnotations={setAnns} onSelection={setSel}
            onLocation={({ percent: p, chapter: c }) => { setPercent(p); setChapter(c); }}
          />
        ) : isPdf ? (
          <PdfReader book={book} file={file} prefs={prefs} gotoRef={pdfGoto}
            onOutline={setOutline} onPages={setPdfPages} />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-[13px] opacity-70">
            ยังอ่าน {file.format.toUpperCase()} ในแอปไม่ได้
            {formats.includes('epub') && <><br />เล่มนี้มี EPUB ด้วย สลับได้ที่ปุ่มด้านบน</>}
          </div>
        )}

        {/* ปุ่มพลิกหน้าซ้าย/ขวา — เล็งง่ายกว่ากดลูกศรบนคีย์บอร์ดตอนถือแท็บเล็ต */}
        {isEpub && prefs.flow === 'paginated' && (
          <>
            <button onClick={() => epubRef.current?.prev()} aria-label="หน้าก่อน"
              className="absolute left-0 top-0 flex h-full w-[16%] items-center opacity-0 transition hover:opacity-100 md:w-[9%]">
              <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-black/25 text-white">‹</span>
            </button>
            <button onClick={() => epubRef.current?.next()} aria-label="หน้าถัดไป"
              className="absolute right-0 top-0 flex h-full w-[16%] items-center opacity-0 transition hover:opacity-100 md:w-[9%]">
              <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-black/25 text-white">›</span>
            </button>
          </>
        )}

        {/* เมนูไฮไลต์ลอยเหนือข้อความที่เลือก */}
        {sel && (
          <div className="fixed z-30 -translate-x-1/2 -translate-y-full rounded-xl bg-navy p-1.5 shadow-2xl"
            style={{ left: sel.x, top: sel.y - 8 }}>
            <div className="flex items-center gap-1">
              {HIGHLIGHT_COLORS.map((c) => (
                <button key={c.key} title={c.label} onClick={() => epubRef.current?.highlight(c.key)}
                  className="h-7 w-7 rounded-full border-2 border-transparent transition hover:border-white"
                  style={{ background: c.hex }} />
              ))}
              <button onClick={() => { epubRef.current?.clearSelection(); setSel(null); }}
                className="ml-1 rounded px-2 text-[13px] text-white/70 hover:text-white">✕</button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- แถบล่าง ---------- */}
      <footer
        className={`flex h-[46px] shrink-0 items-center gap-3 border-t px-5 text-[11.5px] transition-opacity ${chrome ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        style={{ borderColor: 'rgba(128,128,128,.18)' }}
      >
        <span className="shrink-0 opacity-60">{isPdf && pdfPages ? `${pdfPages} หน้า` : 'อ่านไปแล้ว'}</span>
        <div className="h-1 flex-1 rounded bg-black/10">
          <div className="h-full rounded bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <span className="shrink-0 opacity-70">{Math.round(percent)}%</span>
        {readMs > 0 && <span className="hidden shrink-0 opacity-50 sm:inline">· {fmtDuration(readMs)}</span>}
      </footer>

      {/* ---------- แผงด้านข้าง ---------- */}
      {panel && (
        <>
          <button aria-label="ปิด" onClick={() => setPanel(null)} className="fixed inset-0 z-30 bg-black/25" />
          <aside className="fixed right-0 top-0 z-40 flex h-full w-full flex-col bg-white text-ink shadow-2xl sm:w-[330px]">
            <div className="flex h-[52px] shrink-0 items-center border-b border-line px-4">
              <b className="flex-1 text-[13.5px]">
                {panel === 'toc' && 'สารบัญ'}
                {panel === 'prefs' && 'การแสดงผล'}
                {panel === 'search' && 'ค้นหาในเล่ม'}
                {panel === 'notes' && 'ไฮไลต์ในเล่มนี้'}
              </b>
              <button onClick={() => setPanel(null)} className="px-2 text-muted hover:text-ink">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {panel === 'toc' && (
                nav.length ? nav.map((it, i) => (
                  <button key={i}
                    onClick={() => { isPdf ? pdfGoto.current?.(Number(it.href)) : epubRef.current?.goTo(it.href); setPanel(null); }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-shell"
                    style={{ paddingLeft: 12 + it.depth * 14 }}>
                    {it.label || '—'}
                  </button>
                )) : <p className="p-3 text-[13px] text-muted">เล่มนี้ไม่มีสารบัญ</p>
              )}

              {panel === 'search' && (
                <>
                  <div className="mb-3 flex gap-2">
                    <input value={q} onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                      placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร"
                      className="h-9 flex-1 rounded-lg border border-line bg-shell px-3 text-[13px] outline-none focus:border-accent focus:bg-white" />
                    <button onClick={runSearch} className="h-9 rounded-lg bg-accent px-3 text-[13px] font-semibold text-[#08312e]">หา</button>
                  </div>
                  {searching && <p className="px-2 text-[13px] text-muted">กำลังค้นทั้งเล่ม…</p>}
                  {!searching && hits && (
                    hits.length ? (
                      <>
                        <p className="px-2 pb-2 text-[11.5px] text-muted">พบ {hits.length} แห่ง</p>
                        {hits.map((h, i) => (
                          <button key={i} onClick={() => { epubRef.current?.goTo(h.cfi); setPanel(null); }}
                            className="mb-1 block w-full rounded-lg px-3 py-2 text-left text-[12.5px] leading-relaxed hover:bg-shell">
                            …{h.excerpt.trim()}…
                          </button>
                        ))}
                      </>
                    ) : <p className="px-2 text-[13px] text-muted">ไม่พบคำนี้ในเล่ม</p>
                  )}
                </>
              )}

              {panel === 'notes' && (
                anns.length ? anns.map((a) => (
                  <div key={a.id} className="mb-2 rounded-lg border-l-4 bg-shell p-3"
                    style={{ borderColor: HIGHLIGHT_COLORS.find((c) => c.key === a.color)?.hex }}>
                    <button onClick={() => { a.cfi && epubRef.current?.goTo(a.cfi); setPanel(null); }}
                      className="block text-left font-serif text-[12.8px] leading-relaxed">{a.text}</button>
                    <div className="mt-2 flex items-center gap-3 text-[10.5px] text-muted">
                      <span>{new Date(a.createdAt).toLocaleDateString('th-TH')}</span>
                      <button className="ml-auto hover:text-coral"
                        onClick={async () => { await removeAnnotation(book.id, a.id); setAnns(await listAnnotations(book.id)); }}>
                        ลบ
                      </button>
                    </div>
                  </div>
                )) : <p className="p-3 text-[13px] leading-relaxed text-muted">ยังไม่มีไฮไลต์ — ลากเลือกข้อความในหน้าอ่านแล้วเลือกสี</p>
              )}

              {panel === 'prefs' && (
                <div className="space-y-5 px-1">
                  <Section label="ออฟไลน์">
                    <OfflineButton book={book} className="w-full" />
                    <p className="mt-1.5 text-[11px] text-muted">
                      เก็บไฟล์ไว้ในเครื่องเพื่ออ่านตอนไม่มีเน็ต
                    </p>
                  </Section>

                  <Section label="ธีม">
                    <div className="grid grid-cols-4 gap-2">
                      {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((k) => (
                        <button key={k} onClick={() => update({ theme: k })}
                          className={`h-12 rounded-[9px] border-2 text-[10px] font-semibold ${prefs.theme === k ? 'border-accent' : 'border-line'}`}
                          style={{ background: THEMES[k].bg, color: THEMES[k].fg }}>
                          {THEMES[k].label}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section label="ฟอนต์">
                    <div className="flex gap-2">
                      {(['serif', 'sans', 'dyslexic'] as const).map((f) => (
                        <button key={f} onClick={() => update({ fontFamily: f })}
                          className={`h-9 flex-1 rounded-lg border text-[12px] ${prefs.fontFamily === f ? 'border-navy bg-navy text-white' : 'border-line'}`}
                          style={{ fontFamily: FONT_STACK[f] }}>
                          {f === 'serif' ? 'Serif' : f === 'sans' ? 'Sans' : 'Dyslexic'}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Slider label="ขนาดตัวอักษร" value={prefs.fontSize} min={13} max={34} unit="px"
                    onChange={(v) => update({ fontSize: v })} />
                  <Slider label="ระยะบรรทัด" value={prefs.lineHeight} min={1.2} max={2.4} step={0.05}
                    onChange={(v) => update({ lineHeight: v })} />
                  <Slider label="ความกว้างคอลัมน์" value={prefs.width} min={420} max={1100} step={20} unit="px"
                    onChange={(v) => update({ width: v })} />
                  <Slider label="ระยะขอบ" value={prefs.margin} min={0} max={110} step={5} unit="px"
                    onChange={(v) => update({ margin: v })} />

                  <Section label="การจัดหน้า">
                    <div className="flex gap-2">
                      {(['paginated', 'scrolled'] as const).map((f) => (
                        <button key={f} onClick={() => update({ flow: f })}
                          className={`h-9 flex-1 rounded-lg border text-[12.5px] ${prefs.flow === f ? 'border-navy bg-navy text-white' : 'border-line'}`}>
                          {f === 'paginated' ? 'พลิกหน้า' : 'เลื่อนยาว'}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted">เปลี่ยนโหมดนี้จะโหลดหน้าอ่านใหม่</p>
                  </Section>

                  <label className="flex items-center gap-2.5 text-[13px]">
                    <input type="checkbox" checked={prefs.justify}
                      onChange={(e) => update({ justify: e.target.checked })} className="accent-accent" />
                    จัดข้อความชิดขอบทั้งสองด้าน
                  </label>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {!chrome && (
        <button onClick={() => setChrome(true)}
          className="fixed right-4 top-4 z-20 rounded-full bg-black/35 px-3 py-1.5 text-[11.5px] text-white backdrop-blur">
          แสดงแถบเครื่องมือ
        </button>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      {children}
    </div>
  );
}

function Slider({
  label, value, min, max, step = 1, unit = '', onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span className="flex-1">{label}</span>
        <span>{step < 1 ? value.toFixed(2) : value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)} className="w-full accent-accent" />
    </div>
  );
}
