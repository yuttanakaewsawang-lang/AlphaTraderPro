import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api';

interface TradeRecord {
  id: number;
  time: string;
  symbol: string;
  type: string;
  lot: number;
  price: number;
  sl: number | null;
  tp: number | null;
  profit: number | null;
  ticket: number;
  source: string;
  status: 'open' | 'closed' | 'unknown';
}

interface HistorySummary {
  total_profit: number;
  realized: number;
  floating: number;
  wins: number;
  losses: number;
  count: number;
  days: number;
}

interface HistoryResponse {
  trades: TradeRecord[];
  summary: HistorySummary;
}

const sourceLabel = (source: string) => {
  switch (source) {
    case 'ZONE':
      return 'SMC Zone';
    case 'FVG':
      return 'SMC FVG';
    case 'OB':
      return 'SMC OB';
    case 'AI':
      return 'AI';
    case 'MANUAL':
      return 'Manual';
    case 'MT5':
      return 'MT5';
    default:
      return '-';
  }
};

// สี source: AI = ฟ้า, Manual = ทอง, SMC (Zone/FVG) = ส้ม
const sourceColor = (source: string) => {
  switch (source) {
    case 'AI':
      return 'text-[#5B8DEF]';
    case 'MANUAL':
      return 'text-gold';
    case 'ZONE':
    case 'FVG':
    case 'OB':
      return 'text-light-orange';
    default:
      return 'text-ink-faint';
  }
};

// 3 สถานะ: กำไร=เขียว, ขาดทุน=แดง, ศูนย์=เทากลาง (เพื่อให้แดง/เขียวสื่อความหมายจริง)
const pnlColor = (v: number) => (v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-ink-muted');

// Pattern = เงื่อนไขจุดเข้าของไม้ SMC (ZONE/FVG/OB) แยกสีให้เห็นชัด; AI/Manual = ไม่ใช่ pattern
const PATTERN_STYLE: Record<string, string> = {
  ZONE: 'bg-[#5B8DEF]/15 text-[#5B8DEF]',
  FVG: 'bg-[#A855F7]/15 text-[#C084FC]',
  OB: 'bg-[#D9933B]/15 text-light-orange',
};

interface EquityPoint {
  date: string;
  daily: number;
  cumulative: number;
}

interface CalendarDay {
  date: string;
  profit: number;
  commission: number;
  swap: number;
  trades: number;
  wins: number;
}

interface CalendarSummary {
  net_pnl: number;
  net_pnl_pct: number | null;
  equity_start: number | null;
  trading_days: number;
  win_rate: number;
  best_day: { date: string; profit: number } | null;
  commission: number;
  swap: number;
}

interface CalendarResponse {
  year: number;
  month: number;
  days: CalendarDay[];
  summary: CalendarSummary;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const fmtMoney = (v: number) =>
  `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// กราฟเส้น equity สะสมแบบ SVG เรียบ ๆ (ไม่พึ่ง lib) — เขียวถ้าจบบวก แดงถ้าจบลบ
const EquityCurve: React.FC<{ points: EquityPoint[] }> = ({ points }) => {
  if (points.length < 2) {
    return <p className="text-ink-muted text-sm">ข้อมูลไม่พอวาดกราฟ (ต้องมีอย่างน้อย 2 วันที่มีไม้ปิด)</p>;
  }
  const W = 1200;
  const H = 95;
  const pad = 6;
  const values = points.map((p) => p.cumulative);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / range) * (H - 2 * pad);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.cumulative).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const stroke = last >= 0 ? '#30D158' : '#FF453A';
  const zeroY = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="var(--hairline)" strokeWidth="1" strokeDasharray="4 4" />
      <path d={`${line} L${x(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`} fill={stroke} opacity="0.08" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
};

// พื้นหลังวันในปฏิทิน: เข้มขึ้นตามสัดส่วนกำไร/ขาดทุนเทียบวันที่แรงสุดของเดือน (เหมือนตัวอย่าง broker terminal)
const dayBg = (profit: number, maxAbs: number) => {
  if (profit === 0 || maxAbs === 0) return undefined;
  const ratio = Math.min(1, Math.abs(profit) / maxAbs);
  const alpha = 0.14 + ratio * 0.34; // 0.14 - 0.48
  return profit > 0 ? `rgba(48,209,88,${alpha})` : `rgba(255,69,58,${alpha})`;
};

const HistoryView: React.FC = () => {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [history, setHistory] = useState<TradeRecord[]>([]);

  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        const res = await api.get<CalendarResponse>('/api/history/calendar', {
          params: { year: cursor.year, month: cursor.month },
        });
        setCalendar(res.data);
      } catch (err) {
        console.error('Failed to load calendar', err);
      }
    };
    fetchCalendar();
    const interval = setInterval(fetchCalendar, 15000);
    return () => clearInterval(interval);
  }, [cursor]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        // ต้องดึงย้อนหลังให้ครอบคลุมถึงต้นเดือนที่กำลังดู ไม่ใช่ตายตัว 90 วัน
        // ไม่งั้นเลื่อนปฏิทินไปเดือนเก่ากว่านั้นแล้วรายการไม้ด้านล่างจะว่างเปล่า (ปฏิทินเองไม่ผูกกับ days นี้)
        const monthStart = new Date(cursor.year, cursor.month - 1, 1);
        const daysBack = Math.max(90, Math.ceil((Date.now() - monthStart.getTime()) / 86400000) + 2);
        const res = await api.get<HistoryResponse>('/api/history', { params: { days: daysBack } });
        setHistory(res.data.trades);
      } catch (err) {
        console.error('Failed to load history', err);
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [cursor]);

  const dayMap = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    (calendar?.days ?? []).forEach((d) => m.set(d.date, d));
    return m;
  }, [calendar]);

  const maxAbsProfit = useMemo(
    () => Math.max(0, ...(calendar?.days ?? []).map((d) => Math.abs(d.profit))),
    [calendar]
  );

  // สร้าง equity curve จากข้อมูลปฏิทินเดือนที่กำลังดูโดยตรง (cumulative เริ่มที่ 0 ของเดือนนั้น)
  // แทนการดึงจาก /api/history/equity ซึ่งเป็นยอดสะสมของทั้งหน้าต่าง 90 วันไม่ตัดตามเดือน — ทำให้สี/ทิศทางกราฟไม่ตรงผลงานจริงของเดือนที่เลือก
  const monthEquity = useMemo<EquityPoint[]>(() => {
    let cumulative = 0;
    return (calendar?.days ?? []).map((d) => {
      cumulative += d.profit;
      return { date: d.date, daily: d.profit, cumulative };
    });
  }, [calendar]);

  const isToday = (dateStr: string) =>
    dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const gridCells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month - 1, 1);
    const startWeekday = first.getDay(); // 0 = Sunday
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    const cells: (string | null)[] = Array(startWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const goMonth = (delta: number) => {
    setSelectedDay(null);
    setCursor((c) => {
      let month = c.month + delta;
      let year = c.year;
      if (month < 1) { month = 12; year -= 1; }
      if (month > 12) { month = 1; year += 1; }
      return { year, month };
    });
  };

  const goToday = () => {
    setSelectedDay(null);
    setCursor({ year: today.getFullYear(), month: today.getMonth() + 1 });
  };

  const summary = calendar?.summary;
  const filteredHistory = selectedDay
    ? history.filter((r) => r.time.startsWith(selectedDay))
    : history.filter((r) => r.time.startsWith(`${cursor.year}-${String(cursor.month).padStart(2, '0')}`));

  return (
    <div className="ios-fade-in flex flex-col gap-6 w-full">
      <h1 className="lux-h1">Trade History</h1>

      <div className="lux-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="lux-label mb-1">NET P&amp;L</p>
            <div className="flex items-baseline gap-2">
              <p className={`text-3xl font-bold tabular-nums ${pnlColor(summary?.net_pnl ?? 0)}`}>
                {summary ? fmtMoney(summary.net_pnl) : '—'}
              </p>
              {summary?.net_pnl_pct != null && (
                <span className={`text-sm font-semibold tabular-nums ${pnlColor(summary.net_pnl_pct)}`}>
                  {summary.net_pnl_pct > 0 ? '▲' : summary.net_pnl_pct < 0 ? '▼' : ''} {Math.abs(summary.net_pnl_pct).toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-8">
            <div>
              <p className="lux-label mb-1">Trading Days</p>
              <p className="text-lg font-semibold text-ink tabular-nums text-right">{summary?.trading_days ?? 0}</p>
            </div>
            <div>
              <p className="lux-label mb-1">Win Rate</p>
              <p className="text-lg font-semibold text-green-400 tabular-nums text-right">{summary?.win_rate ?? 0}%</p>
            </div>
            <div>
              <p className="lux-label mb-1">Best Day</p>
              <p className={`text-lg font-semibold tabular-nums text-right ${summary?.best_day ? pnlColor(summary.best_day.profit) : 'text-ink-muted'}`}>
                {summary?.best_day ? fmtMoney(summary.best_day.profit) : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-end gap-6">
          <div className="flex-1">
            <p className="lux-label mb-2">Equity Curve</p>
            <EquityCurve points={monthEquity} />
          </div>
          <div className="pb-1 text-right">
            <p className="lux-label mb-1">Comm <span className="ml-3">Swap</span></p>
            <p className="text-sm font-semibold tabular-nums">
              <span className="text-red-400">{summary ? fmtMoney(summary.commission) : '—'}</span>
              <span className="ml-3 text-ink">{summary ? summary.swap.toFixed(2) : '—'}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="lux-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink">
            {MONTH_NAMES[cursor.month - 1]} <span className="text-ink-muted">{cursor.year}</span>
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={() => goMonth(-1)} className="ios-pressable p-2 rounded-lg hover:bg-white/5" aria-label="เดือนก่อนหน้า">
              <ChevronLeft size={16} className="text-ink-muted" />
            </button>
            <button onClick={goToday} className="ios-pressable px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-ink hover:bg-white/10">
              TODAY
            </button>
            <button onClick={() => goMonth(1)} className="ios-pressable p-2 rounded-lg hover:bg-white/5" aria-label="เดือนถัดไป">
              <ChevronRight size={16} className="text-ink-muted" />
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={`${w}-${i}`} className="text-center text-xs font-semibold text-ink-faint py-1">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {gridCells.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} className="aspect-square rounded-xl" />;
            const d = dayMap.get(dateStr);
            const dayNum = Number(dateStr.slice(-2));
            const selected = selectedDay === dateStr;
            const todayCell = isToday(dateStr);
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDay(selected ? null : dateStr)}
                className="ios-pressable aspect-square rounded-xl p-3 flex flex-col items-start justify-between text-left transition-colors"
                style={{
                  backgroundColor: dayBg(d?.profit ?? 0, maxAbsProfit) ?? 'rgba(255,255,255,0.03)',
                  outline: selected ? '2px solid #0A84FF' : todayCell ? '1.5px solid #0A84FF' : 'none',
                  outlineOffset: -1.5,
                }}
              >
                <span className="text-sm font-medium text-ink-muted">{dayNum}</span>
                {d && (
                  <div>
                    <p className={`text-xl font-bold tabular-nums leading-tight ${pnlColor(d.profit)}`}>
                      {d.profit > 0 ? '+' : ''}{d.profit.toFixed(0)}
                    </p>
                    {summary?.equity_start ? (
                      <p className={`text-sm tabular-nums ${pnlColor(d.profit)} opacity-80`}>
                        {((d.profit / summary.equity_start) * 100).toFixed(1)}%
                      </p>
                    ) : null}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        </div>
      </div>

      <div className="lux-panel p-6 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="lux-label">
            {selectedDay ? `รายการไม้วันที่ ${selectedDay}` : `รายการไม้ในเดือน ${MONTH_NAMES[cursor.month - 1]}`}
          </p>
          {selectedDay && (
            <button onClick={() => setSelectedDay(null)} className="text-xs text-blue-400 hover:underline">
              ดูทั้งเดือน
            </button>
          )}
        </div>
        {filteredHistory.length === 0 ? (
          <p className="text-ink-muted">ไม่มีประวัติในช่วงที่เลือก</p>
        ) : (
          <table className="lux-table text-sm">
            <thead>
              <tr>
                <th className="py-2">Date/Time</th>
                <th>Symbol</th>
                <th>Type</th>
                <th>Pattern</th>
                <th>Lot</th>
                <th>Price</th>
                <th>SL</th>
                <th>TP</th>
                <th>Profit</th>
                <th>Ticket</th>
                <th>Entry</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((r) => {
                const profit = r.profit ?? 0;
                return (
                  <tr key={r.id} className="text-ink">
                    <td className="py-2 text-ink-muted tabular-nums">{r.time}</td>
                    <td className="font-medium text-ink whitespace-nowrap">{r.symbol}</td>
                    <td>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          r.type === 'BUY' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                        }`}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td>
                      {PATTERN_STYLE[r.source] ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${PATTERN_STYLE[r.source]}`}>
                          {r.source}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="tabular-nums">{r.lot}</td>
                    <td className="tabular-nums">{r.price}</td>
                    {/* SL แดงเมื่อขาดทุน, TP เขียวเมื่อกำไร — อีกช่อง (รวมกรณี 0) เป็นกลาง */}
                    <td className={`tabular-nums ${profit < 0 ? 'text-red-400' : 'text-ink-muted'}`}>{(r.sl ?? 0).toFixed(2)}</td>
                    <td className={`tabular-nums ${profit > 0 ? 'text-green-400' : 'text-ink-muted'}`}>{(r.tp ?? 0).toFixed(2)}</td>
                    <td className={`font-semibold tabular-nums ${pnlColor(profit)}`}>
                      {profit > 0 ? '+' : ''}{profit.toFixed(2)}
                      {r.status === 'open' && (
                        <span className="ml-1 text-[10px] font-normal text-ink-faint uppercase tracking-wider">ลอย</span>
                      )}
                    </td>
                    <td className="text-ink-faint tabular-nums">{r.ticket}</td>
                    <td className={`whitespace-nowrap font-medium ${sourceColor(r.source)}`}>{sourceLabel(r.source)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default HistoryView;
