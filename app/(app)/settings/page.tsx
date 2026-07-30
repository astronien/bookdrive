import { auth, signOut } from '@/lib/auth';
import SettingsClient from '@/components/settings/SettingsClient';

export default async function SettingsPage() {
  const session = await auth();

  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b border-line bg-white px-[22px]">
        <h1 className="text-[15px] font-bold">ตั้งค่า</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] pb-16 pt-6">
        <div className="mb-6">
          <h2 className="text-[25px] font-bold tracking-tight">ตั้งค่า</h2>
          <p className="mt-1 text-[13px] text-muted">
            ข้อมูลทั้งหมดเก็บใน Google Drive ของคุณเอง ไม่มีอะไรอยู่บนเซิร์ฟเวอร์ของเรา
          </p>
        </div>

        {/* บัญชี — ต้อง render ฝั่ง server เพราะอ่าน session */}
        <section className="mb-[18px] max-w-[680px] rounded-[13px] border border-line bg-white p-[22px]">
          <h3 className="text-[14.5px] font-bold">การเชื่อมต่อ Google Drive</h3>
          <p className="mb-[18px] mt-1 text-[12.5px] text-muted">
            BookDrive เข้าถึงได้เฉพาะไฟล์ที่คุณเลือกหรือที่แอปสร้างเอง (scope <code>drive.file</code>)
          </p>

          <div className="mb-4 flex items-center gap-3.5 rounded-[11px] bg-shell p-[15px]">
            <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-white shadow-[0_4px_16px_rgba(25,29,68,.10)]">
              <svg width="22" height="22" viewBox="0 0 87.3 78">
                <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" />
                <path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" />
                <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z" />
                <path fill="#00832d" d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" />
                <path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
                <path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" />
              </svg>
            </div>
            <div className="min-w-0">
              <b className="block truncate text-[13px]">{session?.user?.email}</b>
              <span className="text-[11.5px] text-muted">โฟลเดอร์ที่เชื่อมไว้ดูได้ในหน้าไลบรารี</span>
            </div>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold text-[#0f9d58]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              เชื่อมต่อแล้ว
            </span>
          </div>

          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button
              type="submit"
              className="h-[38px] rounded-[10px] border border-line px-4 text-[13.5px] font-semibold transition hover:bg-shell"
            >
              ออกจากระบบ
            </button>
          </form>
        </section>

        <SettingsClient />
      </div>
    </>
  );
}
