/* ไฟล์นี้ตั้งใจ *ไม่* ใส่ 'use client'
   app/layout.tsx เป็น server component และต้องใช้ GOOGLE_FONTS_HREF เป็นสตริงจริง
   ถ้า import มาจากโมดูลที่ประกาศ 'use client' ค่าที่ได้จะเป็น client reference
   ไม่ใช่สตริง แล้ว <link href> จะพัง — prefs.ts จึง re-export ต่อจากที่นี่แทน */

/**
 * ฟอนต์ในตัว — คัดเฉพาะตัวที่ *มีอักขระไทยครบ* เพราะไลบรารีของผู้ใช้เป็นไทยเกือบทั้งหมด
 *
 * เดิม FONT_STACK อ้างชื่ออย่าง 'Lora' / 'Inter' / 'Noto Serif Thai' ไว้เฉย ๆ
 * โดยที่แอปไม่เคยโหลด webfont เลยสักตัว ชื่อพวกนั้นจึงไม่ชี้ไปไหน ตกไปใช้
 * Georgia/system-ui หมด สามตัวเลือกเดิมเลยหน้าตาเหมือนกันทั้งสามอัน
 *
 * ทุกตัวที่มี `google` ถูกทดสอบกับ fonts.googleapis.com แล้วว่าคืน 200
 * และมี subset ไทยจริง (ตรวจจาก @font-face ที่มีช่วง U+0E01)
 */
export interface BuiltinFontDef {
  id: string;
  label: string;
  /** ชื่อ family จริงที่ใช้ใน CSS */
  family: string;
  /** ส่วนที่ต่อท้าย ?family= ของ Google Fonts — ไม่มี = ใช้ฟอนต์ในเครื่อง */
  google?: string;
  group: 'sans' | 'serif' | 'looped' | 'a11y';
}

export const BUILTIN_FONTS: BuiltinFontDef[] = [
  // ---- ไม่มีหัว ----
  { id: 'sans', label: 'Noto Sans Thai', family: 'Noto Sans Thai', google: 'Noto+Sans+Thai:wght@400;700', group: 'sans' },
  { id: 'sarabun', label: 'Sarabun', family: 'Sarabun', google: 'Sarabun:wght@400;700', group: 'sans' },
  { id: 'plex', label: 'IBM Plex Thai', family: 'IBM Plex Sans Thai', google: 'IBM+Plex+Sans+Thai:wght@400;700', group: 'sans' },
  { id: 'prompt', label: 'Prompt', family: 'Prompt', google: 'Prompt:wght@400;700', group: 'sans' },
  { id: 'baijamjuree', label: 'Bai Jamjuree', family: 'Bai Jamjuree', google: 'Bai+Jamjuree:wght@400;700', group: 'sans' },

  // ---- มีเชิง เหมาะกับอ่านยาว ----
  { id: 'serif', label: 'Noto Serif Thai', family: 'Noto Serif Thai', google: 'Noto+Serif+Thai:wght@400;700', group: 'serif' },
  { id: 'maitree', label: 'Maitree', family: 'Maitree', google: 'Maitree:wght@400;700', group: 'serif' },
  { id: 'taviraj', label: 'Taviraj', family: 'Taviraj', google: 'Taviraj:wght@400;700', group: 'serif' },
  { id: 'trirong', label: 'Trirong', family: 'Trirong', google: 'Trirong:wght@400;700', group: 'serif' },

  // ---- มีหัว แบบไทยดั้งเดิม ----
  { id: 'plex-looped', label: 'IBM Plex Thai (มีหัว)', family: 'IBM Plex Sans Thai Looped', google: 'IBM+Plex+Sans+Thai+Looped:wght@400;700', group: 'looped' },
  { id: 'charm', label: 'Charm (มีหัว)', family: 'Charm', google: 'Charm:wght@400;700', group: 'looped' },

  // ---- ช่วยการอ่าน ----
  // ตัวอักษรหนักด้านล่างช่วยกันสลับตัวสำหรับผู้มีภาวะดิสเล็กเซีย
  // ตัวนี้ไม่มีอักขระไทย จึงต้องพึ่ง fallback ไทยท้าย stack เป็นพิเศษ
  { id: 'dyslexic', label: 'Atkinson Hyperlegible', family: 'Atkinson Hyperlegible', google: 'Atkinson+Hyperlegible:wght@400;700', group: 'a11y' },
];

export const FONT_GROUP_LABEL: Record<BuiltinFontDef['group'], string> = {
  sans: 'ไม่มีหัว',
  serif: 'มีเชิง',
  looped: 'มีหัว',
  a11y: 'ช่วยการอ่าน',
};

/** URL เดียวโหลดครบทุกตัว — ตัว CSS เล็ก ไฟล์ฟอนต์จริงโหลดเฉพาะตัวที่ถูกใช้ */
export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?' +
  BUILTIN_FONTS.filter((f) => f.google).map((f) => `family=${f.google}`).join('&') +
  '&display=swap';

const BY_ID = new Map(BUILTIN_FONTS.map((f) => [f.id, f]));

/**
 * แปลงค่า fontFamily ที่บันทึกไว้ให้เป็น CSS font stack
 *
 * ฟอนต์ที่ผู้ใช้เพิ่มเองไม่ได้อยู่ใน FONT_STACK จึงต้องต่อ fallback ให้เอง —
 * ฟอนต์ละตินหลายตัวไม่มีสระไทย ถ้าไม่มีตัวสำรองต่อท้าย ข้อความไทยจะกลายเป็นกล่องว่าง
 */
export function fontStackFor(f: string): string {
  const def = BY_ID.get(f);
  const head = def ? `'${def.family}'` : `'${f}'`;
  /* ต่อ fallback ไทยท้าย stack เสมอ — ฟอนต์ละตินหลายตัว (เช่น Atkinson) ไม่มีสระไทย
     ถ้าไม่ต่อ ข้อความไทยจะกลายเป็นกล่องว่างทั้งเล่ม ซึ่งกับไลบรารีนี้คือพังทันที
     เพราะหนังสือ 215 จาก 221 เล่มเป็นภาษาไทย */
  const tail =
    def?.group === 'serif'
      ? "'Noto Serif Thai', Georgia, serif"
      : "'Noto Sans Thai', system-ui, sans-serif";
  return `${head}, ${tail}`;
}

