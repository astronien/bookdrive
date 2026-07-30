'use client';

import { useEffect, useRef, useState } from 'react';

interface Folder { id: string; name: string; parent: string | null }

/**
 * เลือกโฟลเดอร์ไลบรารีด้วยการค้นหาชื่อ
 * แทน Google Picker ซึ่งไม่จำเป็นอีกแล้วหลังเปลี่ยนไปใช้ scope drive.readonly
 */
export default function FolderPicker({
  onPick, onClose,
}: { onPick: (f: Folder) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/drive/folders?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'ค้นหาไม่สำเร็จ');
        setFolders(data.folders);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 300); // debounce กันยิง Drive API ทุกตัวอักษร
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line p-4">
          <h2 className="mb-1 text-[15px] font-bold">เลือกโฟลเดอร์ไลบรารี</h2>
          <p className="mb-3 text-[12px] text-muted">
            ชี้ไปที่โฟลเดอร์ราก Calibre library — ตัวที่มีโฟลเดอร์ผู้เขียนอยู่ข้างใน
          </p>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="พิมพ์ชื่อโฟลเดอร์…"
            className="h-[38px] w-full rounded-[10px] border border-line bg-shell px-3.5 text-[13.5px] outline-none focus:border-accent focus:bg-white"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {err ? (
            <p className="p-4 text-[13px] text-coral">{err}</p>
          ) : loading ? (
            <p className="p-4 text-[13px] text-muted">กำลังค้นหา…</p>
          ) : !folders.length ? (
            <p className="p-4 text-[13px] text-muted">ไม่พบโฟลเดอร์ที่ตรงกับคำค้น</p>
          ) : (
            folders.map((f) => (
              <button
                key={f.id}
                onClick={() => onPick(f)}
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition hover:bg-shell"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-muted">
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                </svg>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{f.name}</span>
                  {f.parent && <span className="block truncate text-[11px] text-muted">อยู่ใน {f.parent}</span>}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-line p-3 text-right">
          <button
            onClick={onClose}
            className="h-[36px] rounded-[10px] border border-line px-4 text-[13px] font-semibold transition hover:bg-shell"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
