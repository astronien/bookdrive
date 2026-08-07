'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLibrary, type SortKey, type StatusFilter } from '@/lib/store/library';
import { installFlushOnHide } from '@/lib/sync/engine';
import FolderPicker from '@/components/library/FolderPicker';
import BookCard from '@/components/library/BookCard';
import SeriesCard from '@/components/library/SeriesCard';
import ContinueRow from '@/components/library/ContinueRow';
import type { BookFormat } from '@/lib/types';

const FORMATS: ('all' | BookFormat)[] = ['all', 'epub', 'pdf', 'cbz'];

const STATUS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'reading', label: 'กำลังอ่าน' },
  { key: 'finished', label: 'อ่านจบแล้ว' },
  { key: 'unread', label: 'ยังไม่ได้อ่าน' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'ชื่อเรื่อง' },
  { key: 'added', label: 'เพิ่มล่าสุด' },
  { key: 'opened', label: 'เปิดอ่านล่าสุด' },
  { key: 'progress', label: 'ความคืบหน้า' },
  { key: 'author', label: 'ผู้เขียน' },
  { key: 'series', label: 'ชุดหนังสือ' },
];

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[13px] text-muted">กำลังโหลด…</div>}>
      <LibraryInner />
    </Suspense>
  );
}

function LibraryInner() {
  const {
    books, loading, load, filters, setFilter, sort, setSort, resetFilters,
    filtered, grouped, facets, offlineIds, refreshOffline,
    calibreFolderId, calibreFolderName, connectCalibre, scanCalibre, scan,
  } = useLibrary();

  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [browse, setBrowse] = useState<'authors' | 'tags' | null>(null);

  useEffect(() => {
    load();
    installFlushOnHide();
  }, [load]);

  useEffect(() => { if (books.length) refreshOffline(); }, [books.length, refreshOffline]);

  // เมนูข้างลิงก์มาพร้อม ?status= — เดิมทำลิงก์ไว้แต่หน้านี้ไม่เคยอ่านค่าเลย กดแล้วได้ทั้งหมดเหมือนเดิม
  useEffect(() => {
    const st = params.get('status') as StatusFilter | null;
    setFilter({ status: st && ['unread', 'reading', 'finished'].includes(st) ? st : 'all' });
  }, [params, setFilter]);

  async function connect(f: { id: string; name: string }) {
    setPicking(false);
    setMsg(null);
    await connectCalibre(f.id, f.name);
    setMsg(`เชื่อมโฟลเดอร์ "${f.name}" แล้ว กดสแกนได้เลย`);
  }

  async function runScan(refresh = false) {
    setBusy(true);
    setMsg(null);
    try {
      const { added, removed } = await scanCalibre(refresh);
      const parts = [
        refresh
          ? `อ่าน metadata ใหม่ ${added} เล่ม`
          : added ? `เพิ่มหนังสือใหม่ ${added} เล่ม` : null,
        removed ? `ตัดเล่มที่ถูกลบไปจาก Drive แล้ว ${removed} เล่ม` : null,
      ].filter(Boolean);
      setMsg(
        parts.length
          ? `${parts.join(' · ')}${refresh ? ' — ความคืบหน้าและไฮไลต์ยังอยู่ครบ' : ''}`
          : 'ไม่พบการเปลี่ยนแปลง — ไลบรารีเป็นปัจจุบันแล้ว'
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const list = filtered();
  // เล่มที่ค้างไว้ เรียงตามที่เพิ่งเปิดล่าสุด
  const continueList = books
    .filter((b) => (b.percent ?? 0) > 0 && (b.percent ?? 0) < 95)
    .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))
    .slice(0, 12);
  const entries = grouped();
  const { authors, tags } = facets();
  const seriesCount = entries.filter((e) => e.kind === 'series').length;
  const active =
    filters.status !== 'all' || filters.format !== 'all' || filters.author ||
    filters.tag || filters.offlineOnly || filters.query;

  const scanLabel =
    scan.phase === 'listing' ? 'กำลังไล่โฟลเดอร์บน Drive…'
      : scan.phase === 'db' ? 'กำลังอ่าน metadata.db ของ Calibre…'
      : scan.phase === 'metadata' ? `กำลังอ่าน metadata.opf ${scan.done}/${scan.total}`
        : scan.phase === 'epub' ? `กำลังแกะชื่อจากไฟล์ EPUB ${scan.done}/${scan.total} (เล่มที่ไม่มี metadata.opf)`
          : scan.phase === 'saving' ? 'กำลังบันทึกลง Drive…' : null;

  return (
    <>
      {picking && <FolderPicker onPick={connect} onClose={() => setPicking(false)} />}

      <header className="shrink-0 border-b border-line bg-white px-4 py-2.5 md:flex md:h-16 md:items-center md:gap-3 md:px-[22px] md:py-0">
        <input
          value={filters.query}
          onChange={(e) => setFilter({ query: e.target.value })}
          placeholder="ค้นหาชื่อเรื่อง ผู้เขียน ชุดหนังสือ หรือแท็ก…"
          className="h-[40px] w-full rounded-full border border-line bg-shell px-4 text-[16px] outline-none focus:border-brand focus:bg-white md:max-w-[380px] md:text-[13.5px]"
        />
        <div className="hidden md:block md:flex-1" />
        {/* บนจอเล็กปุ่มเลื่อนแนวนอนแทนที่จะบีบให้เล็กจนกดยาก */}
        <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5 md:mt-0 md:overflow-visible md:pb-0">
          {calibreFolderId && (
            <>
              <button onClick={() => runScan(true)} disabled={busy}
                title="อ่าน metadata.opf ใหม่ทุกเล่ม"
                className="h-[38px] shrink-0 rounded-full border border-line bg-white px-4 text-[13.5px] font-semibold transition hover:bg-shell disabled:opacity-50">
                อัปเดต metadata
              </button>
              <button onClick={() => runScan(false)} disabled={busy}
                className="h-[38px] shrink-0 rounded-full border border-line bg-white px-4 text-[13.5px] font-semibold transition hover:bg-shell disabled:opacity-50">
                {busy ? 'กำลังสแกน…' : 'สแกนไลบรารี'}
              </button>
            </>
          )}
          <button onClick={() => setPicking(true)}
            className="h-[38px] shrink-0 rounded-full bg-brand px-5 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-d">
            {calibreFolderId ? 'เปลี่ยนโฟลเดอร์' : 'เชื่อม Calibre library'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-16 pt-5 md:px-[30px] md:pt-6">
        {/* อ่านต่อมาก่อนทุกอย่าง — คนเปิดแอปมาเพื่ออ่านต่อ ไม่ใช่มาไล่ดูทั้งชั้น
            ซ่อนเมื่อกำลังกรองอยู่ เพราะตอนนั้นผู้ใช้กำลังหาอย่างอื่น */}
        {!active && <ContinueRow books={continueList} />}

        <div className="mb-4 flex items-end gap-3">
          <div className="min-w-0 flex-1">
          <h1 className="text-[21px] font-bold tracking-tight md:text-[25px]">
            {STATUS.find((s) => s.key === filters.status)?.label ?? 'ชั้นหนังสือของฉัน'}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            แสดง {list.length} จาก {books.length} เล่ม
            {seriesCount > 0 && <> · {seriesCount} ชุดหนังสือ</>}
            {offlineIds.size > 0 && <> · ออฟไลน์ {offlineIds.size} เล่ม</>}
            {calibreFolderName && <> · จาก <b className="text-ink">{calibreFolderName}</b></>}
          </p>
          </div>
        </div>

        {msg && <div className="mb-4 rounded-[10px] border border-line bg-white px-4 py-3 text-[13px]">{msg}</div>}

        {scanLabel && (
          <div className="mb-4 rounded-[10px] border border-line bg-white px-4 py-3">
            <div className="mb-2 text-[13px] font-semibold">{scanLabel}</div>
            <div className="h-1 overflow-hidden rounded bg-line">
              <div className="h-full rounded bg-accent transition-all"
                style={{ width: scan.total ? `${(scan.done / scan.total) * 100}%` : '30%' }} />
            </div>
          </div>
        )}

        {/* ---------- แถบกรอง ---------- */}
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
          {STATUS.map((s) => (
            <Chip key={s.key} on={filters.status === s.key} onClick={() => setFilter({ status: s.key })}>
              {s.label}
            </Chip>
          ))}

          <span className="mx-1 h-5 w-px shrink-0 bg-line" />

          {FORMATS.map((f) => (
            <Chip key={f} on={filters.format === f} onClick={() => setFilter({ format: f })}>
              {f === 'all' ? 'ทุกฟอร์แมต' : f.toUpperCase()}
            </Chip>
          ))}

          <span className="mx-1 h-5 w-px shrink-0 bg-line" />

          <Chip on={filters.offlineOnly} onClick={() => setFilter({ offlineOnly: !filters.offlineOnly })}>
            ออฟไลน์แล้ว
          </Chip>
          <Chip on={browse === 'authors'} onClick={() => setBrowse(browse === 'authors' ? null : 'authors')}>
            ผู้เขียน {filters.author ? `· ${filters.author}` : `(${authors.length})`}
          </Chip>
          {tags.length > 0 && (
            <Chip on={browse === 'tags'} onClick={() => setBrowse(browse === 'tags' ? null : 'tags')}>
              แท็ก {filters.tag ? `· ${filters.tag}` : `(${tags.length})`}
            </Chip>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {active && (
              <button onClick={() => { resetFilters(); setBrowse(null); }}
                className="text-[12.5px] font-semibold text-accent-d hover:underline">
                ล้างตัวกรอง
              </button>
            )}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-8 rounded-full border border-line bg-white px-3 text-[12.5px] outline-none focus:border-brand">
              {SORTS.map((s) => <option key={s.key} value={s.key}>เรียงตาม{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* ---------- รายชื่อผู้เขียน/แท็ก ---------- */}
        {browse && (
          <div className="mb-4 max-h-[220px] overflow-y-auto rounded-xl border border-line bg-white p-2">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setFilter(browse === 'authors' ? { author: null } : { tag: null })}
                className="rounded-full border border-line px-3 py-1 text-[12px] hover:bg-shell">
                ทั้งหมด
              </button>
              {(browse === 'authors' ? authors : tags).map(([name, n]) => {
                const on = browse === 'authors' ? filters.author === name : filters.tag === name;
                return (
                  <button key={name}
                    onClick={() => setFilter(browse === 'authors' ? { author: on ? null : name } : { tag: on ? null : name })}
                    className={`rounded-full border px-3 py-1 text-[12px] transition ${on ? 'border-brand bg-brand text-white' : 'border-line hover:bg-shell'}`}>
                    {name} <span className="opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------- ผลลัพธ์ ---------- */}
        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,minmax(158px,1fr))] md:gap-x-[18px] md:gap-y-[22px]">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-[9px] bg-line" />
            ))}
          </div>
        ) : !calibreFolderId ? (
          <Empty title="ยังไม่ได้เชื่อม Calibre library">
            กด &ldquo;เชื่อม Calibre library&rdquo; แล้วค้นหาโฟลเดอร์รากของไลบรารี — ตัวที่มีโฟลเดอร์ผู้เขียนอยู่ข้างใน
            <br />
            <span className="mt-2 block">BookDrive อ่านอย่างเดียว ไม่เขียนอะไรกลับเข้าโฟลเดอร์ Calibre</span>
          </Empty>
        ) : !books.length ? (
          <Empty title="ยังไม่ได้สแกน">กด &ldquo;สแกนไลบรารี&rdquo; เพื่อดึงรายการหนังสือ</Empty>
        ) : !list.length ? (
          <Empty title="ไม่มีเล่มที่ตรงกับตัวกรอง">
            {active && (
              <button onClick={() => { resetFilters(); setBrowse(null); }}
                className="mt-3 inline-block h-[36px] rounded-[10px] border border-line px-4 text-[13px] font-semibold leading-[36px] hover:bg-shell">
                ล้างตัวกรอง
              </button>
            )}
          </Empty>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,minmax(158px,1fr))] md:gap-x-[18px] md:gap-y-[22px]">
            {entries.map((e) =>
              e.kind === 'series'
                ? <SeriesCard key={`s:${e.name}`} name={e.name} books={e.books} />
                : <BookCard key={e.book.id} book={e.book} offline={offlineIds.has(e.book.id)} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`h-8 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[12.5px] font-medium transition ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-muted hover:text-ink'}`}>
      {children}
    </button>
  );
}

function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line py-20 text-center">
      <p className="font-semibold">{title}</p>
      <div className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}
