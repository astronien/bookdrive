'use client';

export type ReaderTheme = 'light' | 'sepia' | 'dark' | 'night';
export type ReaderFlow = 'paginated' | 'scrolled';

export interface ReaderPrefs {
  theme: ReaderTheme;
  /** 'serif' | 'sans' | 'dyslexic' หรือชื่อ family ของฟอนต์ที่ผู้ใช้เพิ่มเอง (ขึ้นต้น bd-) */
  fontFamily: string;
  fontSize: number;      // px
  lineHeight: number;    // ตัวคูณ
  width: number;         // ความกว้างคอลัมน์สูงสุด px
  margin: number;        // ระยะขอบบน/ล่าง px
  flow: ReaderFlow;
  justify: boolean;
}

export const DEFAULT_PREFS: ReaderPrefs = {
  theme: 'light',
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.7,
  width: 680,
  margin: 40,
  flow: 'paginated',
  justify: true,
};

/**
 * เก็บใน localStorage ไม่ใช่ Drive โดยตั้งใจ
 * ขนาดตัวอักษรกับความกว้างคอลัมน์ที่พอดีบนจอ 27 นิ้ว ไม่มีทางพอดีบนมือถือ
 * ค่าพวกนี้จึงควรเป็นของเครื่อง ไม่ใช่ของบัญชี — ต่างจาก progress/ไฮไลต์ที่ต้องตามไปทุกเครื่อง
 */
const KEY = 'bd-reader-prefs';

export function loadPrefs(): ReaderPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: ReaderPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* โหมดส่วนตัวของบางเบราว์เซอร์เขียนไม่ได้ — ไม่ใช่เรื่องคอขาดบาดตาย */
  }
}

export const THEMES: Record<ReaderTheme, { bg: string; fg: string; label: string; link: string }> = {
  light: { bg: '#fdfcf8', fg: '#2b2b2b', link: '#1f6feb', label: 'สว่าง' },
  sepia: { bg: '#f4ecd8', fg: '#4a3f2e', link: '#8a5a1a', label: 'ซีเปีย' },
  dark:  { bg: '#1a1c22', fg: '#c8ccd6', link: '#79b8ff', label: 'มืด' },
  night: { bg: '#000000', fg: '#9aa0ab', link: '#5aa9e6', label: 'กลางคืน' },
};

/* re-export ให้ที่เดิมยังเรียกได้เหมือนเดิม — ตัวจริงอยู่ใน fontCatalog.ts
   ซึ่งไม่มี 'use client' เพราะ app/layout.tsx ที่เป็น server component ต้องใช้ด้วย */
export {
  BUILTIN_FONTS, FONT_GROUP_LABEL, GOOGLE_FONTS_HREF, fontStackFor, type BuiltinFontDef,
} from './fontCatalog';

/** แปลงวินาทีเป็นข้อความอ่านง่าย */
export function fmtDuration(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  return `${h} ชม ${m % 60} น`;
}
