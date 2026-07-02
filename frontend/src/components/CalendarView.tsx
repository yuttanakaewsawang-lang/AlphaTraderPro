import React, { useEffect, useState } from 'react';
import api from '../api';

interface CalEvent {
  time_utc: string;
  currency: string;
  title: string;
  impact: string;
  actual: string;
  forecast: string;
  previous: string;
  actual_raw: number | null;
  forecast_raw: number | null;
}

interface CalendarResponse {
  events: CalEvent[];
  fetched: string | null;
}

const IMPACT_STYLE: Record<string, { label: string; color: string }> = {
  high:    { label: 'สูง',    color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  medium:  { label: 'กลาง',   color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  low:     { label: 'ต่ำ',    color: 'bg-white/5 text-ink-muted border-white/10' },
  holiday: { label: 'วันหยุด', color: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
};

// สีผลจริง: เขียว = ดีกว่าคาด, แดง = แย่กว่าคาด, ขาว = ตรงคาด/ไม่มีข้อมูล
function actualColor(e: CalEvent): string {
  if (e.actual === '' || e.actual_raw == null || e.forecast_raw == null) return 'text-ink-muted';
  if (e.actual_raw > e.forecast_raw) return 'text-emerald-400 font-semibold';
  if (e.actual_raw < e.forecast_raw) return 'text-red-400 font-semibold';
  return 'text-ink';
}

const toThai = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', day: '2-digit', month: 'short' });
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });

const CalendarView: React.FC = () => {
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [impactFilter, setImpactFilter] = useState<'all' | 'high' | 'medium'>('high');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [now, setNow] = useState(Date.now());

  const load = async (force = false) => {
    setLoading(true);
    try {
      const res = await api.get<CalendarResponse>('/api/calendar', { params: { force } });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load calendar', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const events = data?.events ?? [];
  const currencies = Array.from(new Set(events.map((e) => e.currency).filter(Boolean))).sort();

  const impactRank = (i: string) => (i.toLowerCase() === 'high' ? 3 : i.toLowerCase() === 'medium' ? 2 : 1);
  const filtered = events.filter((e) => {
    if (impactFilter === 'high' && e.impact.toLowerCase() !== 'high') return false;
    if (impactFilter === 'medium' && impactRank(e.impact) < 2) return false;
    if (currencyFilter !== 'all' && e.currency !== currencyFilter) return false;
    return true;
  });

  const nextHigh = events
    .filter((e) => e.impact.toLowerCase() === 'high' && new Date(e.time_utc).getTime() > now)
    .sort((a, b) => a.time_utc.localeCompare(b.time_utc))[0];
  const countdown = (() => {
    if (!nextHigh) return null;
    const diff = Math.max(0, new Date(nextHigh.time_utc).getTime() - now);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h}ชม ${m}น ${s}ว`;
  })();

  const groups: { day: string; rows: CalEvent[] }[] = [];
  for (const e of filtered) {
    const k = dayKey(e.time_utc);
    const g = groups.find((x) => x.day === k);
    if (g) g.rows.push(e);
    else groups.push({ day: k, rows: [e] });
  }

  return (
    <div className="ios-fade-in flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-2">
        <h1 className="lux-h1">Calendar — ปฏิทินข่าวเศรษฐกิจ</h1>
        <button onClick={() => load(true)} disabled={loading} className="ios-pressable lux-btn-ghost px-3 h-8 text-xs disabled:opacity-50">
          {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
        </button>
      </div>

      {/* Countdown ข่าวแรงตัวถัดไป */}
      <div className="lux-panel p-4 shrink-0 flex items-center gap-4 flex-wrap" style={{ borderLeft: '3px solid #FF453A' }}>
        <div>
          <p className="lux-label">ข่าวแรงตัวถัดไป (อีก)</p>
          <p className="text-2xl font-bold text-red-400 tabular-nums mt-0.5">{countdown ?? '—'}</p>
        </div>
        {nextHigh && (
          <div className="min-w-0">
            <p className="lux-label">รายการ</p>
            <p className="text-sm font-semibold text-ink mt-0.5 truncate">
              {nextHigh.currency} · {nextHigh.title} <span className="text-ink-faint">({toThai(nextHigh.time_utc)})</span>
            </p>
          </div>
        )}
        <div className="ml-auto text-right">
          <p className="lux-label">บอทจะงดเทรดรอบข่าว "สูง" อัตโนมัติ</p>
          <p className="text-[11px] text-ink-faint">อัปเดต: {data?.fetched ? toThai(data.fetched) : '—'}</p>
        </div>
      </div>

      {/* ตัวกรอง */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap text-xs">
        <span className="lux-label">Impact:</span>
        {(['high', 'medium', 'all'] as const).map((i) => (
          <button key={i} onClick={() => setImpactFilter(i)}
            className={`ios-pressable px-3 h-7 rounded-full border ${impactFilter === i ? 'bg-gold/15 text-gold border-gold/40' : 'border-white/10 text-ink-muted hover:text-ink'}`}>
            {i === 'high' ? 'สูงเท่านั้น' : i === 'medium' ? 'กลาง+สูง' : 'ทั้งหมด'}
          </button>
        ))}
        <span className="lux-label ml-3">สกุลเงิน:</span>
        <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="lux-input h-7 px-2 text-xs">
          <option value="all">ทั้งหมด</option>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* legend สีผลจริง */}
        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <span className="text-emerald-400">● ดีกว่าคาด</span>
          <span className="text-red-400">● แย่กว่าคาด</span>
          <span className="text-ink-muted">● ตรงคาด / ยังไม่ออก</span>
        </div>
      </div>

      {/* ตารางข่าว */}
      <div className="lux-panel p-5 flex-1 min-h-0 overflow-auto">
        {filtered.length === 0 ? (
          <p className="text-ink-muted text-sm">{loading ? 'กำลังโหลด…' : 'ไม่มีข่าวตามตัวกรอง'}</p>
        ) : (
          groups.map((g) => (
            <div key={g.day} className="mb-5">
              <p className="text-gold font-semibold text-xs uppercase tracking-wider mb-2">{g.day}</p>
              <table className="lux-table w-full text-sm">
                <thead>
                  <tr className="text-ink-faint text-xs border-b border-white/10">
                    <th className="text-left pb-1.5 pr-3 w-16">เวลา</th>
                    <th className="text-left pb-1.5 pr-3 w-10">สกุล</th>
                    <th className="text-left pb-1.5 pr-3 w-16">ระดับ</th>
                    <th className="text-left pb-1.5 pr-3">รายการ</th>
                    <th className="text-right pb-1.5 pr-3 w-20">ผลจริง</th>
                    <th className="text-right pb-1.5 pr-3 w-20">คาดการณ์</th>
                    <th className="text-right pb-1.5 w-20">ก่อนหน้า</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((e, i) => {
                    const st = IMPACT_STYLE[e.impact.toLowerCase()] ?? IMPACT_STYLE.low;
                    const isPast = new Date(e.time_utc).getTime() < now;
                    return (
                      <tr key={i} className={`border-t border-white/[0.04] ${isPast ? 'opacity-55' : ''}`}>
                        <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-ink-muted">{hhmm(e.time_utc)}</td>
                        <td className="py-1.5 pr-3 font-semibold text-ink">{e.currency}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="py-1.5 pr-3 text-ink-muted truncate">{e.title}</td>
                        <td className={`py-1.5 pr-3 text-right tabular-nums ${actualColor(e)}`}>{e.actual || '—'}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-ink">{e.forecast || '—'}</td>
                        <td className="py-1.5 text-right tabular-nums text-ink-faint">{e.previous || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CalendarView;
