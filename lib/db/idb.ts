'use client';

import Dexie, { type EntityTable } from 'dexie';

export interface MetaRow { name: string; data: unknown; etag?: string; dirty?: boolean }
export interface BlobRow { driveFileId: string; blob: Blob; size: number; cachedAt: string }
export interface LocationsRow { bookId: string; locations: string }  // cache ของ epub.js
/** ฟอนต์ที่ผู้ใช้เพิ่มเอง — เก็บไฟล์ไว้ในเครื่อง ไม่ส่งขึ้น Drive
    เป็นไฟล์ของผู้ใช้ที่เราไม่มีสิทธิ์เอาไปวางที่อื่น และมักมีลิขสิทธิ์ของตัวเอง */
export interface FontRow {
  id: string;
  family: string;
  /** ค่าที่ต้องใส่ใน format() ของ @font-face — เดาจากนามสกุลไม่ได้แล้วหลังเก็บลง db */
  format: string;
  blob: Blob;
  size: number;
  addedAt: string;
}

export const db = new Dexie('bookdrive') as Dexie & {
  meta: EntityTable<MetaRow, 'name'>;
  blobs: EntityTable<BlobRow, 'driveFileId'>;
  locations: EntityTable<LocationsRow, 'bookId'>;
  fonts: EntityTable<FontRow, 'id'>;
};

db.version(1).stores({
  meta: 'name, dirty',
  blobs: 'driveFileId, cachedAt',
  locations: 'bookId',
});

/* เพิ่มตาราง fonts — Dexie บังคับให้ขึ้น version ใหม่เมื่อ schema เปลี่ยน
   ตารางเดิมไม่ต้องประกาศซ้ำ ของที่มีอยู่แล้วไม่ถูกแตะและไม่ต้อง migrate */
db.version(2).stores({
  fonts: 'id, family',
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
