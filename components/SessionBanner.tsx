'use client';

import { useEffect, useState } from 'react';

/**
 * เตือนก่อน refresh token หมดอายุ
 *
 * แอปติดอยู่ใน Testing mode ของ Google (เพราะใช้ restricted scope drive.readonly)
 * ซึ่งจำกัดอายุ refresh token ไว้ที่ 7 วัน แก้ที่ต้นเหตุไม่ได้ถ้าไม่ผ่าน CASA
 * ทำได้อย่างเดียวคือบอกล่วงหน้า ไม่ให้ไปพังตอนกำลังอ่านค้างอยู่
 */
const WEEK = 7 * 24 * 3600;

export default function SessionBanner({ authAt, error }: { authAt?: number; error?: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(iv);
  }, []);

  if (error) {
    return (
      <Bar tone="bad">
        การเชื่อมต่อ Google หมดอายุแล้ว ซิงก์กับ Drive ไม่ได้จนกว่าจะล็อกอินใหม่
        <Action />
      </Bar>
    );
  }

  if (!authAt || dismissed) return null;

  const left = authAt + WEEK - now;
  if (left > 2 * 24 * 3600) return null;   // เหลือเกิน 2 วัน ยังไม่ต้องกวนใจ

  const days = Math.floor(left / 86400);
  const hours = Math.floor((left % 86400) / 3600);

  return (
    <Bar tone={left < 86400 ? 'bad' : 'warn'}>
      การเชื่อมต่อ Google จะหมดอายุใน{' '}
      <b>{left <= 0 ? 'อีกไม่กี่นาที' : days > 0 ? `${days} วัน ${hours} ชม` : `${hours} ชม`}</b>
      {' '}— ล็อกอินใหม่ตอนนี้จะได้ไม่สะดุดกลางทาง
      <Action />
      <button onClick={() => setDismissed(true)} className="ml-2 underline opacity-70 hover:opacity-100">
        ไว้ก่อน
      </button>
    </Bar>
  );
}

function Action() {
  return (
    <a href="/api/auth/signin?callbackUrl=%2Flibrary"
      className="ml-2 rounded bg-white/20 px-2 py-0.5 font-semibold underline-offset-2 hover:bg-white/30">
      ล็อกอินใหม่
    </a>
  );
}

function Bar({ tone, children }: { tone: 'warn' | 'bad'; children: React.ReactNode }) {
  return (
    <div className={`shrink-0 px-4 py-1.5 text-center text-[12px] text-white ${tone === 'bad' ? 'bg-coral' : 'bg-[#8a5a1a]'}`}>
      {children}
    </div>
  );
}
