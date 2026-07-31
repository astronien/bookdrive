'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

export interface NavItem { href: string; label: string }

export default function AppNav({ items, email }: { items: NavItem[]; email?: string | null }) {
  return (
    <Suspense fallback={<aside className="hidden w-[252px] shrink-0 bg-navy md:block" />}>
      <Inner items={items} email={email} />
    </Suspense>
  );
}

function Inner({ items, email }: { items: NavItem[]; email?: string | null }) {
  const path = usePathname();
  const params = useSearchParams();
  const status = params.get('status');
  const [open, setOpen] = useState(false);

  // เทียบทั้ง path และ query เพราะสามเมนูแรกชี้ /library เหมือนกัน ต่างกันแค่ ?status=
  const current = `${path}${status ? `?status=${status}` : ''}`;
  const title = items.find((n) => n.href === current)?.label ?? 'BookDrive';

  // ปิดลิ้นชักทุกครั้งที่เปลี่ยนหน้า ไม่งั้นมันค้างทับเนื้อหาที่เพิ่งเปิด
  useEffect(() => { setOpen(false); }, [current]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const list = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`block rounded-[9px] px-[11px] py-3 text-[14px] font-medium transition md:py-2.5 md:text-[13.5px] ${
            n.href === current ? 'bg-navy-3 text-white' : 'text-[#c3c8e4] hover:bg-navy-2 hover:text-white'
          }`}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex h-16 items-center gap-2.5 px-[18px]">
      <div className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-accent text-[15px] font-bold text-navy">B</div>
      <span className="text-[17px] font-bold tracking-tight text-white">BookDrive</span>
    </div>
  );

  return (
    <>
      {/* ---------- จอใหญ่: แถบข้างถาวร ---------- */}
      <aside className="hidden w-[252px] shrink-0 flex-col bg-navy text-white md:flex">
        {brand}
        {list}
        <div className="truncate border-t border-white/10 px-[18px] py-3.5 text-[11.5px] text-[#9aa0c4]">{email}</div>
      </aside>

      {/* ---------- จอเล็ก: แถบบนคงที่ ---------- */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 bg-navy px-3 text-white md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="เปิดเมนู"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg active:bg-navy-2"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</span>
      </div>

      {/* ---------- ลิ้นชัก ---------- */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button aria-label="ปิดเมนู" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-navy shadow-2xl">
            {brand}
            {list}
            <div className="truncate border-t border-white/10 px-[18px] py-3.5 text-[11.5px] text-[#9aa0c4]">{email}</div>
          </div>
        </div>
      )}
    </>
  );
}
