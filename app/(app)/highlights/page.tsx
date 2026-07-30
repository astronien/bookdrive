'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/idb';
import { useLibrary } from '@/lib/store/library';
import type { Annotation, Annotations, HighlightColor } from '@/lib/types';

const COLORS: Record<HighlightColor, string> = {
  yellow: '#ffd43b',
  green: '#4ecdc4',
  blue: '#74c0fc',
  pink: '#f783ac',
  purple: '#a78bfa',
};

type Item = Annotation & { bookId: string };

export default function HighlightsPage() {
  const { books, load } = useLibrary();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [color, setColor] = useState<HighlightColor | 'all'>('all');
  const [notesOnly, setNotesOnly] = useState(false);

  useEffect(() => {
    if (!books.length) load();
  }, [books.length, load]);

  useEffect(() => {
    (async () => {
      const rows = await db.meta.toArray();
      const all: Item[] = [];
      for (const r of rows) {
        if (!r.name.startsWith('annotations/')) continue;
        const a = r.data as Annotations;
        for (const it of a.items ?? []) {
          if (it.deleted) continue;          // tombstone — ไม่ต้องแสดง
          all.push({ ...it, bookId: a.bookId });
        }
      }
      all.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
      setItems(all);
      setLoading(false);
    })();
  }, []);

  const titleOf = useMemo(() => {
    const m = new Map(books.map((b) => [b.id, b]));
    return (id: string) => m.get(id);
  }, [books]);

  const shown = items.filter(
    (i) => (color === 'all' || i.color === color) && (!notesOnly || !!i.note)
  );

  function exportMarkdown() {
    const byBook = new Map<string, Item[]>();
    for (const i of shown) {
      const arr = byBook.get(i.bookId) ?? [];
      arr.push(i);
      byBook.set(i.bookId, arr);
    }
    let md = `# ไฮไลต์จาก BookDrive\n\n_ส่งออกเมื่อ ${new Date().toLocaleString('th-TH')}_\n`;
    for (const [bookId, list] of byBook) {
      const b = titleOf(bookId);
      md += `\n## ${b?.title ?? bookId}\n`;
      if (b?.authors?.length) md += `\n*${b.authors.join(', ')}*\n`;
      for (const i of list) {
        md += `\n> ${i.text}\n`;
        if (i.note) md += `\n**โน้ต:** ${i.note}\n`;
      }
    }
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookdrive-highlights.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3.5 border-b border-line bg-white px-[22px]">
        <h1 className="text-[15px] font-bold">ไฮไลต์ &amp; โน้ต</h1>
        <div className="flex-1" />
        <button
          onClick={exportMarkdown}
          disabled={!shown.length}
          className="h-[38px] rounded-[10px] border border-line px-4 text-[13.5px] font-semibold transition hover:bg-shell disabled:opacity-40"
        >
          ส่งออก Markdown
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] pb-16 pt-6">
        <div className="mb-5">
          <h2 className="text-[25px] font-bold tracking-tight">ไฮไลต์ &amp; โน้ต</h2>
          <p className="mt-1 text-[13px] text-muted">
            {items.length} รายการจาก {new Set(items.map((i) => i.bookId)).size} เล่ม
          </p>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <button
            onClick={() => setColor('all')}
            className={`h-8 rounded-full border px-3.5 text-[12.5px] font-medium transition ${
              color === 'all' ? 'border-navy bg-navy text-white' : 'border-line bg-white text-muted hover:text-ink'
            }`}
          >
            ทั้งหมด
          </button>
          {(Object.keys(COLORS) as HighlightColor[]).map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium transition ${
                color === c ? 'border-navy bg-navy text-white' : 'border-line bg-white text-muted hover:text-ink'
              }`}
            >
              <span className="h-[9px] w-[9px] rounded-sm" style={{ background: COLORS[c] }} />
              {c}
            </button>
          ))}
          <button
            onClick={() => setNotesOnly((v) => !v)}
            className={`h-8 rounded-full border px-3.5 text-[12.5px] font-medium transition ${
              notesOnly ? 'border-navy bg-navy text-white' : 'border-line bg-white text-muted hover:text-ink'
            }`}
          >
            มีโน้ตเท่านั้น
          </button>
        </div>

        {loading ? (
          <p className="text-[13px] text-muted">กำลังโหลด…</p>
        ) : !items.length ? (
          <div className="rounded-xl border border-dashed border-line py-16 text-center">
            <p className="font-semibold">ยังไม่มีไฮไลต์</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
              การไฮไลต์ในหน้าอ่านยังไม่ได้ทำ (อยู่ใน M2 ของ roadmap) เมื่อทำแล้ว
              ไฮไลต์จะถูกเก็บใน <code>appDataFolder</code> และมารวมที่หน้านี้อัตโนมัติ
            </p>
            <Link
              href="/library"
              className="mt-4 inline-block h-[38px] rounded-[10px] border border-line px-4 text-[13.5px] font-semibold leading-[38px] transition hover:bg-shell"
            >
              กลับไปไลบรารี
            </Link>
          </div>
        ) : !shown.length ? (
          <p className="text-[13px] text-muted">ไม่มีรายการที่ตรงกับตัวกรอง</p>
        ) : (
          <div className="columns-1 gap-[18px] lg:columns-2">
            {shown.map((i) => {
              const b = titleOf(i.bookId);
              return (
                <div
                  key={i.id}
                  className="mb-[18px] break-inside-avoid rounded-xl border border-line bg-white p-[17px]"
                  style={{ borderLeft: `4px solid ${COLORS[i.color] ?? COLORS.yellow}` }}
                >
                  <div className="mb-2.5 flex items-center gap-2">
                    <b className="text-[12px] font-semibold">{b?.title ?? 'ไม่ทราบชื่อเรื่อง'}</b>
                    <span className="text-[10.5px] text-muted">{b?.authors?.join(', ')}</span>
                  </div>
                  <q className="block font-serif text-[13.2px] leading-relaxed">{i.text}</q>
                  {i.note && (
                    <p className="mt-3 border-t border-dashed border-line pt-2.5 text-[11.5px] text-muted">
                      💬 {i.note}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2 text-[10.5px] text-muted">
                    <span>{new Date(i.createdAt).toLocaleDateString('th-TH')}</span>
                    {b && (
                      <>
                        <span>·</span>
                        <Link href={`/read/${b.id}`} className="font-semibold text-accent-d hover:underline">
                          เปิดหนังสือ
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
