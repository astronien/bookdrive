/**
 * Parser สำหรับ OPF — ใช้ได้ทั้ง metadata.opf ของ Calibre และ .opf ใน EPUB
 * Calibre เขียน metadata.opf ทิ้งไว้ทุกโฟลเดอร์หนังสือ ซึ่งมีข้อมูลครบกว่าที่ฝังใน EPUB
 * (series, series_index, rating, tags) จึงควรอ่านตัวนี้ก่อนเสมอถ้ามี
 */

export interface OpfMeta {
  title?: string;
  titleSort?: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  language?: string;
  isbn?: string;
  description?: string;
  tags: string[];
  series?: { name: string; index: number };
  rating?: 1 | 2 | 3 | 4 | 5;
  calibreId?: number;
}

const DC = 'http://purl.org/dc/elements/1.1/';

export function parseOpf(xml: string): OpfMeta {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  if (doc.querySelector('parsererror')) throw new Error('metadata.opf เสียหรือไม่ใช่ XML');

  const dc = (tag: string) => Array.from(doc.getElementsByTagNameNS(DC, tag));
  const text = (tag: string) => dc(tag)[0]?.textContent?.trim() || undefined;

  // <meta name="calibre:series" content="..."/>  (OPF 2)
  // <meta property="calibre:series">...</meta>   (OPF 3)
  const meta = (name: string): string | undefined => {
    for (const m of Array.from(doc.getElementsByTagName('meta'))) {
      if (m.getAttribute('name') === name) return m.getAttribute('content') ?? undefined;
      if (m.getAttribute('property') === name) return m.textContent?.trim() || undefined;
    }
    return undefined;
  };

  // ผู้เขียน: เอาเฉพาะ role="aut" ถ้ามีระบุ ไม่งั้นเอาทุก dc:creator
  const creators = dc('creator');
  const authored = creators.filter((c) => {
    const role = c.getAttributeNS('http://www.idpf.org/2007/opf', 'role') ?? c.getAttribute('opf:role');
    return !role || role === 'aut';
  });
  const authors = (authored.length ? authored : creators)
    .map((c) => c.textContent?.trim() ?? '')
    .filter(Boolean);

  // ISBN อาจอยู่ใน dc:identifier แบบ "urn:isbn:9780062316097"
  let isbn: string | undefined;
  let calibreId: number | undefined;
  for (const id of dc('identifier')) {
    const scheme = (
      id.getAttributeNS('http://www.idpf.org/2007/opf', 'scheme') ??
      id.getAttribute('opf:scheme') ??
      ''
    ).toLowerCase();
    const v = id.textContent?.trim() ?? '';
    if (scheme === 'isbn' || /isbn/i.test(v)) {
      const digits = v.replace(/[^0-9Xx]/g, '');
      if (digits.length === 10 || digits.length === 13) isbn = digits;
    }
    if (scheme === 'calibre') {
      const n = Number(v);
      if (Number.isFinite(n)) calibreId = n;
    }
  }

  const seriesName = meta('calibre:series');
  const seriesIdx = Number(meta('calibre:series_index') ?? '1');
  const ratingRaw = Number(meta('calibre:rating') ?? '');

  return {
    title: text('title'),
    titleSort: meta('calibre:title_sort'),
    authors,
    publisher: text('publisher'),
    publishedDate: text('date'),
    language: text('language'),
    description: text('description'),
    isbn,
    calibreId,
    // Calibre เก็บ tag เป็น dc:subject หลายอัน
    tags: dc('subject').map((s) => s.textContent?.trim() ?? '').filter(Boolean),
    series: seriesName ? { name: seriesName, index: Number.isFinite(seriesIdx) ? seriesIdx : 1 } : undefined,
    // Calibre เก็บ rating เป็น 0–10 (ครึ่งดาว) — แปลงเป็น 1–5
    rating: ratingRaw > 0 ? (Math.round(ratingRaw / 2) as 1 | 2 | 3 | 4 | 5) : undefined,
  };
}

/** ดึงเลข calibre id จากชื่อโฟลเดอร์ เช่น "Sapiens (142)" -> 142 */
export function calibreIdFromFolder(name: string): number | undefined {
  const m = name.match(/\((\d+)\)\s*$/);
  return m ? Number(m[1]) : undefined;
}

/** ตัดวงเล็บ id ท้ายชื่อโฟลเดอร์ออกเพื่อใช้เป็นชื่อเรื่องสำรอง */
export function titleFromFolder(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim();
}
