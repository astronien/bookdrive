import * as THREE from 'three';

/**
 * gradient map สำหรับ MeshToonMaterial
 * แสงจะถูกไล่เป็นขั้นแทนที่จะไล่ต่อเนื่อง = ได้หน้าตาแบบ cel-shaded ในการ์ตูน
 * ยิ่งขั้นน้อยยิ่งดูเป็นการ์ตูนจัด 4 ขั้นกำลังพอดี ไม่แบนจนดูแปลก
 */
export function makeToonGradient(steps: number[] = [70, 130, 190, 245]): THREE.DataTexture {
  const data = new Uint8Array(steps);
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** วงกลมฟุ้ง ๆ ใช้เป็นเม็ดฝุ่นลอยในลำแสง */
export function makeDustSprite(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,244,214,1)');
  g.addColorStop(0.35, 'rgba(255,238,196,.55)');
  g.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** ผนัง/พื้นเรียบ ๆ ดูโล่ง — ใส่ลายไม้กับรอยฉาบให้มีเนื้อ */
export function makePlankTexture(base: string, line: string, repeat = 8): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  // เสี้ยนไม้
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 256, y);
    ctx.bezierCurveTo(80, y + 2, 160, y - 2, 256, y + (Math.random() - 0.5) * 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
