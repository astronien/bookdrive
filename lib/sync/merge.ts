import type { Annotation, Annotations, Book, Library, Progress } from '@/lib/types';

/**
 * ฟังก์ชัน merge ทั้งหมดเป็น pure function — เทสง่าย ไม่มี side effect
 * เรียกใช้เมื่อ Drive ตอบ 412 (มีเครื่องอื่นเขียนแซง)
 */

const newer = (a: string, b: string) => new Date(a).getTime() > new Date(b).getTime();

/**
 * Progress: last-write-wins ตาม updatedAt
 * ยกเว้นกรณีที่ตัวเก่ากว่าอ่านไปไกลกว่ามาก — คนมักไม่ได้อ่านถอยหลัง
 * (กันเคส: อ่านบนมือถือถึง 80% แล้วเปิดเว็บที่ค้างอยู่ 20% แล้วเว็บเขียนทับ)
 */
export function mergeProgress(local: Progress, remote: Progress): Progress {
  const win = newer(local.updatedAt, remote.updatedAt) ? local : remote;
  const lose = win === local ? remote : local;

  const percent = lose.percent > win.percent + 5 ? lose.percent : win.percent;

  return {
    ...win,
    percent,
    totalReadingMs: Math.max(local.totalReadingMs, remote.totalReadingMs),
    sessions: [...local.sessions, ...remote.sessions]
      .filter((s, i, arr) => arr.findIndex((x) => x.start === s.start) === i)
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, 50),
  };
}

/**
 * Annotations: merge รายรายการตาม id
 * - ตัวที่ updatedAt ใหม่กว่าชนะ
 * - การลบใช้ tombstone (deleted: true) ไม่ลบทิ้งจริง ไม่งั้นเครื่องที่ออฟไลน์อยู่จะเอากลับมา
 */
export function mergeAnnotations(local: Annotations, remote: Annotations): Annotations {
  const map = new Map<string, Annotation>();
  for (const a of remote.items) map.set(a.id, a);
  for (const a of local.items) {
    const prev = map.get(a.id);
    if (!prev || newer(a.updatedAt, prev.updatedAt)) map.set(a.id, a);
  }
  return {
    bookId: local.bookId,
    updatedAt: new Date().toISOString(),
    items: [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

/** ลบ tombstone ที่เก่ากว่า 90 วัน */
export function purgeTombstones(a: Annotations, days = 90): Annotations {
  const cutoff = Date.now() - days * 86400_000;
  return {
    ...a,
    items: a.items.filter((x) => !x.deleted || new Date(x.updatedAt).getTime() > cutoff),
  };
}

/** Library: merge ตาม book.id, ระดับ record */
export function mergeLibrary(local: Library, remote: Library): Library {
  const map = new Map<string, Book>();
  for (const b of remote.books) map.set(b.id, b);
  for (const b of local.books) {
    const prev = map.get(b.id);
    if (!prev) { map.set(b.id, b); continue; }
    // ใครแตะหนังสือเล่มนี้ล่าสุดชนะ
    const localTouched = b.lastOpenedAt ?? b.addedAt;
    const remoteTouched = prev.lastOpenedAt ?? prev.addedAt;
    map.set(b.id, newer(localTouched, remoteTouched) ? b : prev);
  }
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    deviceId: local.deviceId,
    books: [...map.values()],
  };
}
