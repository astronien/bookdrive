import type { OpfMeta } from './opf';

/**
 * อ่าน metadata.db ของ Calibre โดยตรง
 *
 * ทำไมต้องมีไฟล์นี้ทั้งที่มี opf.ts อยู่แล้ว — `metadata.opf` ที่ Calibre วางไว้
 * ในโฟลเดอร์หนังสือเป็น *ภาพนิ่งตอนเพิ่มหนังสือ* ไม่ใช่ข้อมูลปัจจุบัน
 * เวลาผู้ใช้แก้ series / tags / ชื่อผู้เขียนในโปรแกรม Calibre มันเขียนลง metadata.db
 * อย่างเดียว ไฟล์ .opf ไม่ถูกแตะ กดสแกนใหม่ในเว็บกี่รอบก็อ่านเจอข้อมูลเก่าเหมือนเดิม
 *
 * พิสูจน์กับไลบรารีจริงแล้ว:
 *   - เจาะเวลาหาจิ๋นซี เล่ม 1–6 → .opf ทุกใบมี series_index = "1"
 *   - 49 เล่มที่ผู้ใช้ตั้ง series ไว้ → .opf ไม่มีคำว่า calibre:series อยู่เลย
 *
 * โหลด sql.js จาก CDN ทั้ง js และ wasm — ไม่เอาลง package.json เพราะถ้าเวอร์ชัน
 * ของ npm กับของ wasm หลุดจากกันจะพังแบบเงียบ ๆ ดึงจากที่เดียวกันแล้วจบ
 */

const SQLJS_VERSION = '1.11.0';
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/sql.js/${SQLJS_VERSION}`;

type SqlValue = string | number | Uint8Array | null;
interface SqlDb {
  exec(sql: string): { columns: string[]; values: SqlValue[][] }[];
  close(): void;
}
type InitSqlJs = (cfg: { locateFile: (f: string) => string }) => Promise<{
  Database: new (data: Uint8Array) => SqlDb;
}>;

declare global {
  interface Window { initSqlJs?: InitSqlJs }
}

let loading: Promise<InitSqlJs> | null = null;

function loadSqlJs(): Promise<InitSqlJs> {
  if (window.initSqlJs) return Promise.resolve(window.initSqlJs);
  loading ??= new Promise<InitSqlJs>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = `${CDN}/sql-wasm.js`;
    el.onload = () =>
      window.initSqlJs ? resolve(window.initSqlJs) : reject(new Error('โหลด sql.js ไม่สำเร็จ'));
    el.onerror = () => { loading = null; reject(new Error('โหลด sql.js จาก CDN ไม่ได้')); };
    document.head.appendChild(el);
  });
  return loading;
}

/* Calibre เก็บทุกอย่างเป็นตารางเชื่อมกัน (books_authors_link ฯลฯ)
   ยิงทีเดียวด้วย GROUP_CONCAT แทนที่จะไล่ query ทีละเล่ม เพราะไลบรารีหลักพันเล่ม
   ถ้ายิงทีละเล่มจะช้ากว่ากันหลายสิบเท่าโดยไม่ได้อะไรเพิ่ม

   จุดสำคัญที่ .opf ให้ไม่ได้: books.series_index เป็นเลขเล่มจริง (float)
   ส่วน .opf เขียน 1 ทิ้งไว้เฉย ๆ ทำให้ทุกเล่มในชุดกลายเป็นเล่ม 1 หมด

   \\x1f (unit separator) ใช้เป็นตัวคั่นเพราะไม่มีทางโผล่ในชื่อผู้เขียนหรือแท็ก
   ต่างจากลูกน้ำหรือ | ที่เจอในชื่อจริงได้ */
const SQL = `
SELECT
  b.id                AS id,
  b.title             AS title,
  b.sort              AS title_sort,
  b.pubdate           AS pubdate,
  b.series_index      AS series_index,
  s.name              AS series_name,
  p.name              AS publisher,
  c.text              AS description,
  r.rating            AS rating,
  (SELECT GROUP_CONCAT(a.name, char(31)) FROM books_authors_link bal
     JOIN authors a ON a.id = bal.author WHERE bal.book = b.id)      AS authors,
  (SELECT GROUP_CONCAT(t.name, char(31)) FROM books_tags_link btl
     JOIN tags t ON t.id = btl.tag WHERE btl.book = b.id)            AS tags,
  (SELECT l.lang_code FROM books_languages_link bll
     JOIN languages l ON l.id = bll.lang_code WHERE bll.book = b.id LIMIT 1) AS lang,
  (SELECT i.val FROM identifiers i
     WHERE i.book = b.id AND i.type = 'isbn' LIMIT 1)                AS isbn
FROM books b
LEFT JOIN books_series_link bsl     ON bsl.book = b.id
LEFT JOIN series s                  ON s.id = bsl.series
LEFT JOIN books_publishers_link bpl ON bpl.book = b.id
LEFT JOIN publishers p              ON p.id = bpl.publisher
LEFT JOIN comments c                ON c.book = b.id
LEFT JOIN books_ratings_link brl    ON brl.book = b.id
LEFT JOIN ratings r                 ON r.id = brl.rating
`;

const str = (v: SqlValue): string | undefined => {
  const t = typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
  return t || undefined;
};

/** คืน map จาก calibreId -> metadata เพื่อให้ scan เอาไปจับคู่กับโฟลเดอร์ได้ */
export async function readCalibreDb(blob: Blob): Promise<Map<number, OpfMeta>> {
  const initSqlJs = await loadSqlJs();
  const SQLjs = await initSqlJs({ locateFile: (f) => `${CDN}/${f}` });

  const db = new SQLjs.Database(new Uint8Array(await blob.arrayBuffer()));
  const out = new Map<number, OpfMeta>();

  try {
    const res = db.exec(SQL);
    if (!res.length) return out;

    const { columns, values } = res[0];
    const at = (row: SqlValue[], name: string) => row[columns.indexOf(name)];
    const split = (v: SqlValue) =>
      (str(v) ?? '').split('\x1f').map((x) => x.trim()).filter(Boolean);

    for (const row of values) {
      const id = Number(at(row, 'id'));
      if (!Number.isFinite(id)) continue;

      const seriesName = str(at(row, 'series_name'));
      const idx = Number(at(row, 'series_index'));
      const rating = Number(at(row, 'rating'));

      out.set(id, {
        title: str(at(row, 'title')),
        titleSort: str(at(row, 'title_sort')),
        authors: split(at(row, 'authors')),
        tags: split(at(row, 'tags')),
        publisher: str(at(row, 'publisher')),
        // pubdate เก็บเป็น ISO เต็ม ตัดเหลือ YYYY-MM-DD ให้ตรงรูปแบบเดียวกับ .opf
        publishedDate: str(at(row, 'pubdate'))?.slice(0, 10),
        language: str(at(row, 'lang')),
        isbn: str(at(row, 'isbn'))?.replace(/[^0-9Xx]/g, '') || undefined,
        description: str(at(row, 'description')),
        calibreId: id,
        series: seriesName
          ? { name: seriesName, index: Number.isFinite(idx) ? idx : 1 }
          : undefined,
        // Calibre เก็บ rating เป็น 0–10 (ครึ่งดาว) เหมือนใน .opf
        rating: rating > 0 ? (Math.round(rating / 2) as 1 | 2 | 3 | 4 | 5) : undefined,
      });
    }
  } finally {
    db.close();
  }

  return out;
}
