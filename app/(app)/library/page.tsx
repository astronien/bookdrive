'use client';

import { useEffect, useState } from 'react';
import { useLibrary } from '@/lib/store/library';
import { installFlushOnHide } from '@/lib/sync/engine';
import FolderPicker from '@/components/library/FolderPicker';
import BookCard from '@/components/library/BookCard';
import type { BookFormat } from '@/lib/types';

const FORMATS: ('all' | BookFormat)[] = ['all', 'epub', 'pdf', 'cbz'];

export default function LibraryPage() {
  const {
    books, loading, load, query, setQuery, format, setFormat, filtered,
    calibreFolderId, calibreFolderName, connectCalibre, scanCalibre, scan,
  } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    load();
    installFlushOnHide();
  }, [load]);

  async function connect(f: { id: string; name: string }) {
    setPicking(false);
    setMsg(null);
    await connectCalibre(f.id, f.name);
    setMsg(`เชื่อมโฟลเดอร์ "${f.name}" แล้ว กดสแกนได้เลย`);
  }

  async function runScan() {
    setBusy(true);
    setMsg(null);
    try {
      const n = await scanCalibre();
      setMsg(n ? `เพิ่มหนังสือใหม่ ${n} เล่ม` : 'ไม่พบหนังสือใหม่ — ไลบรารีเป็นปัจจุบันแล้ว');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const list = filtered();

  const scanLabel =
    scan.phase === 'listing'
      ? 'กำลังไล่โฟลเดอร์บน Drive…'
      : scan.phase === 'metadata'
        ? `กำลังอ่าน metadata.opf ${scan.done}/${scan.total}`
        : scan.phase === 'saving'
          ? 'กำลังบันทึกลง Drive…'
          : null;

  return (
    <>
      {picking && <FolderPicker onPick={connect} onClose={() => setPicking(false)} />}
      <header className="flex h-16 shrink-0 items-center gap-3.5 border-b border-line bg-white px-[22px]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อเรื่อง ผู้เขียน ชุดหนังสือ หรือแท็ก…"
          className="h-[38px] w-full max-w-[460px] rounded-[10px] border border-line bg-shell px-3.5 text-[13.5px] outline-none focus:border-accent focus:bg-white"
        />
        <div className="flex-1" />
        {calibreFolderId && (
          <button
            onClick={runScan}
            disabled={busy}
            className="h-[38px] rounded-[10px] border border-line px-4 text-[13.5px] font-semibold transition hover:bg-shell disabled:opacity-50"
          >
            {busy ? 'กำลังสแกน…' : 'สแกนไลบรารี'}
          </button>
        )}
        <button
          onClick={() => setPicking(true)}
          className="h-[38px] rounded-[10px] bg-accent px-4 text-[13.5px] font-semibold text-[#08312e] transition hover:bg-accent-d"
        >
          {calibreFolderId ? 'เปลี่ยนโฟลเดอร์' : 'เชื่อม Calibre library'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] pb-16 pt-6">
        <div className="mb-5">
          <h1 className="text-[25px] font-bold tracking-tight">หนังสือทั้งหมด</h1>
          <p className="mt-1 text-[13px] text-muted">
            {books.length} เล่ม
            {calibreFolderName && <> · จาก <b className="text-ink">{calibreFolderName}</b></>}
          </p>
        </div>

        {msg && (
          <div className="mb-4 rounded-[10px] border border-line bg-white px-4 py-3 text-[13px]">{msg}</div>
        )}

        {scanLabel && (
          <div className="mb-4 rounded-[10px] border border-line bg-white px-4 py-3">
            <div className="mb-2 text-[13px] font-semibold">{scanLabel}</div>
            <div className="h-1 overflow-hidden rounded bg-line">
              <div
                className="h-full rounded bg-accent transition-all"
                style={{ width: scan.total ? `${(scan.done / scan.total) * 100}%` : '30%' }}
              />
            </div>
          </div>
        )}

        <div className="mb-5 flex gap-2">
          {FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`h-8 rounded-full border px-3.5 text-[12.5px] font-medium transition ${
                format === f ? 'border-navy bg-navy text-white' : 'border-line bg-white text-muted hover:text-ink'
              }`}
            >
              {f === 'all' ? 'ทั้งหมด' : f.toUpperCase()}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-x-[18px] gap-y-[22px]">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-[9px] bg-line" />
            ))}
          </div>
        ) : !calibreFolderId ? (
          <div className="rounded-xl border border-dashed border-line py-20 text-center">
            <p className="font-semibold">ยังไม่ได้เชื่อม Calibre library</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
              กด &ldquo;เชื่อม Calibre library&rdquo; แล้วค้นหาโฟลเดอร์ราก Calibre library ของคุณ
              — ตัวที่มีโฟลเดอร์ผู้เขียนอยู่ข้างใน
              <br />
              <span className="mt-2 block">BookDrive อ่านอย่างเดียว ไม่เขียนอะไรกลับเข้าโฟลเดอร์ Calibre</span>
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line py-20 text-center">
            <p className="font-semibold">{books.length ? 'ไม่มีเล่มที่ตรงกับตัวกรอง' : 'ยังไม่ได้สแกน'}</p>
            {!books.length && (
              <p className="mt-1.5 text-[13px] text-muted">กด &ldquo;สแกนไลบรารี&rdquo; เพื่อดึงรายการหนังสือ</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-x-[18px] gap-y-[22px]">
            {list.map((b) => <BookCard key={b.id} book={b} />)}
          </div>
        )}
      </div>
    </>
  );
}
