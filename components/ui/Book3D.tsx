'use client';

import type React from 'react';

interface Props {
  /** หน้าปก — รูปจริงหรือ gradient สำรอง */
  cover: React.ReactNode;
  title: string;
  /** สีสันปก ควรดึงมาจากจานสีเดียวกับปกสำรองเพื่อให้กลมกลืน */
  color: string;
  colorDark: string;
  /** ความหนาเป็น px */
  depth?: number;
  children?: React.ReactNode;
}

/**
 * หนังสือเป็นกล่องสามมิติจริง ประกอบจาก 5 ด้าน
 *
 * ระนาบเดียวที่หมุนจะดูเป็นกระดาษแข็งบาง ๆ เอียงไปมา ไม่มีวันเห็นสัน
 * พอทำเป็นกล่องแล้วเอียงขวาจะเห็นสันปก เอียงซ้ายเห็นขอบกระดาษ เงยขึ้นเห็นขอบบน
 */
export default function Book3D({
  cover, title, color, colorDark, depth = 20, children,
}: Props) {
  return (
    <div
      className="book3d"
      style={{ '--d': `${depth}px` } as React.CSSProperties}
    >
      {/* หลังปก — เห็นเฉพาะตอนเอียงแรง ๆ */}
      <div className="b-face b-back" style={{ background: colorDark }} />

      {/* สันปก */}
      <div
        className="b-face b-spine"
        style={{ background: `linear-gradient(90deg, ${colorDark}, ${color} 45%, ${colorDark})` }}
      >
        <span className="b-spine-text">{title}</span>
      </div>

      {/* ขอบกระดาษด้านเปิด */}
      <div className="b-face b-edge" />

      {/* ขอบกระดาษด้านบน */}
      <div className="b-face b-top" />

      {/* หน้าปก */}
      <div className="b-face b-front">
        {cover}
        {children}
      </div>
    </div>
  );
}
