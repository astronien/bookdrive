'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { Book } from '@/lib/types';
import { makeSpineCanvas } from '@/lib/room/spine';
import { ROOM, SHELF_CONF, layoutBooks, makeBookcases } from '@/lib/room/layout';

/** จำกัดจำนวนเล่มที่ render — เกินกว่านี้เฟรมเรตตกและกินหน่วยความจำ texture มาก */
const MAX_BOOKS = 260;

const EYE = 1.62;
const SPEED = 3.2;

export default function RoomScene({
  books, onOpen,
}: { books: Book[]; onOpen: (b: Book) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [hover, setHover] = useState<Book | null>(null);
  const [ready, setReady] = useState(false);
  const [touch, setTouch] = useState(false);
  const [entered, setEntered] = useState(false);

  // เก็บใน ref เพื่อให้ event handler ใน three อ่านค่าล่าสุดได้โดยไม่ต้อง re-init scene
  const hoverRef = useRef<Book | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  /** ปุ่มเดินบนจอสัมผัส — ใช้ ref เพราะลูปเรนเดอร์อ่านทุกเฟรม */
  const walkRef = useRef(0);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !books.length) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#12101a');
    scene.fog = new THREE.Fog('#12101a', 8, 26);

    const camera = new THREE.PerspectiveCamera(70, host.clientWidth / host.clientHeight, 0.05, 100);
    camera.position.set(0, EYE, ROOM.d / 2 - 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false; // เงาแบบ realtime กับ 260 เล่มหนักเกินไป
    host.appendChild(renderer.domElement);

    // ---------- แสง ----------
    scene.add(new THREE.AmbientLight('#ffe9c9', 0.55));
    const hemi = new THREE.HemisphereLight('#ffd9a0', '#2a2438', 0.5);
    scene.add(hemi);
    for (const [x, z] of [[-6, -3], [6, -3], [0, 3]] as const) {
      const lamp = new THREE.PointLight('#ffcf8f', 22, 16, 2);
      lamp.position.set(x, ROOM.h - 0.7, z);
      scene.add(lamp);
    }

    // ---------- ห้อง ----------
    const woodDark = new THREE.MeshStandardMaterial({ color: '#4a3423', roughness: 0.85 });
    const woodMid = new THREE.MeshStandardMaterial({ color: '#5c4230', roughness: 0.8 });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, ROOM.d),
      new THREE.MeshStandardMaterial({ color: '#3b2a1c', roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, ROOM.d),
      new THREE.MeshStandardMaterial({ color: '#1d1826', roughness: 1 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = ROOM.h;
    scene.add(ceil);

    const wallMat = new THREE.MeshStandardMaterial({ color: '#2b2333', roughness: 0.95 });
    const mkWall = (w: number, x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.h), wallMat);
      m.position.set(x, ROOM.h / 2, z);
      m.rotation.y = ry;
      scene.add(m);
    };
    mkWall(ROOM.w, 0, -ROOM.d / 2, 0);
    mkWall(ROOM.w, 0, ROOM.d / 2, Math.PI);
    mkWall(ROOM.d, -ROOM.w / 2, 0, Math.PI / 2);
    mkWall(ROOM.d, ROOM.w / 2, 0, -Math.PI / 2);

    // ---------- ตู้หนังสือ ----------
    const shown = books.slice(0, MAX_BOOKS);
    const cases = makeBookcases(shown.length);
    const { SHELF_LEVELS, SHELF_BOTTOM, SHELF_GAP, CASE_DEPTH } = SHELF_CONF;
    const caseH = SHELF_BOTTOM + SHELF_LEVELS * SHELF_GAP;

    for (const c of cases) {
      const g = new THREE.Group();
      g.position.set(c.x, 0, c.z);
      g.rotation.y = c.rotY;

      // แผ่นหลัง
      const back = new THREE.Mesh(new THREE.BoxGeometry(c.width, caseH, 0.04), woodDark);
      back.position.set(0, caseH / 2, -CASE_DEPTH / 2);
      g.add(back);

      // ข้างซ้าย/ขวา
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, caseH, CASE_DEPTH), woodMid);
        side.position.set((sx * c.width) / 2, caseH / 2, 0);
        g.add(side);
      }

      // ชั้นวาง
      for (let i = 0; i <= SHELF_LEVELS; i++) {
        const y = SHELF_BOTTOM + i * SHELF_GAP;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(c.width, 0.04, CASE_DEPTH), woodMid);
        plank.position.set(0, y - 0.02, 0);
        g.add(plank);
      }
      scene.add(g);
    }

    // ---------- หนังสือ ----------
    const slots = layoutBooks(shown, cases);
    const bookGeo = new THREE.BoxGeometry(1, 1, 1);
    const bookMeshes: THREE.Mesh[] = [];
    const disposables: (THREE.Texture | THREE.Material)[] = [];

    for (const s of slots) {
      const tex = new THREE.CanvasTexture(makeSpineCanvas(s.book));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
      disposables.push(tex, mat);

      const m = new THREE.Mesh(bookGeo, mat);
      m.scale.set(s.w, s.h, s.d);
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = s.rotY;
      m.rotation.z = s.tilt;
      m.userData.book = s.book;
      m.userData.home = m.position.clone();
      scene.add(m);
      bookMeshes.push(m);
    }

    setReady(true);

    // ---------- การควบคุม ----------
    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.addEventListener('lock', () => setLocked(true));
    controls.addEventListener('unlock', () => setLocked(false));

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === 'Space' && hoverRef.current) {
        e.preventDefault();
        onOpenRef.current(hoverRef.current);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const onClick = () => {
      // จอสัมผัสไม่มี pointer lock — แตะแล้วหยิบเล่มที่เล็งอยู่ได้เลย
      if (!coarse && !controls.isLocked) {
        controls.lock();
        return;
      }
      if (hoverRef.current) onOpenRef.current(hoverRef.current);
    };
    renderer.domElement.addEventListener('click', onClick);

    // ลากนิ้วเพื่อหันกล้อง สำหรับอุปกรณ์ที่ไม่มี pointer lock
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const onTouchStart = (e: TouchEvent) => {
      dragging = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging) return;
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= dx * 0.004;
      euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x - dy * 0.004));
      camera.quaternion.setFromEuler(euler);
    };
    const onTouchEnd = () => { dragging = false; };
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true });
    renderer.domElement.addEventListener('touchend', onTouchEnd);

    // ---------- ลูปเรนเดอร์ ----------
    const raycaster = new THREE.Raycaster();
    raycaster.far = 4.5;
    const center = new THREE.Vector2(0, 0);
    const clock = new THREE.Clock();
    let last: THREE.Mesh | null = null;
    let raf = 0;

    const HALF_W = ROOM.w / 2 - 0.6;
    const HALF_D = ROOM.d / 2 - 0.6;
    const CASE_CLEAR = CASE_DEPTH + 0.45;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);

      const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + walkRef.current;
      const side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const boost = keys.has('ShiftLeft') ? 1.8 : 1;

      if (fwd) controls.moveForward(fwd * SPEED * boost * dt);
      if (side) controls.moveRight(side * SPEED * boost * dt);

      // กันเดินทะลุผนังและตู้
      const p = camera.position;
      p.x = Math.max(-HALF_W + CASE_CLEAR, Math.min(HALF_W - CASE_CLEAR, p.x));
      p.z = Math.max(-HALF_D + CASE_CLEAR, Math.min(HALF_D, p.z));
      p.y = EYE;

      // เล่มที่กำลังมอง — ดึงออกมานิดให้รู้ว่าเลือกอยู่
      raycaster.setFromCamera(center, camera);
      const hit = raycaster.intersectObjects(bookMeshes, false)[0];
      const mesh = (hit?.object as THREE.Mesh) ?? null;

      if (mesh !== last) {
        if (last) last.position.copy(last.userData.home);
        last = mesh;
        const b = (mesh?.userData.book as Book) ?? null;
        hoverRef.current = b;
        setHover(b);
      }
      if (last) {
        const home = last.userData.home as THREE.Vector3;
        const dir = new THREE.Vector3(Math.sin(last.rotation.y), 0, Math.cos(last.rotation.y));
        last.position.copy(home).addScaledVector(dir, 0.07);
      }

      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      if (!host.clientWidth) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
      renderer.domElement.removeEventListener('touchend', onTouchEnd);
      controls.disconnect();
      controlsRef.current = null;
      // texture ต่อเล่มไม่ถูกเก็บอัตโนมัติ ต้อง dispose เองไม่งั้น GPU memory รั่ว
      for (const d of disposables) d.dispose();
      bookGeo.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [books]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#12101a]">
      <div ref={hostRef} className="h-full w-full" />

      {/* เป้ากลางจอ */}
      {(locked || (touch && entered)) && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={`h-2 w-2 rounded-full ring-2 ${hover ? 'bg-accent ring-accent/40' : 'bg-white/70 ring-white/20'}`} />
        </div>
      )}

      {/* ชื่อเล่มที่กำลังมอง */}
      {hover && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 max-w-[520px] -translate-x-1/2 rounded-xl bg-black/70 px-5 py-3 text-center text-white backdrop-blur">
          <div className="text-[15px] font-semibold">{hover.title}</div>
          <div className="mt-0.5 text-[12px] opacity-70">
            {hover.authors.join(', ') || '—'}
            {hover.series && <> · {hover.series.name} #{hover.series.index}</>}
          </div>
          <div className="mt-2 text-[11px] opacity-60">คลิก หรือกด Space เพื่อหยิบ</div>
        </div>
      )}

      {/* ปุ่มเดินสำหรับจอสัมผัส — ไม่มีคีย์บอร์ดให้กด WASD */}
      {touch && entered && (
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-3">
          {([['เดินหน้า', 1], ['ถอยหลัง', -1]] as const).map(([label, dir]) => (
            <button
              key={label}
              onPointerDown={() => { walkRef.current = dir; }}
              onPointerUp={() => { walkRef.current = 0; }}
              onPointerLeave={() => { walkRef.current = 0; }}
              onPointerCancel={() => { walkRef.current = 0; }}
              className="select-none rounded-full bg-white/85 px-6 py-3 text-[13px] font-semibold text-ink shadow-lg backdrop-blur active:bg-accent"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* หน้าจอเริ่มต้น
          ต้องรับคลิกเองแล้วสั่ง lock — ตัวมันทับ canvas อยู่ คลิกจะไม่ทะลุลงไปถึง listener ข้างล่าง */}
      {!locked && !(touch && entered) && (
        <button
          type="button"
          onClick={() => {
            if (!ready) return;
            setEntered(true);
            if (!touch) controlsRef.current?.lock();
          }}
          className="absolute inset-0 grid w-full cursor-pointer place-items-center bg-black/55 backdrop-blur-sm"
        >
          <div className="max-w-[420px] rounded-2xl bg-white p-7 text-center shadow-2xl">
            <h2 className="text-[19px] font-bold">ห้องอ่านหนังสือ</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {ready
                ? touch
                  ? 'ลากนิ้วเพื่อมองรอบๆ แล้วแตะสันหนังสือเพื่อหยิบ'
                  : 'คลิกเพื่อเข้าห้อง — เดินด้วย W A S D, มองด้วยเมาส์, กด Shift เพื่อเดินเร็ว, Esc เพื่อออก'
                : 'กำลังจัดชั้นหนังสือ…'}
            </p>
            {ready && (
              <p className="mt-4 inline-block rounded-[10px] bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-[#08312e]">
                {touch ? 'แตะเพื่อเข้าห้อง' : 'คลิกเพื่อเข้าห้อง'}
              </p>
            )}
          </div>
        </button>
      )}
    </div>
  );
}
