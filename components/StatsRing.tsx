'use client';

/** วงแหวนสรุปการอ่านมุมบนของแถบข้าง เหมือนที่ BookFusion ทำ */
export default function StatsRing({
  finished, total, hours, pages,
}: { finished: number; total: number; hours: number; pages: number }) {
  const pct = total ? Math.min(1, finished / total) : 0;
  const R = 34;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex items-center gap-4 px-[18px] pt-5">
      <div className="relative h-[86px] w-[86px] shrink-0">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={R} fill="none" stroke="#e9ecf5" strokeWidth="7" />
          <circle
            cx="40" cy="40" r={R} fill="none" stroke="url(#g)" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          />
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#67a3ff" />
              <stop offset="100%" stopColor="#2f6bff" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center leading-none">
          <div className="text-[20px] font-bold">{finished}<span className="text-[12px] font-medium text-muted">/{total}</span></div>
          <div className="mt-0.5 text-[9.5px] text-muted">อ่านจบ</div>
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <Stat value={hours.toLocaleString('th-TH')} label="ชั่วโมง" />
        <Stat value={pages.toLocaleString('th-TH')} label="เล่มในชั้น" />
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[17px] font-bold">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
