/**
 * เอียงการ์ดตามการหมุนเครื่อง (มือถือ/แท็บเล็ต)
 *
 * ทำไมไม่ใส่ listener ไว้ในทุกการ์ด — หน้าไลบรารีมีการ์ดร้อยกว่าใบ และเวลาเอียงเครื่อง
 * *ทุกใบเอียงเท่ากันหมด* ไม่เหมือนเมาส์ที่เอียงเฉพาะใบที่ชี้อยู่ จึงเขียนมุมลง
 * CSS variable บน <html> ที่เดียว แล้วให้ CSS กระจายไปทุกใบเอง
 * ผลคือมี JS ทำงานเฟรมละครั้งเดียวไม่ว่าจะมีการ์ดกี่ใบ
 *
 * iOS 13+ บังคับว่า DeviceOrientationEvent.requestPermission() ต้องถูกเรียก
 * จาก user gesture เท่านั้น จึงต้องมีปุ่มให้กด เรียกตอนโหลดหน้าเงียบ ๆ ไม่ได้
 */

const MAX_DEG = 14;   // เกินนี้ดูเว่อร์และทำให้อ่านชื่อใต้ปกลำบาก
const RANGE = 26;     // เอียงเครื่องกี่องศาถึงจะได้มุมสูงสุด

type Perm = 'unsupported' | 'granted' | 'denied' | 'prompt';

interface DOEWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function doe(): (typeof DeviceOrientationEvent & DOEWithPermission) | undefined {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
    ? (window.DeviceOrientationEvent as typeof DeviceOrientationEvent & DOEWithPermission)
    : undefined;
}

/** อุปกรณ์นี้มีเซนเซอร์ให้ใช้ไหม */
export function motionSupported(): boolean {
  return !!doe();
}

/** iOS ต้องขออนุญาตก่อน ส่วน Android/เดสก์ท็อปส่วนใหญ่ใช้ได้เลย */
export function motionNeedsPermission(): boolean {
  return typeof doe()?.requestPermission === 'function';
}

/** ต้องเรียกจากใน onClick เท่านั้น — ถ้าเรียกนอก user gesture iOS จะปฏิเสธทันที */
export async function requestMotionPermission(): Promise<Perm> {
  const E = doe();
  if (!E) return 'unsupported';
  if (typeof E.requestPermission !== 'function') return 'granted';
  try {
    return await E.requestPermission();
  } catch {
    return 'denied';
  }
}

let running = false;
let raf = 0;
let base: { beta: number; gamma: number } | null = null;
let target = { rx: 0, ry: 0 };
let shown = { rx: 0, ry: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function onOrient(e: DeviceOrientationEvent) {
  const { beta, gamma } = e;
  if (beta == null || gamma == null) return;

  /* จับค่าแรกเป็นจุดศูนย์ — คนถือมือถืออ่านหนังสือมักเอียงเข้าหาตัวราว 40-60°
     ถ้าวัดจากแนวราบจริง การ์ดจะเอียงค้างสุดตั้งแต่ยังไม่ขยับเครื่องเลย */
  base ??= { beta, gamma };

  /* ข้ามเส้น ±180 ของ beta ตอนพลิกเครื่อง จะกระโดดทั้งรอบ
     ดึงส่วนต่างกลับเข้าช่วง -180..180 ก่อนเสมอ */
  let db = beta - base.beta;
  if (db > 180) db -= 360;
  if (db < -180) db += 360;
  const dg = gamma - base.gamma;

  target = {
    rx: clamp(-db / RANGE, -1, 1) * MAX_DEG,
    ry: clamp(dg / RANGE, -1, 1) * MAX_DEG,
  };
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  raf = 0;
  /* เกลี่ยเข้าหาเป้าหมายทีละ 18% ต่อเฟรม — ค่าดิบจากเซนเซอร์สั่นตลอดเวลา
     ถ้าเอาไปใช้ตรง ๆ การ์ดจะกระตุกแม้วางเครื่องนิ่งบนโต๊ะ */
  shown = {
    rx: shown.rx + (target.rx - shown.rx) * 0.18,
    ry: shown.ry + (target.ry - shown.ry) * 0.18,
  };

  const s = document.documentElement.style;
  s.setProperty('--drx', `${shown.rx.toFixed(2)}deg`);
  s.setProperty('--dry', `${shown.ry.toFixed(2)}deg`);

  // ยังไม่นิ่งพอก็วาดต่อ นิ่งแล้วหยุด ไม่ต้องกิน CPU ตอนวางเครื่องไว้เฉย ๆ
  if (Math.abs(target.rx - shown.rx) > 0.02 || Math.abs(target.ry - shown.ry) > 0.02) {
    raf = requestAnimationFrame(tick);
  }
}

export function startTilt() {
  if (running || !motionSupported()) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  running = true;
  base = null;
  window.addEventListener('deviceorientation', onOrient);
  document.documentElement.classList.add('tilt-motion');
}

export function stopTilt() {
  if (!running) return;
  running = false;
  window.removeEventListener('deviceorientation', onOrient);
  cancelAnimationFrame(raf);
  raf = 0;
  const s = document.documentElement.style;
  s.setProperty('--drx', '0deg');
  s.setProperty('--dry', '0deg');
  document.documentElement.classList.remove('tilt-motion');
}

/** ตั้งจุดศูนย์ใหม่ตามท่าที่ถืออยู่ตอนนี้ — ใช้ตอนเปลี่ยนจากนั่งเป็นนอน */
export function recenterTilt() {
  base = null;
}
