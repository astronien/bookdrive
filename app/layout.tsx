import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BookDrive — ไลบรารีอีบุ๊กบน Google Drive ของคุณ',
  description: 'อ่าน จัดการ และซิงก์อีบุ๊กโดยเก็บทุกอย่างไว้ใน Google Drive ของคุณเอง',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'BookDrive', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#191d44',
  // หน้าอ่านใช้พื้นที่เต็มจอ ปล่อยให้ซูมได้เพื่อการเข้าถึง แต่ไม่ซูมเองตอนโฟกัส input
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
