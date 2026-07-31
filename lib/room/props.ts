import * as THREE from 'three';
import { ROOM, SHELF_CONF, type Bookcase } from './layout';
import { makeDustSprite, makePlankTexture, makeToonGradient } from './toon';

/** จานสีของห้อง — โทนไม้น้ำผึ้งกับครีม ตัดด้วยเขียวมรกตและทองอ่อน */
export const PALETTE = {
  wood: '#b07a45',
  woodDark: '#8a5a30',
  woodWarm: '#c08d55',
  wall: '#f0e0c0',
  wallShade: '#e2cda6',
  floor: '#a8703f',
  rug: '#2f6f63',
  rugEdge: '#e8c98a',
  brass: '#e8b45c',
  glow: '#ffd89b',
  leaf: '#4e8a5c',
  sky: '#ffdca8',
};

export interface World {
  update: (t: number) => void;
  dispose: () => void;
  /** ส่งต่อให้สันหนังสือใช้ gradient เดียวกัน จะได้เฉดแสงเป็นขั้นเหมือนกันทั้งห้อง */
  gradient: THREE.DataTexture;
}

/** สร้างห้องทั้งใบ คืน handle ไว้อัปเดตทุกเฟรมและคืนหน่วยความจำตอนออก */
export function buildWorld(scene: THREE.Scene, cases: Bookcase[]): World {
  const trash: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(o: T) => { trash.push(o); return o; };

  const gradient = keep(makeToonGradient());
  const toon = (color: string, opts: THREE.MeshToonMaterialParameters = {}) =>
    keep(new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts }));

  const geo = <T extends THREE.BufferGeometry>(g: T) => keep(g);

  // ---------------- พื้น + พรม ----------------
  const floorTex = keep(makePlankTexture('#a8703f', '#8a5a30', 10));
  const floor = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(ROOM.w, ROOM.d)),
    toon(PALETTE.floor, { map: floorTex })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const rug = new THREE.Mesh(geo(new THREE.CircleGeometry(3.1, 48)), toon(PALETTE.rug));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.012, 2.2);
  scene.add(rug);

  const rugRing = new THREE.Mesh(geo(new THREE.RingGeometry(2.62, 2.86, 48)), toon(PALETTE.rugEdge));
  rugRing.rotation.x = -Math.PI / 2;
  rugRing.position.set(0, 0.02, 2.2);
  scene.add(rugRing);

  // ---------------- ผนัง + เพดาน ----------------
  const wallTex = keep(makePlankTexture('#f0e0c0', '#e2cda6', 4));
  const wallMat = toon(PALETTE.wall, { map: wallTex, side: THREE.DoubleSide });

  const mkWall = (w: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, ROOM.h)), wallMat);
    m.position.set(x, ROOM.h / 2, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  mkWall(ROOM.w, 0, -ROOM.d / 2, 0);
  mkWall(ROOM.d, -ROOM.w / 2, 0, Math.PI / 2);
  mkWall(ROOM.d, ROOM.w / 2, 0, -Math.PI / 2);

  const ceiling = new THREE.Mesh(geo(new THREE.PlaneGeometry(ROOM.w, ROOM.d)), toon('#f5e8cf'));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.h;
  scene.add(ceiling);

  // คานไม้ขวางเพดาน ช่วยให้เพดานไม่โล่ง
  const beamMat = toon(PALETTE.woodDark);
  const beamGeo = geo(new THREE.BoxGeometry(ROOM.w, 0.22, 0.3));
  for (let i = -3; i <= 3; i++) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, ROOM.h - 0.12, i * 2.1);
    scene.add(beam);
  }

  // บัวเชิงผนัง
  const skirtMat = toon(PALETTE.woodWarm);
  const mkSkirt = (w: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(geo(new THREE.BoxGeometry(w, 0.22, 0.06)), skirtMat);
    m.position.set(x, 0.11, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  mkSkirt(ROOM.w, 0, -ROOM.d / 2 + 0.03, 0);
  mkSkirt(ROOM.d, -ROOM.w / 2 + 0.03, 0, Math.PI / 2);
  mkSkirt(ROOM.d, ROOM.w / 2 - 0.03, 0, -Math.PI / 2);

  // ---------------- ผนังหน้าต่าง (ด้านหลังผู้เล่นตอนเริ่ม) ----------------
  const glassMat = keep(new THREE.MeshBasicMaterial({ color: PALETTE.sky }));
  const frameMat = toon(PALETTE.woodDark);
  const winZ = ROOM.d / 2 - 0.05;

  // ผนังหน้าเจาะช่องหน้าต่าง 3 บาน — ประกอบจากแผ่นทึบรอบ ๆ แทนการเจาะจริง
  const frontWall = (w: number, h: number, x: number, y: number) => {
    const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h)), wallMat);
    m.position.set(x, y, ROOM.d / 2);
    m.rotation.y = Math.PI;
    scene.add(m);
  };
  const winW = 2.4;
  const winH = 2.3;
  const winY = 1.9;
  const gapX = 6.2;
  frontWall(ROOM.w, ROOM.h - (winY + winH / 2), 0, (winY + winH / 2) + (ROOM.h - (winY + winH / 2)) / 2);
  frontWall(ROOM.w, winY - winH / 2, 0, (winY - winH / 2) / 2);
  for (const seg of [
    { w: (ROOM.w - 2 * gapX - winW) / 2 + 0.01, x: 0 },
    { w: (gapX - winW) + 0.02, x: -gapX / 2 - winW / 4 },
    { w: (gapX - winW) + 0.02, x: gapX / 2 + winW / 4 },
    { w: ROOM.w / 2 - gapX - winW / 2, x: -(ROOM.w / 2 + gapX + winW / 2) / 2 },
    { w: ROOM.w / 2 - gapX - winW / 2, x: (ROOM.w / 2 + gapX + winW / 2) / 2 },
  ]) {
    if (seg.w <= 0) continue;
    frontWall(seg.w, winH, seg.x, winY);
  }

  const dust: THREE.Points[] = [];
  const shafts: THREE.Mesh[] = [];

  for (const wx of [-gapX, 0, gapX]) {
    // กระจก — ใช้ MeshBasic ให้สว่างคงที่เหมือนแสงจ้าข้างนอก
    const glass = new THREE.Mesh(geo(new THREE.PlaneGeometry(winW, winH)), glassMat);
    glass.position.set(wx, winY, winZ);
    glass.rotation.y = Math.PI;
    scene.add(glass);

    // กรอบและกรงเล็บแบ่งช่อง
    const fThin = geo(new THREE.BoxGeometry(0.08, winH + 0.16, 0.12));
    const fWide = geo(new THREE.BoxGeometry(winW + 0.16, 0.08, 0.12));
    for (const dx of [-winW / 2, 0, winW / 2]) {
      const bar = new THREE.Mesh(fThin, frameMat);
      bar.position.set(wx + dx, winY, winZ - 0.03);
      scene.add(bar);
    }
    for (const dy of [-winH / 2, 0, winH / 2]) {
      const bar = new THREE.Mesh(fWide, frameMat);
      bar.position.set(wx, winY + dy, winZ - 0.03);
      scene.add(bar);
    }

    // ลำแสงพาดลงพื้น — กล่องเอียงโปร่งแสงแบบ additive
    const shaft = new THREE.Mesh(
      geo(new THREE.BoxGeometry(winW * 0.92, winH * 0.92, 9)),
      keep(new THREE.MeshBasicMaterial({
        color: PALETTE.glow,
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }))
    );
    shaft.position.set(wx, winY - 0.5, winZ - 4.6);
    shaft.rotation.x = 0.16;
    scene.add(shaft);
    shafts.push(shaft);

    // ไฟจริงจากหน้าต่าง เพื่อให้วัตถุมีทิศแสงสอดคล้องกับลำแสง
    const sun = new THREE.DirectionalLight('#ffd9a0', 1.15);
    sun.position.set(wx, winY + 1.2, winZ);
    sun.target.position.set(wx * 0.4, 0, winZ - 8);
    scene.add(sun);
    scene.add(sun.target);

    // ฝุ่นลอยในลำแสง
    const N = 130;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = wx + (Math.random() - 0.5) * winW;
      pos[i * 3 + 1] = 0.3 + Math.random() * 3.2;
      pos[i * 3 + 2] = winZ - Math.random() * 8;
    }
    const g = geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, keep(new THREE.PointsMaterial({
      size: 0.05,
      map: keep(makeDustSprite()),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })));
    scene.add(pts);
    dust.push(pts);
  }

  // ---------------- ตู้หนังสือ ----------------
  const { SHELF_LEVELS, SHELF_BOTTOM, SHELF_GAP, CASE_DEPTH } = SHELF_CONF;
  const caseH = SHELF_BOTTOM + SHELF_LEVELS * SHELF_GAP;
  const caseMat = toon(PALETTE.wood);
  const caseDarkMat = toon(PALETTE.woodDark);

  for (const c of cases) {
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    g.rotation.y = c.rotY;

    const back = new THREE.Mesh(geo(new THREE.BoxGeometry(c.width, caseH, 0.05)), caseDarkMat);
    back.position.set(0, caseH / 2, -CASE_DEPTH / 2);
    g.add(back);

    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(geo(new THREE.BoxGeometry(0.07, caseH, CASE_DEPTH)), caseMat);
      side.position.set((sx * c.width) / 2, caseH / 2, 0);
      g.add(side);
    }

    for (let i = 0; i <= SHELF_LEVELS; i++) {
      const y = SHELF_BOTTOM + i * SHELF_GAP;
      const plank = new THREE.Mesh(geo(new THREE.BoxGeometry(c.width, 0.05, CASE_DEPTH)), caseMat);
      plank.position.set(0, y - 0.025, 0);
      g.add(plank);
    }

    // บัวหัวตู้ ให้ดูเป็นเฟอร์นิเจอร์ไม้จริง ไม่ใช่กล่อง
    const crown = new THREE.Mesh(
      geo(new THREE.BoxGeometry(c.width + 0.14, 0.14, CASE_DEPTH + 0.1)),
      caseDarkMat
    );
    crown.position.set(0, caseH + 0.07, 0);
    g.add(crown);

    scene.add(g);
  }

  // ---------------- โคมไฟแขวน ----------------
  const brassMat = toon(PALETTE.brass);
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: PALETTE.glow }));
  const shadeGeo = geo(new THREE.ConeGeometry(0.42, 0.4, 20, 1, true));
  const cordGeo = geo(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6));
  const bulbGeo = geo(new THREE.SphereGeometry(0.11, 12, 12));

  for (const [lx, lz] of [[-5, 0], [5, 0], [0, -3]] as const) {
    const cord = new THREE.Mesh(cordGeo, caseDarkMat);
    cord.position.set(lx, ROOM.h - 0.45, lz);
    scene.add(cord);

    const shade = new THREE.Mesh(shadeGeo, brassMat);
    shade.position.set(lx, ROOM.h - 1.0, lz);
    shade.rotation.x = Math.PI;
    scene.add(shade);

    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(lx, ROOM.h - 1.12, lz);
    scene.add(bulb);

    const lamp = new THREE.PointLight(PALETTE.glow, 14, 11, 2);
    lamp.position.set(lx, ROOM.h - 1.15, lz);
    scene.add(lamp);
  }

  // ---------------- มุมนั่งอ่าน ----------------
  const chairMat = toon('#8a4a4a');
  const chair = new THREE.Group();
  chair.position.set(-1.5, 0, 2.6);
  chair.rotation.y = 0.5;
  {
    const seat = new THREE.Mesh(geo(new THREE.BoxGeometry(0.95, 0.28, 0.9)), chairMat);
    seat.position.y = 0.42;
    chair.add(seat);
    const back = new THREE.Mesh(geo(new THREE.BoxGeometry(0.95, 0.75, 0.2)), chairMat);
    back.position.set(0, 0.9, -0.36);
    chair.add(back);
    const armGeo = geo(new THREE.BoxGeometry(0.16, 0.26, 0.9));
    for (const ax of [-0.4, 0.4]) {
      const arm = new THREE.Mesh(armGeo, chairMat);
      arm.position.set(ax, 0.68, 0);
      chair.add(arm);
    }
    const legGeo = geo(new THREE.CylinderGeometry(0.05, 0.04, 0.3, 8));
    for (const [px, pz] of [[-0.38, 0.36], [0.38, 0.36], [-0.38, -0.34], [0.38, -0.34]] as const) {
      const leg = new THREE.Mesh(legGeo, caseDarkMat);
      leg.position.set(px, 0.15, pz);
      chair.add(leg);
    }
  }
  scene.add(chair);

  // โต๊ะกลมข้างเก้าอี้ + ตะเกียง
  const table = new THREE.Group();
  table.position.set(-0.1, 0, 3.2);
  {
    const top = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 24)), caseMat);
    top.position.y = 0.56;
    table.add(top);
    const stem = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.06, 0.08, 0.56, 12)), caseDarkMat);
    stem.position.y = 0.28;
    table.add(stem);
    const base = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.24, 0.26, 0.04, 16)), caseDarkMat);
    base.position.y = 0.02;
    table.add(base);

    const lampShade = new THREE.Mesh(geo(new THREE.ConeGeometry(0.2, 0.24, 16, 1, true)), brassMat);
    lampShade.position.y = 0.92;
    lampShade.rotation.x = Math.PI;
    table.add(lampShade);
    const lampStem = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8)), brassMat);
    lampStem.position.y = 0.74;
    table.add(lampStem);
  }
  scene.add(table);
  const deskLight = new THREE.PointLight('#ffca7a', 6, 4.5, 2);
  deskLight.position.set(-0.1, 0.9, 3.2);
  scene.add(deskLight);

  // ---------------- ต้นไม้ในกระถาง ----------------
  const plant = new THREE.Group();
  plant.position.set(ROOM.w / 2 - 2.0, 0, ROOM.d / 2 - 2.0);
  {
    const pot = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.3, 0.22, 0.42, 16)), toon('#b5643f'));
    pot.position.y = 0.21;
    plant.add(pot);
    const leafMat = toon(PALETTE.leaf);
    const leafGeo = geo(new THREE.SphereGeometry(0.34, 12, 10));
    for (const [lx, ly, lz, sc] of [
      [0, 0.78, 0, 1], [0.26, 0.62, 0.1, 0.75], [-0.24, 0.66, -0.08, 0.8], [0.05, 1.02, -0.06, 0.6],
    ] as const) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(lx, ly, lz);
      leaf.scale.setScalar(sc);
      plant.add(leaf);
    }
  }
  scene.add(plant);

  // ---------------- บันไดพาดชั้นหนังสือ ----------------
  const ladder = new THREE.Group();
  ladder.position.set(-3.0, 0, -ROOM.d / 2 + 1.05);
  ladder.rotation.x = -0.13;
  {
    const railGeo = geo(new THREE.BoxGeometry(0.07, 3.1, 0.07));
    for (const rx of [-0.26, 0.26]) {
      const rail = new THREE.Mesh(railGeo, caseMat);
      rail.position.set(rx, 1.55, 0);
      ladder.add(rail);
    }
    const rungGeo = geo(new THREE.BoxGeometry(0.6, 0.05, 0.05));
    for (let i = 0; i < 8; i++) {
      const rung = new THREE.Mesh(rungGeo, caseDarkMat);
      rung.position.set(0, 0.35 + i * 0.36, 0);
      ladder.add(rung);
    }
  }
  scene.add(ladder);

  // ---------------- แสงรวม ----------------
  scene.add(new THREE.AmbientLight('#ffeed2', 0.75));
  scene.add(new THREE.HemisphereLight('#fff0d0', '#7a5a3a', 0.65));

  return {
    update(t: number) {
      // ฝุ่นลอยขึ้นช้า ๆ แล้ววนกลับลงมาเมื่อถึงเพดาน
      for (const p of dust) {
        const arr = p.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < arr.count; i++) {
          let y = arr.getY(i) + 0.0016;
          const x = arr.getX(i) + Math.sin(t * 0.5 + i) * 0.0009;
          if (y > 3.6) y = 0.25;
          arr.setY(i, y);
          arr.setX(i, x);
        }
        arr.needsUpdate = true;
      }
      // ลำแสงหายใจเบา ๆ ให้ดูมีชีวิต
      for (const s of shafts) {
        (s.material as THREE.MeshBasicMaterial).opacity = 0.055 + Math.sin(t * 0.6) * 0.015;
      }
    },
    dispose() {
      for (const d of trash) d.dispose();
    },
    gradient,
  };
}
