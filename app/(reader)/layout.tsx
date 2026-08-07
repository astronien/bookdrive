import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import TiltMotion from '@/components/TiltMotion';

/**
 * layout ของหน้าอ่านโดยเฉพาะ — ไม่มี AppNav
 *
 * เดิมหน้าอ่านอยู่ในกลุ่ม (app) ซึ่งมีแถบเมนูแบบ fixed อยู่บนสุดของจอมือถือ
 * บวก `pt-14` ที่กันที่ให้แถบนั้นอีก ผลคือบนมือถือเหลือพื้นที่อ่านจริงน้อยลง
 * และแถบเมนูค้างทับอยู่ตลอดเวลาแม้ตอนซ่อน chrome ของหน้าอ่านแล้ว
 * แยกออกมาเป็นกลุ่ม (reader) ทำให้ URL ยังเป็น /read/[id] เหมือนเดิม
 * แต่ไม่ต้องแบกเมนูของไลบรารีมาด้วย
 *
 * ใช้ 100dvh ไม่ใช่ 100vh — บน iOS Safari ค่า 100vh นับรวมพื้นที่ใต้แถบ URL
 * ที่ยุบ/ขยายตอนเลื่อน ทำให้แถบความคืบหน้าด้านล่างถูกดันตกขอบจอไปเลย
 * ส่วน dvh ปรับตามพื้นที่ที่มองเห็นจริง
 */
export default async function ReaderLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className="h-[100dvh] overflow-hidden">
      <TiltMotion />
      {children}
    </div>
  );
}
