import type { Metadata, Viewport } from 'next';
import { GOOGLE_FONTS_HREF } from '@/lib/reader/fontCatalog';
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
      <head>
        {/* preconnect ก่อน ไม่งั้นต้องรอ DNS+TLS ของ gstatic ก่อนเริ่มโหลดไฟล์ฟอนต์
            ส่วนตัวเนื้อหนังสืออยู่ใน iframe ของ epub.js ซึ่งไม่เห็น <link> ตัวนี้
            EpubReader จึงต้องฉีด <link> เดียวกันเข้าไปในนั้นอีกชุด */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
