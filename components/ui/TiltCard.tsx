'use client';

import { useCallback, useEffect, useRef } from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  /** องศาเอียงสูงสุด */
  max?: number;
  /** ยกขึ้นมากี่ px ตอนชี้ */
  lift?: number;
  /** ความแรงของแสงสะท้อนที่วิ่งตามเมาส์ (0 = ปิด) */
  glare?: number;
}

/**
 * การ์ดเอียงตามเมาส์แบบหน้า Apple TV
 *
 * เขียน CSS variable ลง DOM ตรง ๆ ไม่ผ่าน React state — ไลบรารีมีการ์ดหลายร้อยใบ
 * ถ้า setState ทุก pointermove จะ re-render ทั้งกริดวินาทีละหลายสิบครั้ง
 * และ throttle ด้วย rAF เพราะ pointermove ยิงถี่กว่าเฟรมเรตจอ
 */
export default function TiltCard({
  children, className = '', max = 12, lift = 10, glare = 0.35,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const next = useRef({ px: 0.5, py: 0.5 });
  const enabled = useRef(true);

  useEffect(() => {
    // จอสัมผัสไม่มี hover ให้เอียงตาม และผู้ที่ตั้งค่าลดการเคลื่อนไหวก็ควรได้ภาพนิ่ง
    enabled.current =
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const apply = useCallback(() => {
    raf.current = 0;
    const el = ref.current;
    if (!el) return;
    const { px, py } = next.current;
    el.style.setProperty('--rx', `${(0.5 - py) * max}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * max}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  }, [max]);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    next.current = {
      px: (e.clientX - r.left) / r.width,
      py: (e.clientY - r.top) / r.height,
    };
    if (!raf.current) raf.current = requestAnimationFrame(apply);
  };

  const onEnter = () => {
    if (!enabled.current) return;
    ref.current?.style.setProperty('--on', '1');
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--on', '0');
    // คืนสู่ตำแหน่งตรงอย่างนุ่มนวล transition ที่ตั้งไว้จะจัดการให้เอง
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      className={`tilt ${className}`}
      style={{ perspective: '900px' }}
    >
      <div className="tilt-inner">
        {children}
        {glare > 0 && (
          <span
            aria-hidden
            className="tilt-glare"
            style={{ '--glare': glare } as React.CSSProperties}
          />
        )}
      </div>
    </div>
  );
}
