import SidebarNav from '@/components/SidebarNav';
import OfflineBar from '@/components/OfflineBar';
import SessionBanner from '@/components/SessionBanner';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

const NAV = [
  { href: '/library', label: 'หนังสือทั้งหมด' },
  { href: '/library?status=reading', label: 'กำลังอ่าน' },
  { href: '/library?status=finished', label: 'อ่านจบแล้ว' },
  { href: '/highlights', label: 'ไฮไลต์ & โน้ต' },
  { href: '/room', label: 'ห้องอ่านหนังสือ 3D' },
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
        <SidebarNav items={NAV} />
        <div className="border-t border-white/10 px-[18px] py-3.5 text-[11.5px] text-[#9aa0c4]">
          {session.user?.email}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <SessionBanner authAt={session.authAt} error={session.error} />
        <OfflineBar />
        {children}
      </main>
    </div>
  );
}
