import { signIn } from '@/lib/auth';

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-navy px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent font-bold text-navy">B</div>
          <div>
            <h1 className="text-lg font-bold">BookDrive</h1>
            <p className="text-xs text-muted">ไลบรารีอีบุ๊กบน Drive ของคุณเอง</p>
          </div>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-muted">
          BookDrive เข้าถึงได้เฉพาะโฟลเดอร์ <b className="text-ink">BookDrive</b> ที่คุณเลือกเท่านั้น
          ไม่มีการเก็บหนังสือหรือข้อมูลการอ่านไว้บนเซิร์ฟเวอร์ของเรา
        </p>

        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/library' });
          }}
        >
          <button
            type="submit"
            className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-line font-semibold transition hover:bg-shell"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/>
            </svg>
            ดำเนินการต่อด้วย Google
          </button>
        </form>

        <p className="mt-5 text-[11px] leading-relaxed text-muted">
          สิทธิ์ที่ขอ: <code>drive.file</code> (เฉพาะไฟล์ที่คุณเลือก) และ{' '}
          <code>drive.appdata</code> (พื้นที่ซ่อนสำหรับเก็บความคืบหน้าและไฮไลต์)
        </p>
      </div>
    </main>
  );
}
