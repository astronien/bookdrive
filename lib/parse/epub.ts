'use client';

import JSZip from 'jszip';
import { parseOpf, type OpfMeta } from './opf';

export interface ParsedMeta {
  title?: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  language?: string;
  isbn?: string;
  description?: string;
  coverBlob?: Blob;
}

/**
 * แตก metadata จาก EPUB โดยไม่ต้องพึ่ง epub.js (เบากว่ามากตอน ingest หลายร้อยเล่ม)
 * ทำงานได้ใน Web Worker
 */
export async function parseEpub(blob: Blob): Promise<ParsedMeta> {
  const zip = await JSZip.loadAsync(blob);

  // 1) META-INF/container.xml ชี้ไปที่ไฟล์ OPF
  const container = await zip.file('META-INF/container.xml')?.async('string');
  if (!container) throw new Error('ไม่ใช่ไฟล์ EPUB ที่ถูกต้อง');

  const opfPath = new DOMParser()
    .parseFromString(container, 'application/xml')
    .querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('หา OPF ไม่เจอ');

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfXml = await zip.file(opfPath)!.async('string');
  const doc = new DOMParser().parseFromString(opfXml, 'application/xml');

  const dc = (tag: string) =>
    doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', tag);
  const text = (tag: string) => dc(tag)[0]?.textContent?.trim() || undefined;

  const identifiers = [...dc('identifier')].map((n) => n.textContent ?? '');
  const isbn = identifiers.find((v) => /\d{13}|\d{10}/.test(v.replace(/[^0-9Xx]/g, '')))
    ?.replace(/[^0-9Xx]/g, '');

  // 2) หาปก — ลอง <meta name="cover"> ก่อน แล้วค่อย fallback ไป properties="cover-image"
  let coverBlob: Blob | undefined;
  const coverId =
    doc.querySelector('meta[name="cover"]')?.getAttribute('content') ??
    doc.querySelector('item[properties~="cover-image"]')?.getAttribute('id');

  if (coverId) {
    const href = doc.querySelector(`item[id="${coverId}"]`)?.getAttribute('href');
    if (href) coverBlob = await zip.file(opfDir + href)?.async('blob');
  }

  return {
    title: text('title'),
    authors: [...dc('creator')].map((n) => n.textContent?.trim() ?? '').filter(Boolean),
    publisher: text('publisher'),
    publishedDate: text('date'),
    language: text('language'),
    description: text('description'),
    isbn,
    coverBlob,
  };
}

/** ย่อปกเป็น JPEG 400px ก่อนอัปขึ้น Drive — ลดขนาดได้ 10–20 เท่า */
export async function makeThumbnail(blob: Blob, maxW = 400): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxW / bmp.width);
  const canvas = new OffscreenCanvas(bmp.width * scale, bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}


/**
 * แกะ OPF ที่อยู่ *ข้างในไฟล์ EPUB* แล้วอ่านด้วย parser ตัวเดียวกับ metadata.opf ของ Calibre
 *
 * ใช้ตอนโฟลเดอร์หนังสือไม่มี metadata.opf (ในไลบรารีจริงเจอ 60 จาก 221 เล่ม)
 * ซึ่งเดิมต้องถอยไปใช้ชื่อโฟลเดอร์ที่ Calibre ถอดเป็นอักษรโรมันไว้จนอ่านไม่ออก
 * แต่ชื่อไทยจริงอยู่ใน EPUB มาตลอด
 *
 * แพงกว่าอ่าน metadata.opf มาก เพราะต้องโหลดไฟล์ทั้งเล่ม (หลาย MB) แทนที่จะโหลด
 * ไม่กี่ KB จึงควรเรียกเฉพาะเล่มที่ไม่มีทางเลือกอื่นเท่านั้น
 */
export async function extractMetaFromEpub(blob: Blob): Promise<OpfMeta> {
  const zip = await JSZip.loadAsync(blob);

  const container = await zip.file('META-INF/container.xml')?.async('string');
  if (!container) throw new Error('ไม่ใช่ไฟล์ EPUB ที่ถูกต้อง');

  const opfPath = new DOMParser()
    .parseFromString(container, 'application/xml')
    .querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('หา OPF ใน EPUB ไม่เจอ');

  const xml = await zip.file(opfPath)!.async('string');
  return parseOpf(xml);
}
