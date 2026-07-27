'use client';

import Dexie, { type EntityTable } from 'dexie';

export interface MetaRow { name: string; data: unknown; etag?: string; dirty?: boolean }
export interface BlobRow { driveFileId: string; blob: Blob; size: number; cachedAt: string }
export interface LocationsRow { bookId: string; locations: string }  // cache ของ epub.js

export const db = new Dexie('bookdrive') as Dexie & {
  meta: EntityTable<MetaRow, 'name'>;
  blobs: EntityTable<BlobRow, 'driveFileId'>;
  locations: EntityTable<LocationsRow, 'bookId'>;
};

db.version(1).stores({
  meta: 'name, dirty',
  blobs: 'driveFileId, cachedAt',
  locations: 'bookId',
});

/** ดึงไฟล์หนังสือ — ใช้ของใน IndexedDB ก่อนถ้ามี (ออฟไลน์ได้) */
export async function getBookBlob(driveFileId: string): Promise<Blob> {
  const cached = await db.blobs.get(driveFileId);
  if (cached) return cached.blob;

  const res = await fetch(`/api/drive/file/${driveFileId}`);
  if (!res.ok) throw new Error('ดาวน์โหลดไฟล์จาก Drive ไม่สำเร็จ');
  const blob = await res.blob();
  await db.blobs.put({ driveFileId, blob, size: blob.size, cachedAt: new Date().toISOString() });
  return blob;
}

export async function storageUsage() {
  const est = await navigator.storage?.estimate?.();
  return { used: est?.usage ?? 0, quota: est?.quota ?? 0 };
}
