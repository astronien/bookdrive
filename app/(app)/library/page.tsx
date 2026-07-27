'use client';

import { useEffect, useState } from 'react';
import { useLibrary } from '@/lib/store/library';
import { installFlushOnHide } from '@/lib/sync/engine';
import BookCard from '@/components/library/BookCard';

export default function LibraryPage() {
  const { books, loading, load, scan, query, setQuery, format, setFormat, filtered } = useLibrary();
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    load();
    installFlushOnHide();
  }, [load]);

  async function handleScan() {
    setScanning(true);
    try {
      const n = await scan();
      alert(n ? `พบหนังสือใหม่ ${n} เล่ม` : 'ไม่พบหนังสือใหม่');
    } finally {
      setScanning(false);
    }
  }

  const list = filtered();

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3.5 border-b border-line bg-white px-[22px]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อเรื่อง ผู้เขียน หรือแท็ก…"
          className="h-[38px] w-full max-w-[460px] rounded-[10px] border border-line bg-shell px-3.5 text-[13.5px] outline-none focus:border-accent focus:bg-white"
        />
        <div className="flex-1" />
        <button
          onClick={handleScan}
          disabled={scanning}
          className="h-[38px] rounded-[10px] border border-line px-4 text-[13.5px] font-semibold transition hover:bg-shell disabled:opacity-50"
        >
          {scanning ? 'กำลังสแกน…' : 'สแกน Drive'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] pb-16 pt-6">
        <div className="mb-5">
          <h1 className="text-[25px] font-bold tracking-tight">หนังสือทั้งหมด</h1>
          <p className="mt-1 text-[13px] text-muted">
            {books.length} เล่ม · ซิงก์กับ Google Drive
          </p>
        </div>

        <div className="mb-5 flex gap-2">
          {(['all', 'epub', 'pdf', 'cbz'] as const).map((f) => (
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
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line py-20 text-center">
            <p className="font-semibold">ยังไม่มีหนังสือ</p>
            <p className="mt-1.5 text-[13px] text-muted">
              วางไฟล์ EPUB/PDF ไว้ใน <b>My Drive / BookDrive / Books</b> แล้วกด “สแกน Drive”
            </p>
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
