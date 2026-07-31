import type { Book } from '@/lib/types';

export interface BookSlot {
  book: Book;
  /** ตำแหน่งกลางสันหนังสือในพิกัดโลก */
  x: number;
  y: number;
  z: number;
  /** ขนาดเล่ม */
  w: number;   // ความหนาสัน
  h: number;   // ความสูง
  d: number;   // ความลึก
  rotY: number;
  /** เอียงเล็กน้อยให้ดูเป็นธรรมชาติ */
  tilt: number;
}

export interface Bookcase {
  x: number;
  z: number;
  rotY: number;
  width: number;
}

export const ROOM = { w: 22, h: 4.2, d: 16 };

const SHELF_LEVELS = 5;
const SHELF_BOTTOM = 0.42;
const SHELF_GAP = 0.52;
const CASE_DEPTH = 0.32;
const CASE_WIDTH = 2.6;

/** ชั้นหนึ่งจุได้ราวนี้ ใช้คำนวณว่าต้องตั้งตู้กี่ตู้ */
const TARGET_PER_SHELF = 30;

/**
 * ตู้หนังสือวางชิดผนังสามด้าน เว้นด้านหน้าไว้เป็นทางเข้า
 *
 * จำนวนตู้ผันตามจำนวนหนังสือ — ถ้าตั้งตู้เต็มห้องแต่มีหนังสือไม่กี่ร้อยเล่ม
 * จะเหลือชั้นว่างเป็นสิบ ดูเหมือนห้องร้างมากกว่าห้องสมุด
 */
export function makeBookcases(bookCount: number): Bookcase[] {
  const shelvesNeeded = Math.max(5, Math.ceil(bookCount / TARGET_PER_SHELF));
  const want = Math.min(15, Math.max(2, Math.ceil(shelvesNeeded / SHELF_LEVELS)));

  const all: Bookcase[] = [];
  const backZ = -ROOM.d / 2 + CASE_DEPTH / 2 + 0.02;
  const sideX = ROOM.w / 2 - CASE_DEPTH / 2 - 0.02;

  // เรียงจากกลางผนังหลังออกไปด้านข้าง เพื่อให้ตู้ชุดแรกอยู่ตรงหน้าผู้เล่นพอดี
  const backOrder = [0, -1, 1, -2, 2, -3, 3];
  for (const i of backOrder) {
    all.push({ x: i * (CASE_WIDTH + 0.12), z: backZ, rotY: 0, width: CASE_WIDTH });
  }
  for (let i = -2; i <= 1; i++) {
    const z = i * (CASE_WIDTH + 0.12) + CASE_WIDTH / 2;
    all.push({ x: -sideX, z, rotY: Math.PI / 2, width: CASE_WIDTH });
    all.push({ x: sideX, z, rotY: -Math.PI / 2, width: CASE_WIDTH });
  }

  return all.slice(0, want);
}

function rand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * วางหนังสือกระจายให้ทุกชั้นมีจำนวนใกล้เคียงกัน
 * ถ้าไล่เติมชั้นแรกจนเต็มก่อน ชั้นบนจะว่างโล่งทั้งหมด
 */
export function layoutBooks(books: Book[], cases: Bookcase[]): BookSlot[] {
  const slots: BookSlot[] = [];
  const totalShelves = cases.length * SHELF_LEVELS;
  if (!totalShelves) return slots;

  const perShelf = Math.ceil(books.length / totalShelves);
  let idx = 0;

  for (const c of cases) {
    for (let level = 0; level < SHELF_LEVELS; level++) {
      const shelfY = SHELF_BOTTOM + level * SHELF_GAP;
      let cursor = -c.width / 2 + 0.08;
      let placed = 0;

      while (placed < perShelf && idx < books.length) {
        const book = books[idx];
        const r = rand(idx + 1);

        const w = 0.032 + r * 0.028;              // หนา 3.2–6 ซม.
        const h = 0.30 + rand(idx + 7) * 0.09;    // สูง 30–39 ซม.
        const d = CASE_DEPTH - 0.06 - rand(idx + 13) * 0.04;

        if (cursor + w > c.width / 2 - 0.08) break; // ชั้นเต็มก่อนถึงโควตา

        const localX = cursor + w / 2;
        const localZ = 0.02;
        const cos = Math.cos(c.rotY);
        const sin = Math.sin(c.rotY);

        slots.push({
          book,
          x: c.x + localX * cos + localZ * sin,
          z: c.z - localX * sin + localZ * cos,
          y: shelfY + h / 2,
          w, h, d,
          rotY: c.rotY,
          tilt: rand(idx + 23) < 0.1 ? (rand(idx + 31) - 0.5) * 0.1 : 0,
        });

        cursor += w + 0.004;
        placed++;
        idx++;
      }
    }
  }

  return slots;
}

export const SHELF_CONF = { SHELF_LEVELS, SHELF_BOTTOM, SHELF_GAP, CASE_DEPTH, CASE_WIDTH };
