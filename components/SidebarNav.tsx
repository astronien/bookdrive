'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

export default function SidebarNav({ items }: { items: { href: string; label: string }[] }) {
  return (
    <Suspense fallback={<nav className="flex-1" />}>
      <Inner items={items} />
    </Suspense>
  );
}

function Inner({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const params = useSearchParams();
  const status = params.get('status');
  // เทียบทั้ง path และ query เพราะสามเมนูแรกชี้ /library เหมือนกัน ต่างกันแค่ ?status=
  const current = `${path}${status ? `?status=${status}` : ''}`;

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
      {items.map((n) => {
        const on = n.href === current;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`block rounded-[9px] px-[11px] py-2.5 text-[13.5px] font-medium transition ${
              on ? 'bg-navy-3 text-white' : 'text-[#c3c8e4] hover:bg-navy-2 hover:text-white'
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
