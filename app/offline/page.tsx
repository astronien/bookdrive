export const metadata = { title: 'ออฟไลน์ — BookDrive' };

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-shell px-6 text-center">
      <div className="max-w-[420px]">
        <h1 className="text-[20px] font-bold">ตอนนี้ไม่มีอินเทอร์เน็ต</h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          หน้านี้ยังไม่เคยถูกเปิดตอนออนไลน์ เลยไม่มีสำเนาเก็บไว้
          <br />
          หนังสือที่กด &ldquo;เก็บไว้อ่านออฟไลน์&rdquo; ไว้แล้วยังเปิดอ่านได้ตามปกติ
        </p>
        <a href="/library"
          className="mt-5 inline-block h-[38px] rounded-[10px] bg-accent px-4 text-[13.5px] font-semibold leading-[38px] text-[#08312e]">
          ไปหน้าไลบรารี
        </a>
      </div>
    </main>
  );
}
