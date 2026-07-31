'use client';

import { useEffect, useState } from 'react';

/** ลงทะเบียน service worker + บอกสถานะออฟไลน์ */
export default function OfflineBar() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    if ('serviceWorker' in navigator) {
      // รอ load ก่อน ไม่งั้นการลงทะเบียน sw จะไปแย่งแบนด์วิดท์กับการโหลดหน้าแรก
      const reg = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
      if (document.readyState === 'complete') reg();
      else window.addEventListener('load', reg);
    }

    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="shrink-0 bg-[#8a5a1a] px-4 py-1.5 text-center text-[12px] font-semibold text-white">
      ออฟไลน์อยู่ — อ่านได้เฉพาะเล่มที่เก็บไว้ในเครื่อง ความคืบหน้าจะซิงก์ให้เมื่อกลับมาออนไลน์
    </div>
  );
}
