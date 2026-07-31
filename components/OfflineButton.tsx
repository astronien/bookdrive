'use client';

import { useEffect, useState } from 'react';
import { db, getBookBlob } from '@/lib/db/idb';
import { useLibrary } from '@/lib/store/library';
import type { Book } from '@/lib/types';
import { pickFile } from '@/lib/types';

/** ปุ่มเก็บ/ลบไฟล์หนังสือในเครื่องสำหรับอ่านออฟไลน์ */
export default function OfflineButton({ book, className = '' }: { book: Book; className?: string }) {
  const [state, setState] = useState<'unknown' | 'no' | 'busy' | 'yes'>('unknown');
  const refreshOffline = useLibrary((s) => s.refreshOffline);
  const file = pickFile(book);

  useEffect(() => {
    if (!file) return;
    db.blobs.get(file.driveFileId).then((r) => setState(r ? 'yes' : 'no'));
  }, [file?.driveFileId]);

  if (!file) return null;

  async function toggle() {
    if (!file) return;
    if (state === 'yes') {
      await db.blobs.delete(file.driveFileId);
      await db.locations.delete(book.id);
      setState('no');
    } else {
      setState('busy');
      try {
        await getBookBlob(file.driveFileId);   // ดาวน์โหลดแล้วเก็บลง IndexedDB
        setState('yes');
      } catch {
        setState('no');
      }
    }
    refreshOffline();
  }

  const label =
    state === 'busy' ? 'กำลังดาวน์โหลด…'
      : state === 'yes' ? 'เก็บไว้ในเครื่องแล้ว'
        : 'เก็บไว้อ่านออฟไลน์';

  return (
    <button
      onClick={toggle}
      disabled={state === 'busy' || state === 'unknown'}
      title={state === 'yes' ? 'กดเพื่อลบออกจากเครื่อง' : `${(file.size / 1048576).toFixed(1)} MB`}
      className={`h-[38px] rounded-[10px] border px-4 text-[13px] font-semibold transition disabled:opacity-50 ${
        state === 'yes' ? 'border-accent bg-accent/15 text-accent-d' : 'border-line hover:bg-shell'
      } ${className}`}
    >
      {label}
    </button>
  );
}
