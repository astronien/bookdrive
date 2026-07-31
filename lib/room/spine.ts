import type { Book } from '@/lib/types';

/** จานสีสันหนังสือ — เลี่ยงสีจัดจ้าน ให้ดูเหมือนชั้นหนังสือจริง */
const CLOTH = [
  ['#8c3b3b', '#f2e2c4'], ['#2f4858', '#e8e2d0'], ['#5b6b3a', '#f0ead6'],
  ['#6b4226', '#f5e6cf'], ['#3d3b56', '#e6e1f0'], ['#7a5c2e', '#f7efdd'],
  ['#2c5545', '#e4efe6'], ['#6e2f4a', '#f6e4ec'], ['#37474f', '#eceff1'],
];

function hashOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function spineColors(key: string) {
  return CLOTH[hashOf(key) % CLOTH.length];
}

/**
 * สร้าง texture สันหนังสือด้วย canvas
 *
 * ทำไมไม่ใช้ปกจริง: ปกเป็นภาพหน้าปก ไม่ใช่สัน ถ้าเอามาแปะจะยืดจนอ่านไม่ออก
 * และการโหลดรูปหลายร้อยไฟล์พร้อมกันจะยิง /api/drive/file ถล่มทลาย
 * วาดเองเบากว่ามากและอ่านชื่อได้จริง
 */
export function makeSpineCanvas(book: Book): HTMLCanvasElement {
  const W = 64;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const [bg, fg] = spineColors(book.id);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ไล่เฉดให้ขอบสันดูมีความหนา
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(0,0,0,.35)');
  grad.addColorStop(0.18, 'rgba(255,255,255,.10)');
  grad.addColorStop(0.85, 'rgba(0,0,0,.05)');
  grad.addColorStop(1, 'rgba(0,0,0,.4)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // เส้นคาดหัวท้ายแบบปกผ้า
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  for (const y of [22, 30, H - 30, H - 22]) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(W - 8, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ชื่อเรื่องแนวตั้ง
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let title = book.title;
  if (book.series && book.series.index) title = `${title} #${book.series.index}`;

  let size = 17;
  ctx.font = `600 ${size}px "Noto Sans Thai", sans-serif`;
  // ย่อจนพอดีความสูงของสัน แล้วค่อยตัดถ้ายังยาวเกิน
  while (ctx.measureText(title).width > H - 76 && size > 9) {
    size -= 1;
    ctx.font = `600 ${size}px "Noto Sans Thai", sans-serif`;
  }
  if (ctx.measureText(title).width > H - 76) {
    while (title.length > 4 && ctx.measureText(title + '…').width > H - 76) {
      title = title.slice(0, -1);
    }
    title += '…';
  }

  ctx.fillText(title, 0, 1);
  ctx.restore();

  return c;
}
