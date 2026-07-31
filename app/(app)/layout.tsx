import AppNav from '@/components/AppNav';
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
      <AppNav items={NAV} email={session.user?.email} />
      {/* pt-14 เผื่อที่ให้แถบบนบนจอเล็ก ซึ่งเป็น fixed จึงไม่กินพื้นที่เอง */}
      <main className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <SessionBanner authAt={session.authAt} error={session.error} />
        <OfflineBar />
        {children}
      </main>
    </div>
  );
}
