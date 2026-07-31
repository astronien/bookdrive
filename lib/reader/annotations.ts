'use client';

import { db } from '@/lib/db/idb';
import { queue } from '@/lib/sync/engine';
import type { Annotation, Annotations, HighlightColor } from '@/lib/types';

const key = (bookId: string) => `annotations/${bookId}`;

export async function listAnnotations(bookId: string): Promise<Annotation[]> {
  const row = await db.meta.get(key(bookId));
  const a = row?.data as Annotations | undefined;
  return (a?.items ?? []).filter((x) => !x.deleted);
}

async function write(bookId: string, items: Annotation[]) {
  const row = await db.meta.get(key(bookId));
  const next: Annotations = { bookId, updatedAt: new Date().toISOString(), items };
  await db.meta.put({ name: key(bookId), data: next, etag: row?.etag, dirty: true });
  queue({ scope: 'annotations', bookId });
}

export async function addAnnotation(
  bookId: string,
  a: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Annotation> {
  const row = await db.meta.get(key(bookId));
  const prev = ((row?.data as Annotations | undefined)?.items ?? []);
  const now = new Date().toISOString();
  const item: Annotation = { ...a, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await write(bookId, [...prev, item]);
  return item;
}

export async function updateAnnotation(bookId: string, id: string, patch: Partial<Annotation>) {
  const row = await db.meta.get(key(bookId));
  const prev = ((row?.data as Annotations | undefined)?.items ?? []);
  await write(
    bookId,
    prev.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x))
  );
}

/**
 * ลบแบบ tombstone ไม่ใช่ลบทิ้งจริง
 * ถ้าลบออกจากอาเรย์เลย เครื่องที่ออฟไลน์อยู่จะ merge เอากลับมาให้ใหม่ตอนออนไลน์
 */
export async function removeAnnotation(bookId: string, id: string) {
  await updateAnnotation(bookId, id, { deleted: true });
}

export const HIGHLIGHT_COLORS: { key: HighlightColor; hex: string; label: string }[] = [
  { key: 'yellow', hex: '#ffd94a', label: 'เหลือง' },
  { key: 'green', hex: '#6ee7a8', label: 'เขียว' },
  { key: 'blue', hex: '#7cc4fa', label: 'ฟ้า' },
  { key: 'pink', hex: '#f9a8d4', label: 'ชมพู' },
  { key: 'purple', hex: '#c4b5fd', label: 'ม่วง' },
];
