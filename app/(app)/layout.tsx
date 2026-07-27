import Link from 'next/link';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

const NAV = [
  { href: '/library', label: 'หนังสือทั้งหมด' },
  { href: '/library?status=reading', label: 'กำลังอ่าน' },
  { href: '/library?status=finished', label: 'อ่านจบแล้ว' },
  { href: '/highlights', label: 'ไฮไลต์ & โน้ต' },
  { href: '/settings', label: 'ตั้งค่า' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className="flex h-screen">
      <aside className="flex w-[252px] shrink-0 flex-col bg-navy text-white">
        <div className="flex h-16 items-center gap-2.5 px-[18px]">
          <div className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-accent text-[15px] font-bold text-navy">B</div>
          <span className="text-[17px] font-bold tracking-tight">BookDrive</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="block rounded-[9px] px-[11px] py-2.5 text-[13.5px] font-medium text-[#c3c8e4] transition hover:bg-navy-2 hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-[18px] py-3.5 text-[11.5px] text-[#9aa0c4]">
          {session.user?.email}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
