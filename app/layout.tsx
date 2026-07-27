import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BookDrive — ไลบรารีอีบุ๊กบน Google Drive ของคุณ',
  description: 'อ่าน จัดการ และซิงก์อีบุ๊กโดยเก็บทุกอย่างไว้ใน Google Drive ของคุณเอง',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
