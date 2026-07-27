'use client';

import { db } from '@/lib/db/idb';
import { mergeAnnotations, mergeProgress } from './merge';
import type { Annotations, Progress } from '@/lib/types';

type Scope = 'library' | 'progress' | 'annotations';
interface Job { scope: Scope; bookId?: string }

const DEBOUNCE: Record<Scope, number> = {
  library: 2_000,
  progress: 10_000,   // อย่ายิงทุกหน้าที่พลิก — เปลืองโควตา Drive มาก
  annotations: 3_000,
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function key(j: Job) { return `${j.scope}:${j.bookId ?? ''}`; }

/** เขียน local ทันที (optimistic) แล้วค่อย flush ขึ้น Drive แบบ debounce */
export function queue(job: Job) {
  const k = key(job);
  clearTimeout(timers.get(k));
  timers.set(k, setTimeout(() => flush(job), DEBOUNCE[job.scope]));
}

export async function flush(job: Job) {
  clearTimeout(timers.get(key(job)));
  const name = job.bookId ? `${job.scope}/${job.bookId}` : job.scope;
  const local = await db.meta.get(name);
  if (!local) return;

  const res = await fetch(`/api/drive/appdata/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': local.etag ?? '' },
    body: JSON.stringify(local.data),
  });

  if (res.status === 412) {
    // มีเครื่องอื่นเขียนแซง -> ดึงของใหม่มา merge แล้วลองอีกรอบ
    const remote = await fetch(`/api/drive/appdata/${encodeURIComponent(name)}`).then((r) => r.json());
    const merged =
      job.scope === 'annotations'
        ? mergeAnnotations(local.data as Annotations, remote.data)
        : mergeProgress(local.data as Progress, remote.data);
    await db.meta.put({ name, data: merged, etag: remote.etag, dirty: true });
    return flush(job);
  }

  if (res.ok) {
    const { etag } = await res.json();
    await db.meta.put({ ...local, etag, dirty: false });
  }
}

/** flush ทุกอย่างที่ค้างตอนผู้ใช้ปิดแท็บ/สลับแอป */
export function installFlushOnHide() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      for (const k of timers.keys()) {
        const [scope, bookId] = k.split(':');
        flush({ scope: scope as Scope, bookId: bookId || undefined });
      }
    }
  });
}
