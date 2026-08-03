'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLibrary } from '@/lib/store/library';
import StatsRing from '@/components/StatsRing';

export interface NavItem { href: string; label: string; key?: string }

export default function AppNav({ items, email }: { items: NavItem[]; email?: string | null }) {
  return (
    <Suspense fallback={<aside className="hidden w-[268px] shrink-0 border-r border-line bg-white md:block" />}>
      <Inner items={items} email={email} />
    </Suspense>
  );
}

function Inner({ items, email }: { items: NavItem[]; email?: string | null }) {
  const path = usePathname();
  const params = useSearchParams();
  const status = params.get('status');
  const [open, setOpen] = useState(false);
  const books = useLibrary((s) => s.books);

  const current = `${path}${status ? `?status=${status}` : ''}`;
  const title = items.find((n) => n.href === current)?.label ?? 'BookDrive';

  useEffect(() => { setOpen(false); }, [current]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const stats = useMemo(() => {
    const finished = books.filter((b) => (b.percent ?? 0) >= 95).length;
    const series = new Set(books.map((b) => b.series?.name).filter(Boolean)).size;
    return { finished, total: books.length, series };
  }, [books]);

  // จำนวนต่อเมนู — BookFusion โชว์ตัวเลขข้างทุกอัน ทำให้รู้ขนาดชั้นหนังสือทันที
  const counts: Record<string, number> = {
    '/library': books.length,
    '/library?status=reading': books.filter((b) => (b.percent ?? 0) > 0 && (b.percent ?? 0) < 95).length,
    '/library?status=finished': stats.finished,
  };

  const list = (
    <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
      {items.map((n) => {
        const on = n.href === current;
        const c = counts[n.href];
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`mb-0.5 flex items-center rounded-[10px] px-3 py-2.5 text-[14px] transition md:text-[13.5px] ${
              on ? 'bg-brand-soft font-semibold text-brand' : 'font-medium text-ink/75 hover:bg-shell'
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{n.label}</span>
            {typeof c === 'number' && (
              <span className={`ml-2 shrink-0 text-[11.5px] ${on ? 'text-brand' : 'text-muted'}`}>{c}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/library" className="flex h-16 items-center gap-2.5 px-[18px]">
      <div className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-brand text-[15px] font-bold text-white">B</div>
      <span className="text-[17px] font-bold tracking-tight text-ink">BookDrive</span>
    </Link>
  );

  const body = (
    <>
      {brand}
      <StatsRing finished={stats.finished} total={stats.total} hours={stats.series} pages={books.length} />
      <div className="mx-[18px] my-4 border-t border-line" />
      {list}
      <div className="truncate border-t border-line px-[18px] py-3.5 text-[11.5px] text-muted">{email}</div>
    </>
  );

  return (
    <>
      <aside className="hidden w-[268px] shrink-0 flex-col border-r border-line bg-white md:flex">{body}</aside>

      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-white px-3 md:hidden">
        <button onClick={() => setOpen(true)} aria-label="เปิดเมนู"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink active:bg-shell">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{title}</span>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button aria-label="ปิดเมนู" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-white shadow-2xl">{body}</div>
        </div>
      )}
    </>
  );
}
