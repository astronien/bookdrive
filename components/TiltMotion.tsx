'use client';

import { useEffect } from 'react';
import { db } from '@/lib/db/idb';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/types';
import { startTilt, stopTilt, recenterTilt } from '@/lib/tilt/orientation';

/**
 * เปิด/ปิดการเอียงการ์ดตามการหมุนเครื่อง ตามค่าที่ตั้งไว้ในหน้าตั้งค่า
 *
 * อ่านจาก IndexedDB ไม่ใช่จาก API เพราะตัวนี้อยู่ในทุกหน้า ยิง API ทุกครั้งที่เปลี่ยนหน้า
 * เพื่อเช็ค flag ตัวเดียวไม่คุ้ม และค่านี้ถูก sync ลง IndexedDB อยู่แล้วตอนเปิดหน้าตั้งค่า
 *
 * ไม่ขอสิทธิ์เองที่นี่ — iOS ยอมรับ requestPermission() เฉพาะที่มาจาก user gesture
 * การขอตอนโหลดหน้าจะโดนปฏิเสธทันทีและเสียสิทธิ์ไปเปล่า ๆ ปุ่มขออยู่ในหน้าตั้งค่า
 */
export default function TiltMotion() {
  useEffect(() => {
    let alive = true;

    (async () => {
      const row = await db.meta.get('settings');
      const s = { ...DEFAULT_SETTINGS, ...((row?.data as Settings) ?? {}) };
      if (alive && s.tiltOnMotion) startTilt();
    })();

    // กลับมาจากแอปอื่นหรือหมุนจอ ท่าถือมักเปลี่ยนไปแล้ว ตั้งจุดศูนย์ใหม่
    const recenter = () => recenterTilt();
    window.addEventListener('orientationchange', recenter);
    document.addEventListener('visibilitychange', recenter);

    return () => {
      alive = false;
      window.removeEventListener('orientationchange', recenter);
      document.removeEventListener('visibilitychange', recenter);
      stopTilt();
    };
  }, []);

  return null;
}
