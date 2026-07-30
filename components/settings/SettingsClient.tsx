'use client';

import { useCallback, useEffect, useState } from 'react';
import { db, storageUsage } from '@/lib/db/idb';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/types';

const fmtBytes = (n: number) => {
  if (!n) return '0 MB';
  const mb = n / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
};

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative h-6 w-[42px] shrink-0 rounded-full transition ${on ? 'bg-accent' : 'bg-line'}`}
    >
      <span
        className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${
          on ? 'left-[21px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}

function Row({
  title, desc, children,
}: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-[13px] last:border-none">
      <div className="flex-1">
        <b className="block text-[13px] font-semibold">{title}</b>
        {desc && <span className="text-[11.5px] text-muted">{desc}</span>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsClient() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [usage, setUsage] = useState({ used: 0, quota: 0 });
  const [cachedBooks, setCachedBooks] = useState(0);

  useEffect(() => {
    (async () => {
      // แสดงค่าที่ cache ไว้ก่อน แล้วค่อยดึงของจริงจาก Drive
      const local = await db.meta.get('settings');
      if (local) setS({ ...DEFAULT_SETTINGS, ...(local.data as Settings) });

      try {
        const res = await fetch('/api/drive/appdata/settings');
        const { data, etag } = await res.json();
        if (data) {
          await db.meta.put({ name: 'settings', data, etag });
          setS({ ...DEFAULT_SETTINGS, ...(data as Settings) });
        }
      } catch {
        /* ออฟไลน์ — ใช้ค่าใน IndexedDB ต่อ */
      }
      setLoading(false);

      setUsage(await storageUsage());
      setCachedBooks(await db.blobs.count());
    })();
  }, []);

  const save = useCallback(async (next: Settings) => {
    setS(next);
    setSaving('saving');
    const row = await db.meta.get('settings');
    await db.meta.put({ name: 'settings', data: next, etag: row?.etag, dirty: true });
    try {
      const res = await fetch('/api/drive/appdata/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': row?.etag ?? '' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error();
      const { etag } = await res.json();
      await db.meta.put({ name: 'settings', data: next, etag, dirty: false });
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 1800);
    } catch {
      // เก็บไว้ใน IndexedDB แล้ว เดี๋ยว sync engine จะส่งขึ้นให้ตอนออนไลน์
      setSaving('error');
    }
  }, []);

  const toggle = (k: keyof Settings) => () =>
    save({ ...s, [k]: !s[k], updatedAt: new Date().toISOString() });

  async function clearCache() {
    if (!confirm('ลบไฟล์หนังสือที่ดาวน์โหลดไว้ทั้งหมด? ข้อมูลการอ่านและไฮไลต์ไม่หาย')) return;
    await db.blobs.clear();
    await db.locations.clear();
    setCachedBooks(0);
    setUsage(await storageUsage());
  }

  if (loading) {
    return <div className="max-w-[680px] animate-pulse rounded-[13px] border border-line bg-white p-[22px] text-[13px] text-muted">กำลังโหลดการตั้งค่า…</div>;
  }

  const pct = usage.quota ? Math.min(100, (usage.used / usage.quota) * 100) : 0;

  return (
    <>
      <section className="mb-[18px] max-w-[680px] rounded-[13px] border border-line bg-white p-[22px]">
        <div className="flex items-baseline gap-3">
          <h3 className="text-[14.5px] font-bold">ไลบรารี</h3>
          {saving === 'saving' && <span className="text-[11.5px] text-muted">กำลังบันทึก…</span>}
          {saving === 'saved' && <span className="text-[11.5px] font-semibold text-accent-d">บันทึกลง Drive แล้ว</span>}
          {saving === 'error' && <span className="text-[11.5px] font-semibold text-coral">ออฟไลน์ — จะซิงก์ให้ทีหลัง</span>}
        </div>
        <p className="mb-[18px] mt-1 text-[12.5px] text-muted">
          การตั้งค่าเก็บใน <code>appDataFolder</code> จึงตามไปทุกเครื่องที่ล็อกอินบัญชีเดียวกัน
        </p>

        <Row title="สแกนอัตโนมัติ" desc="ตรวจไฟล์ใหม่ในโฟลเดอร์ Books เป็นระยะ">
          <Toggle on={s.autoScan} onClick={toggle('autoScan')} />
        </Row>
        <Row title="สร้างปกอัตโนมัติ" desc="ดึงปกจากไฟล์แล้วเก็บใน BookDrive/Covers">
          <Toggle on={s.autoCover} onClick={toggle('autoCover')} />
        </Row>
        <Row title="เติม metadata จาก Open Library" desc="ค้นด้วย ISBN เมื่อข้อมูลในไฟล์ไม่ครบ">
          <Toggle on={s.enrichMetadata} onClick={toggle('enrichMetadata')} />
        </Row>
        <Row
          title="สำรอง metadata แบบอ่านได้"
          desc="เขียน backup.json ในโฟลเดอร์ปกติ — กันข้อมูลหายถ้าถอนสิทธิ์แอป"
        >
          <Toggle on={s.backupToDrive} onClick={toggle('backupToDrive')} />
        </Row>
      </section>

      <section className="mb-[18px] max-w-[680px] rounded-[13px] border border-line bg-white p-[22px]">
        <h3 className="text-[14.5px] font-bold">การซิงก์</h3>
        <p className="mb-[18px] mt-1 text-[12.5px] text-muted">
          ยิ่งถี่ยิ่งกินโควตา Drive API (12,000 ครั้ง/นาที/ผู้ใช้)
        </p>

        <Row title="บันทึกความคืบหน้าทุก" desc="ระหว่างอ่าน ตำแหน่งจะถูกส่งขึ้น Drive ตามรอบนี้">
          <select
            value={s.progressIntervalMs}
            onChange={(e) => save({ ...s, progressIntervalMs: +e.target.value, updatedAt: new Date().toISOString() })}
            className="h-9 rounded-[9px] border border-line bg-white px-2.5 text-[13px] outline-none focus:border-accent"
          >
            <option value={5000}>5 วินาที</option>
            <option value={10000}>10 วินาที (แนะนำ)</option>
            <option value={30000}>30 วินาที</option>
            <option value={60000}>1 นาที</option>
          </select>
        </Row>
        <Row title="ตรวจการเปลี่ยนแปลงจากเครื่องอื่น" desc="ผ่าน Drive Changes API">
          <select
            value={s.changesPollMs}
            onChange={(e) => save({ ...s, changesPollMs: +e.target.value, updatedAt: new Date().toISOString() })}
            className="h-9 rounded-[9px] border border-line bg-white px-2.5 text-[13px] outline-none focus:border-accent"
          >
            <option value={30000}>30 วินาที</option>
            <option value={60000}>1 นาที (แนะนำ)</option>
            <option value={300000}>5 นาที</option>
          </select>
        </Row>
      </section>

      <section className="max-w-[680px] rounded-[13px] border border-line bg-white p-[22px]">
        <h3 className="text-[14.5px] font-bold">พื้นที่ออฟไลน์</h3>
        <p className="mb-3.5 mt-1 text-[12.5px] text-muted">
          ใช้ไป {fmtBytes(usage.used)} จากโควตาเบราว์เซอร์ {fmtBytes(usage.quota)} · {cachedBooks} เล่ม
        </p>
        <div className="h-1 overflow-hidden rounded bg-line">
          <div className="h-full rounded bg-accent" style={{ width: `${pct}%` }} />
        </div>
        {pct > 80 && (
          <p className="mt-2.5 text-[11.5px] font-semibold text-coral">
            ใช้พื้นที่เกิน 80% แล้ว เบราว์เซอร์อาจเริ่มลบแคชเองโดยไม่แจ้ง
          </p>
        )}

        <div className="mt-3">
          <Row title="ดาวน์โหลดอัตโนมัติเมื่อเริ่มอ่าน" desc="เก็บไฟล์ไว้ในเครื่องเพื่ออ่านตอนออฟไลน์">
            <Toggle on={s.autoDownloadOnOpen} onClick={toggle('autoDownloadOnOpen')} />
          </Row>
        </div>

        <button
          onClick={clearCache}
          className="mt-3.5 h-[38px] rounded-[10px] border border-line px-4 text-[13.5px] font-semibold transition hover:bg-shell"
        >
          ล้างแคชออฟไลน์
        </button>
      </section>
    </>
  );
}
