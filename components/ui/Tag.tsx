import type { BookFormat } from '@/lib/types';

/** แต่ละฟอร์แมตมีสีของตัวเอง — กวาดตาดูทั้งชั้นแล้วแยกออกทันทีโดยไม่ต้องอ่าน */
const FORMAT_STYLE: Record<BookFormat, string> = {
  epub: 'bg-[#1f7a6e] text-white',
  pdf: 'bg-[#b8442f] text-white',
  mobi: 'bg-[#a06510] text-white',
  cbz: 'bg-[#6d4bb0] text-white',
  cbr: 'bg-[#6d4bb0] text-white',
  txt: 'bg-[#4b5563] text-white',
};

const BASE =
  'inline-flex items-center rounded-md px-1.5 py-[3px] text-[10px] font-bold uppercase leading-none tracking-wide shadow-sm';

export function FormatTag({ format }: { format: BookFormat }) {
  return <span className={`${BASE} ${FORMAT_STYLE[format]}`}>{format}</span>;
}

export function CountTag({ children }: { children: React.ReactNode }) {
  return <span className={`${BASE} bg-navy text-white normal-case`}>{children}</span>;
}

export function DoneTag({ children }: { children: React.ReactNode }) {
  return <span className={`${BASE} bg-accent text-[#08312e] normal-case`}>{children}</span>;
}
