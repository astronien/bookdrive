'use client';

import { db, type FontRow } from '@/lib/db/idb';

/**
 * ฟอนต์ที่ผู้ใช้เพิ่มเอง
 *
 * เก็บไฟล์ไว้ใน IndexedDB ของเครื่องเท่านั้น ไม่ส่งขึ้น Drive — เป็นไฟล์ของผู้ใช้
 * ที่เรามีสิทธิ์แค่ "ใช้แสดงผลให้เขาดู" ไม่ใช่ "เอาไปเก็บไว้ที่อื่น" และฟอนต์
 * เกือบทั้งหมดมีสัญญาอนุญาตของตัวเองที่ห้ามแจกจ่ายซ้ำอยู่แล้ว
 * ค่าตั้งอื่น ๆ ของหน้าอ่านก็เก็บเป็นของเครื่องเหมือนกัน (localStorage) จึงสอดคล้องกัน
 */

/** เบราว์เซอร์ทุกตัวที่แอปนี้รองรับอ่านสี่แบบนี้ได้หมด */
const EXT_FORMAT: Record<string, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

export const FONT_ACCEPT = '.woff2,.woff,.ttf,.otf';

/* 12 MB — ฟอนต์ไทยที่มีครบทุกน้ำหนักยังไม่ถึง 5 MB
   ตัวที่ใหญ่กว่านี้มักเป็นฟอนต์รวมภาษา CJK ซึ่งใส่ลง IndexedDB แล้วเปลืองเปล่า */
const MAX_BYTES = 12 * 1024 * 1024;

export function formatFromFilename(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_FORMAT[ext] ?? null;
}

/** ชื่อที่เอาไปใส่ใน CSS ได้โดยไม่ต้อง escape และไม่ชนกับฟอนต์ในตัว */
function familyFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _-]/gu, ' ').trim();
  return `bd-${base || 'font'}`.slice(0, 60);
}

export async function listFonts(): Promise<FontRow[]> {
  return db.fonts.orderBy('family').toArray();
}

export async function addFont(file: File): Promise<FontRow> {
  if (!formatFromFilename(file.name)) {
    throw new Error('รองรับเฉพาะไฟล์ .woff2 .woff .ttf .otf');
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`ไฟล์ใหญ่เกินไป (${(file.size / 1048576).toFixed(1)} MB) จำกัดที่ 12 MB`);
  }

  const family = familyFromFilename(file.name);
  const row: FontRow = {
    format: formatFromFilename(file.name)!,
    // ชื่อ family เป็น id ไปเลย เพิ่มไฟล์ชื่อเดิมซ้ำจะทับของเก่าแทนที่จะมีสองรายการ
    id: family,
    family,
    blob: new Blob([await file.arrayBuffer()], { type: file.type || 'font/ttf' }),
    size: file.size,
    addedAt: new Date().toISOString(),
  };

  /* ลองโหลดจริงก่อนบันทึก — ไฟล์เสียหรือไม่ใช่ฟอนต์จะพังตรงนี้
     ดีกว่าปล่อยให้บันทึกสำเร็จแล้วไปเงียบตอนอ่านหนังสือโดยไม่มีใครรู้ว่าทำไม */
  const url = URL.createObjectURL(row.blob);
  try {
    const face = new FontFace(family, `url(${url})`);
    await face.load();
    document.fonts.add(face);
  } catch {
    throw new Error('อ่านไฟล์ฟอนต์นี้ไม่ได้ — ไฟล์อาจเสียหรือไม่ใช่ไฟล์ฟอนต์');
  } finally {
    URL.revokeObjectURL(url);
  }

  await db.fonts.put(row);
  return row;
}

export async function removeFont(id: string) {
  await db.fonts.delete(id);
}

/* blob URL ที่สร้างไว้แล้วของแต่ละฟอนต์ — สร้างใหม่ทุกครั้งที่เปลี่ยนหน้าจะรั่ว
   เพราะ blob URL อยู่จนกว่าจะ revoke หรือปิดแท็บ */
const urls = new Map<string, string>();

function urlFor(row: FontRow): string {
  let u = urls.get(row.id);
  if (!u) {
    u = URL.createObjectURL(row.blob);
    urls.set(row.id, u);
  }
  return u;
}

/**
 * สร้าง CSS `@font-face` ของฟอนต์ทั้งหมด เพื่อ *ฉีดเข้าไปใน iframe ของ epub.js*
 *
 * นี่คือจุดที่พลาดกันบ่อย: `document.fonts.add()` ผูกกับ document ของหน้าหลัก
 * แต่เนื้อหนังสือถูกวาดใน iframe ซึ่งมี document คนละตัว ฟอนต์จึงไม่ไปถึง
 * ต้องแปะ @font-face ลงใน iframe เองเสมอ
 */
export async function fontFaceCss(): Promise<string> {
  const rows = await listFonts();
  return rows
    .map(
      (r) =>
        `@font-face{font-family:'${r.family}';src:url('${urlFor(r)}') format('${r.format}');font-display:swap;}`
    )
    .join('\n');
}

/** ลงทะเบียนกับหน้าหลักด้วย เพื่อให้ตัวอย่างในเมนูตั้งค่าแสดงด้วยฟอนต์จริง */
export async function registerFontsInPage() {
  for (const r of await listFonts()) {
    if ([...document.fonts].some((f) => f.family === r.family)) continue;
    try {
      const face = new FontFace(r.family, `url(${urlFor(r)})`);
      document.fonts.add(await face.load());
    } catch {
      /* ฟอนต์เสียก็ข้ามไป ไม่ต้องทำให้ทั้งหน้าอ่านพัง */
    }
  }
}
