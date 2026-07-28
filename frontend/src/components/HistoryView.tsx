import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown, TrendingUp, TrendingDown, CalendarDays,
  Trophy, ArrowDownToLine, ArrowUpFromLine, Percent, Award, Download,
} from 'lucide-react';
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
  exit_price: number | null;
  exit_time: string | null;
  duration_sec: number | null;
  close_reason: string | null;
}

interface HistoryResponse {
  trades: TradeRecord[];
  summary: unknown;
}

const sourceLabel = (source: string) => {
  switch (source) {
    case 'ZONE': return 'SMC Zone';
    case 'FVG': return 'SMC FVG';
    case 'OB': return 'SMC OB';
    case 'SMC': return 'SMC';
    case 'SNIPER': return 'Sniper';
    case 'SWING': return 'Swing';
    case 'REVERSAL': return 'Reversal';
    case 'GRID': return 'Grid';
    case 'AI': return 'AI';
    case 'MANUAL': return 'Manual';
    case 'MT5': return 'MT5';
    default: return '-';
  }
};

// สีประจำ engine — ตรงกับธีมสีของแต่ละ dashboard ในแอป (แยกไม้ด้วยตาในบัญชีที่รันหลาย engine พร้อมกัน)
const sourceColor = (source: string) => {
  switch (source) {
    case 'AI': return 'text-[#5B8DEF]';
    case 'MANUAL': return 'text-gold';
    case 'ZONE':
    case 'FVG':
    case 'OB':
    case 'SMC': return 'text-[#0A84FF]';
    case 'SNIPER': return 'text-[#30D158]';
    case 'SWING': return 'text-[#40C8E0]';
    case 'REVERSAL': return 'text-[#FF9F0A]';
    case 'GRID': return 'text-[#BF5AF2]';
    default: return 'text-ink-faint';
  }
};

// 3 สถานะ: กำไร=เขียว, ขาดทุน=แดง, ศูนย์=เทากลาง
const pnlColor = (v: number) => (v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-ink-muted');

const PATTERN_STYLE: Record<string, string> = {
  ZONE: 'bg-[#5B8DEF]/15 text-[#5B8DEF]',
  FVG: 'bg-[#A855F7]/15 text-[#C084FC]',
  OB: 'bg-[#D9933B]/15 text-light-orange',
  SMC: 'bg-[#0A84FF]/15 text-[#0A84FF]',
  SNIPER: 'bg-[#30D158]/15 text-[#30D158]',
  SWING: 'bg-[#40C8E0]/15 text-[#40C8E0]',
  REVERSAL: 'bg-[#FF9F0A]/15 text-[#FF9F0A]',
  GRID: 'bg-[#BF5AF2]/15 text-[#BF5AF2]',
};

interface CalendarDay {
  date: string;
  profit: number;
  commission: number;
  swap: number;
  trades: number;
  wins: number;
  losses: number;
}

interface CalendarSummary {
  net_pnl: number;
  net_pnl_pct: number | null;
  equity_start: number | null;
  equity_now: number | null;
  currency: string | null;
  account: number | null;
  trading_days: number;
  win_days: number;
  loss_days: number;
  be_days: number;
  win_rate: number;
  best_day: {
    date: string; profit: number; trades: number; wins: number; losses: number; win_rate: number;
  } | null;
  commission: number;
  swap: number;
  total_trades: number;
  avg_trades_per_day: number;
  total_wins: number;
  total_losses: number;
  total_breakeven: number;
  trade_win_rate: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number | null;
  total_volume: number;
  deposits: number;
  withdrawals: number;
}

interface CalendarResponse {
  year: number;
  month: number;
  days: CalendarDay[];
  summary: CalendarSummary;
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const THAI_MONTHS_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const THAI_WEEKDAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
// ปฏิทินเริ่มวันจันทร์ (ตามภาพตัวอย่าง) — ชื่อเต็มตรงตามภาพ
const WEEKDAY_LABELS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

const fmtNum = (v: number, dp = 2) =>
  v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

// จำนวนเงิน + สกุลเงินบัญชี (เช่น "1,234.56 USD" / "-36,420.06 USC") — cent account จะเป็น USC เอง
const fmtCur = (v: number, cur?: string | null, dp = 2) =>
  `${v < 0 ? '-' : ''}${fmtNum(Math.abs(v), dp)}${cur ? ' ' + cur : ''}`;

const thaiWeekday = (dateStr: string) => THAI_WEEKDAYS_FULL[new Date(dateStr + 'T00:00:00').getDay()];

// ระยะเวลาถือไม้ เป็นข้อความไทยอ่านง่าย (ตรงกับ _fmt_duration ฝั่ง backend)
const fmtDuration = (sec: number | null) => {
  if (sec == null) return '—';
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s} วิ`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} ชม. ${rm} นาที` : `${h} ชม.`;
};

const reasonColor = (reason: string | null) => {
  if (reason === 'Stop Loss') return 'text-red-400';
  if (reason === 'Take Profit') return 'text-green-400';
  return 'text-ink-faint';
};

// พื้นหลังวันในปฏิทิน: เข้มขึ้นตามสัดส่วนกำไร/ขาดทุนเทียบวันแรงสุดของเดือน
const dayBg = (profit: number, maxAbs: number) => {
  if (profit === 0 || maxAbs === 0) return 'rgba(255,255,255,0.02)';
  const ratio = Math.min(1, Math.abs(profit) / maxAbs);
  const alpha = 0.12 + ratio * 0.30;
  return profit > 0 ? `rgba(48,209,88,${alpha})` : `rgba(255,69,58,${alpha})`;
};

type DisplayMode = 'pnl' | 'trades' | 'results';

// ── แถวสถิติในแถบสรุป (คั่นด้วยเส้นบางระหว่างคอลัมน์) ──
const SummaryStat: React.FC<{
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  sub?: React.ReactNode;
}> = ({ label, value, valueClass, sub }) => (
  <div className="px-5 py-4 min-w-0">
    <p className="lux-label mb-1.5 truncate">{label}</p>
    <div className={`text-2xl font-bold tabular-nums leading-tight truncate ${valueClass ?? 'text-ink'}`}>{value}</div>
    {sub && <p className="text-xs text-ink-muted mt-1 truncate">{sub}</p>}
  </div>
);

// ── แถวสถิติ (label ซ้าย / value ขวา) ──
const StatRow: React.FC<{ label: React.ReactNode; value: React.ReactNode; valueClass?: string }> = ({
  label, value, valueClass,
}) => (
  <div className="flex items-center justify-between py-2 border-b border-[var(--hairline)] last:border-0">
    <span className="text-xs text-ink-muted flex items-center gap-1">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${valueClass ?? 'text-ink'}`}>{value}</span>
  </div>
);

const HistoryView: React.FC = () => {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [prevNet, setPrevNet] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [history, setHistory] = useState<TradeRecord[]>([]);
  const [mode, setMode] = useState<DisplayMode>('pnl');
  const [filterOpen, setFilterOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  useEffect(() => {
    const prev = cursor.month === 1
      ? { year: cursor.year - 1, month: 12 }
      : { year: cursor.year, month: cursor.month - 1 };
    const fetchCalendar = async () => {
      try {
        const [cur, pr] = await Promise.all([
          api.get<CalendarResponse>('/api/history/calendar', { params: { year: cursor.year, month: cursor.month } }),
          api.get<CalendarResponse>('/api/history/calendar', { params: { year: prev.year, month: prev.month } }),
        ]);
        setCalendar(cur.data);
        setPrevNet(pr.data.summary.net_pnl);
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

  // % ต่อวัน เทียบฐาน equity ต้นเดือนเดียวกับที่ใช้คำนวณ net_pnl_pct ของทั้งเดือน
  const dayEquityBase = calendar?.summary.equity_start;
  const dayPct = (profit: number): number | null =>
    dayEquityBase ? (profit / dayEquityBase) * 100 : null;

  const isToday = (dateStr: string) =>
    dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // ปฏิทินเต็มตาราง (6 แถว) — เดือนก่อน/ถัดไปโผล่มาเป็นวันจางๆ เหมือนภาพตัวอย่าง
  const gridCells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month - 1, 1);
    const startWeekday = (first.getDay() + 6) % 7; // จันทร์ = 0
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    const daysInPrevMonth = new Date(cursor.year, cursor.month - 1, 0).getDate();
    const prevMonth = cursor.month === 1 ? 12 : cursor.month - 1;
    const prevYear = cursor.month === 1 ? cursor.year - 1 : cursor.year;
    const nextMonth = cursor.month === 12 ? 1 : cursor.month + 1;
    const nextYear = cursor.month === 12 ? cursor.year + 1 : cursor.year;

    const cells: { date: string; inMonth: boolean }[] = [];
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      cells.push({ date: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, inMonth: true });
    }
    let nd = 1;
    while (cells.length % 7 !== 0) {
      cells.push({ date: `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nd).padStart(2, '0')}`, inMonth: false });
      nd++;
    }
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

  const s = calendar?.summary;
  const cur = s?.currency;

  const prevMonthMeta = useMemo(() => {
    const m = cursor.month === 1 ? 12 : cursor.month - 1;
    const y = cursor.month === 1 ? cursor.year - 1 : cursor.year;
    return { name: THAI_MONTHS[m - 1], year: y };
  }, [cursor]);

  const netPnl = s?.net_pnl ?? 0;

  // % เปลี่ยนแปลงเทียบเดือนก่อนหน้า (คนละตัวกับ net_pnl_pct ที่เทียบ equity เริ่มเดือน)
  const momChangePct = useMemo(() => {
    if (prevNet == null || prevNet === 0 || !s) return null;
    return ((netPnl - prevNet) / Math.abs(prevNet)) * 100;
  }, [netPnl, prevNet, s]);

  // วันที่ดีที่สุด/แย่ที่สุดของเดือน — ใช้ badge บนปฏิทิน
  const bestDayDate = s?.best_day && s.best_day.profit > 0 ? s.best_day.date : null;
  const worstDayDate = useMemo(() => {
    let worst: CalendarDay | null = null;
    for (const d of calendar?.days ?? []) {
      if (d.trades > 0 && d.profit < 0 && (!worst || d.profit < worst.profit)) worst = d;
    }
    return worst?.date ?? null;
  }, [calendar]);

  const filteredHistory = selectedDay
    ? history.filter((r) => r.time.startsWith(selectedDay))
    : history.filter((r) => r.time.startsWith(`${cursor.year}-${String(cursor.month).padStart(2, '0')}`));

  // Export Report (HTML) — สร้างจากรายการไม้ที่กำลังโชว์อยู่ (เดือน/วันที่เลือก) ตรงกับตารางด้านล่างเป๊ะ
  const exportReport = async () => {
    setExporting(true);
    setExportMsg('');
    try {
      const trades = filteredHistory;
      const wins = trades.filter((t) => (t.profit ?? 0) > 0).length;
      const losses = trades.filter((t) => (t.profit ?? 0) < 0).length;
      const grossWin = trades.filter((t) => (t.profit ?? 0) > 0).reduce((a, t) => a + (t.profit ?? 0), 0);
      const grossLoss = Math.abs(trades.filter((t) => (t.profit ?? 0) < 0).reduce((a, t) => a + (t.profit ?? 0), 0));
      const netExport = trades.reduce((a, t) => a + (t.profit ?? 0), 0);

      let winDays = 0, lossDays = 0;
      if (selectedDay) {
        const d = dayMap.get(selectedDay);
        if (d) { if (d.profit > 0) winDays = 1; else if (d.profit < 0) lossDays = 1; }
      } else {
        winDays = s?.win_days ?? 0;
        lossDays = s?.loss_days ?? 0;
      }

      const periodLabel = selectedDay ?? `${cursor.year}-${String(cursor.month).padStart(2, '0')}`;

      const res = await api.post('/api/history/export-report', {
        account: s?.account ?? null,
        currency: cur ?? null,
        period_label: periodLabel,
        summary: {
          net_pnl: +netExport.toFixed(2),
          trade_win_rate: trades.length ? +((wins / trades.length) * 100).toFixed(1) : 0,
          profit_factor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : null,
          total_trades: trades.length,
          win_days: winDays,
          loss_days: lossDays,
          avg_win: wins ? +(grossWin / wins).toFixed(2) : 0,
          avg_loss: losses ? +(-grossLoss / losses).toFixed(2) : 0,
          total_volume: +trades.reduce((a, t) => a + (t.lot ?? 0), 0).toFixed(2),
        },
        trades,
      });
      setExportMsg(`บันทึกแล้ว: ${res.data.path}`);
    } catch (e: any) {
      setExportMsg(e?.response?.data?.detail ?? 'export ไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  };

  // แถบสัดส่วน ชนะ/แพ้/เสมอ (ระดับไม้ ทั้งเดือน)
  const pw = s?.total_wins ?? 0;
  const pl = s?.total_losses ?? 0;
  const pb = s?.total_breakeven ?? 0;
  const pTotal = pw + pl + pb || 1;

  return (
    <div className="ios-fade-in flex flex-col gap-5 w-full">
      {/* ── แถบสรุปรวม (คั่นเส้นบางระหว่างคอลัมน์) ── */}
      <div className="lux-card overflow-hidden">
        <div className="grid grid-cols-4 divide-x divide-[var(--hairline)]">
          <SummaryStat
            label="กำไร/ขาดทุนสุทธิรายเดือน"
            value={s ? fmtCur(netPnl, cur) : '—'}
            valueClass={pnlColor(netPnl)}
            sub={
              momChangePct != null
                ? `${momChangePct > 0 ? '+' : ''}${momChangePct.toFixed(2)}% เทียบกับ ${prevMonthMeta.name} ${prevMonthMeta.year}`
                : undefined
            }
          />
          <SummaryStat
            label="วันที่ทำกำไร"
            value={s?.win_days ?? 0}
            valueClass="text-green-400"
            sub={s?.trading_days ? `${((s.win_days / s.trading_days) * 100).toFixed(1)}% ของวันที่มีการเทรด` : '—'}
          />
          <SummaryStat
            label="วันที่ขาดทุน"
            value={s?.loss_days ?? 0}
            valueClass="text-red-400"
            sub={s?.trading_days ? `${((s.loss_days / s.trading_days) * 100).toFixed(1)}% ของวันที่มีการเทรด` : '—'}
          />
          <SummaryStat
            label="รายการเทรด"
            value={(s?.total_trades ?? 0).toLocaleString()}
            sub={s ? `${s.avg_trades_per_day} ต่อวัน` : '—'}
          />
        </div>
      </div>

      {/* ── Calendar + Sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.9fr_1fr] gap-5 items-start">
        {/* Calendar */}
        <div className="lux-card p-5">
          <div className="flex items-start justify-between mb-4 gap-3">
            <div>
              <p className="lux-label mb-1">กำไร/ขาดทุนสุทธิรายเดือน</p>
              <div className="flex items-center gap-1">
                <button onClick={() => goMonth(-1)} className="ios-pressable p-1 rounded-lg hover:bg-white/5" aria-label="เดือนก่อนหน้า">
                  <ChevronLeft size={18} className="text-ink-muted" />
                </button>
                <h2 className="text-2xl font-bold text-ink">
                  {THAI_MONTHS[cursor.month - 1]} <span className="text-ink-muted font-semibold">{cursor.year}</span>
                </h2>
                <button onClick={() => goMonth(1)} className="ios-pressable p-1 rounded-lg hover:bg-white/5" aria-label="เดือนถัดไป">
                  <ChevronRight size={18} className="text-ink-muted" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={goToday} className="ios-pressable px-2.5 py-1.5 rounded-lg text-xs font-semibold text-ink-muted hover:text-ink hover:bg-white/5">
                วันนี้
              </button>
              <div className="relative">
                <button
                  onClick={() => setFilterOpen((v) => !v)}
                  aria-expanded={filterOpen}
                  className="ios-pressable inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-ink hover:bg-white/10"
                >
                  ตัวกรอง
                  <ChevronDown size={13} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
                </button>
                {filterOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                    <div className="absolute right-0 mt-1.5 w-44 lux-card p-1.5 z-50 shadow-2xl">
                      {([
                        ['pnl', 'กำไร/ขาดทุน'],
                        ['trades', 'รายการเทรด'],
                        ['results', 'ผลลัพธ์'],
                      ] as [DisplayMode, string][]).map(([m, label]) => (
                        <button
                          key={m}
                          onClick={() => { setMode(m); setFilterOpen(false); }}
                          className={`ios-pressable w-full text-left px-3 py-2 rounded-lg text-xs font-medium ${
                            mode === m ? 'bg-accent-blue/15 text-accent-blue' : 'text-ink-muted hover:bg-white/5 hover:text-ink'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={`${w}-${i}`} className="text-center text-[11px] font-semibold text-ink-faint py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {gridCells.map(({ date: dateStr, inMonth }) => {
              const d = dayMap.get(dateStr);
              const dayNum = Number(dateStr.slice(-2));
              const selected = selectedDay === dateStr;
              const todayCell = isToday(dateStr);
              const hasData = !!d && d.trades > 0;
              const isBest = inMonth && dateStr === bestDayDate;
              const isWorst = inMonth && !isBest && dateStr === worstDayDate;
              const pct = hasData ? dayPct(d!.profit) : null;
              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={!inMonth}
                  onClick={() => inMonth && setSelectedDay(selected ? null : dateStr)}
                  className={`ios-pressable relative aspect-square rounded-xl p-2 flex flex-col items-stretch text-left transition-colors overflow-hidden ${
                    !inMonth ? 'opacity-35 cursor-default' : ''
                  }`}
                  style={{
                    backgroundColor: !inMonth
                      ? 'rgba(255,255,255,0.015)'
                      : mode === 'pnl' && hasData ? dayBg(d!.profit, maxAbsProfit)
                      : hasData ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                    outline: selected ? '2px solid #0A84FF' : todayCell ? '1.5px solid rgba(10,132,255,0.6)' : 'none',
                    outlineOffset: -1.5,
                  }}
                >
                  {isBest && (
                    <span className="absolute top-1.5 right-1.5 z-10 inline-flex items-center gap-0.5 px-1.5 py-[3px] rounded-full text-[9px] font-bold bg-green-500/20 text-green-400">
                      <TrendingUp size={9} /> ดีสุด{pct != null ? ` +${pct.toFixed(1)}%` : ''}
                    </span>
                  )}
                  {isWorst && (
                    <span className="absolute top-1.5 right-1.5 z-10 inline-flex items-center gap-0.5 px-1.5 py-[3px] rounded-full text-[9px] font-bold bg-red-500/20 text-red-400">
                      <TrendingDown size={9} /> ขาด{pct != null ? ` ${pct.toFixed(1)}%` : ''}
                    </span>
                  )}
                  <div className="w-full flex items-start justify-between gap-1">
                    <span className={`text-xs font-semibold ${todayCell ? 'text-accent-blue' : inMonth ? 'text-ink-muted' : 'text-ink-faint/50'}`}>
                      {dayNum}
                    </span>
                    {hasData && pct != null && !isBest && !isWorst && (
                      <span className={`text-[10px] font-semibold tabular-nums ${pnlColor(d!.profit)}`}>
                        {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="flex-1 w-full flex flex-col items-center justify-center text-center gap-1">
                    {hasData ? (
                      <>
                        {mode === 'pnl' && (
                          <>
                            <p className={`text-base font-bold tabular-nums leading-tight ${pnlColor(d!.profit)}`}>
                              {d!.profit > 0 ? '+' : d!.profit < 0 ? '-' : ''}{fmtNum(Math.abs(d!.profit), 2)} {cur ?? ''}
                            </p>
                            <p className="text-xs text-ink-faint tabular-nums leading-tight">{d!.trades} รายการเทรด</p>
                          </>
                        )}
                        {mode === 'trades' && (
                          <>
                            <p className="text-xl font-bold tabular-nums leading-tight text-ink">{d!.trades}</p>
                            <p className="text-xs text-ink-faint leading-tight">รายการเทรด</p>
                          </>
                        )}
                        {mode === 'results' && (
                          <>
                            <p className="text-base font-bold tabular-nums leading-tight">
                              <span className="text-green-400">{d!.wins}</span>
                              <span className="text-ink-faint">–</span>
                              <span className="text-red-400">{d!.losses}</span>
                            </p>
                            <p className="text-xs text-ink-faint tabular-nums leading-tight">
                              {d!.trades ? ((d!.wins / d!.trades) * 100).toFixed(0) : 0}% ชนะ
                            </p>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] font-medium text-ink-faint leading-tight">ไม่มีการเทรด</p>
                        <p className="text-[10px] text-ink-faint/60 leading-tight">ไม่มีกิจกรรม</p>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          {/* Best day */}
          <div className="lux-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={15} className="text-accent-yellow" />
              <p className="lux-label">วันที่ทำกำไรได้ที่สุดในเดือนนี้</p>
            </div>
            {s?.best_day && s.best_day.profit > 0 ? (
              <>
                <p className="text-sm text-ink-muted mb-1">
                  {thaiWeekday(s.best_day.date)}ที่ {Number(s.best_day.date.slice(-2))} {THAI_MONTHS_ABBR[cursor.month - 1]} {cursor.year}
                </p>
                <p className="text-3xl font-bold tabular-nums text-green-400 mb-1">
                  {fmtCur(s.best_day.profit, cur)}
                </p>
                <p className="text-xs text-ink-faint mb-4">{s.best_day.trades} รายการเทรด</p>
                <div>
                  <StatRow label="อัตราชนะ" value={`${s.best_day.win_rate}%`} valueClass="text-accent-blue" />
                  <StatRow label="ชนะ" value={s.best_day.wins} valueClass="text-green-400" />
                  <StatRow label="แพ้" value={s.best_day.losses} valueClass="text-red-400" />
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-muted py-6 text-center">ยังไม่มีวันที่ทำกำไรในเดือนนี้</p>
            )}
          </div>

          {/* Month stats */}
          <div className="lux-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Award size={15} className="text-accent-purple" />
              <p className="lux-label">สรุปทั้งเดือน</p>
            </div>

            {/* performance bar */}
            <div className="mb-4">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5">
                <div style={{ width: `${(pw / pTotal) * 100}%`, background: '#30D158' }} />
                <div style={{ width: `${(pl / pTotal) * 100}%`, background: '#FF453A' }} />
                <div style={{ width: `${(pb / pTotal) * 100}%`, background: 'rgba(235,235,245,0.30)' }} />
              </div>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-ink-muted">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />{pw} ชนะ</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />{pl} แพ้</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: 'rgba(235,235,245,0.30)' }} />{pb} เสมอ</span>
              </div>
            </div>

            <div>
              <StatRow label="อัตราชนะ (ต่อไม้)" value={`${s?.trade_win_rate ?? 0}%`} valueClass="text-accent-blue" />
              <StatRow
                label="Profit Factor"
                value={s?.profit_factor != null ? s.profit_factor.toFixed(2) : '—'}
                valueClass={(s?.profit_factor ?? 0) >= 1 ? 'text-green-400' : 'text-red-400'}
              />
              <StatRow label="กำไรเฉลี่ย/ไม้" value={fmtCur(s?.avg_win ?? 0, cur)} valueClass="text-green-400" />
              <StatRow label="ขาดทุนเฉลี่ย/ไม้" value={fmtCur(s?.avg_loss ?? 0, cur)} valueClass="text-red-400" />
              <StatRow label="ปริมาณการเทรด" value={`${fmtNum(s?.total_volume ?? 0)} ล็อต`} />
              <StatRow
                label={<><ArrowDownToLine size={12} /> เงินฝาก</>}
                value={fmtCur(s?.deposits ?? 0, cur)}
              />
              <StatRow
                label={<><ArrowUpFromLine size={12} /> เงินถอน</>}
                value={fmtCur(s?.withdrawals ?? 0, cur)}
              />
              <StatRow
                label={<><Percent size={12} /> ค่าคอม + swap</>}
                value={fmtCur((s?.commission ?? 0) + (s?.swap ?? 0), cur)}
                valueClass={((s?.commission ?? 0) + (s?.swap ?? 0)) < 0 ? 'text-red-400' : 'text-ink'}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Trade list ── */}
      <div className="lux-panel p-5 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={15} className="text-ink-muted" />
            <p className="lux-label">
              {selectedDay
                ? `รายการไม้วันที่ ${Number(selectedDay.slice(-2))} ${THAI_MONTHS_ABBR[cursor.month - 1]} ${cursor.year}`
                : `รายการไม้ในเดือน ${THAI_MONTHS[cursor.month - 1]}`}
            </p>
            <span className="text-xs text-ink-faint">({filteredHistory.length})</span>
          </div>
          <div className="flex items-center gap-3">
            {exportMsg && (
              <span className={`text-xs break-all max-w-[280px] truncate ${exportMsg.startsWith('บันทึก') ? 'text-green-400' : 'text-red-400'}`} title={exportMsg}>
                {exportMsg}
              </span>
            )}
            {selectedDay && (
              <button onClick={() => setSelectedDay(null)} className="ios-pressable text-xs text-accent-blue hover:underline">
                ดูทั้งเดือน
              </button>
            )}
            <button
              onClick={exportReport}
              disabled={exporting || filteredHistory.length === 0}
              className="ios-pressable inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-blue text-white hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              {exporting ? 'กำลัง Export…' : 'Export Report (HTML)'}
            </button>
          </div>
        </div>
        {filteredHistory.length === 0 ? (
          <p className="text-ink-muted py-6 text-center">ไม่มีประวัติในช่วงที่เลือก</p>
        ) : (
          <table className="lux-table text-sm min-w-[1180px]">
            <thead>
              <tr>
                <th className="py-2">วันที่/เวลาเปิด</th>
                <th>สัญลักษณ์</th>
                <th>ประเภท</th>
                <th>Pattern</th>
                <th>ล็อต</th>
                <th>ราคาเปิด</th>
                <th>SL</th>
                <th>TP</th>
                <th>ราคาปิด</th>
                <th>ถือนาน</th>
                <th>เหตุผลที่ปิด</th>
                <th>กำไร/ขาดทุน</th>
                <th>Ticket</th>
                <th>ที่มา</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((r) => {
                const profit = r.profit ?? 0;
                return (
                  <tr key={r.id} className="text-ink">
                    <td className="py-2 text-ink-muted tabular-nums whitespace-nowrap">{r.time}</td>
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
                    <td className={`tabular-nums ${profit < 0 ? 'text-red-400' : 'text-ink-muted'}`}>{r.sl ? r.sl.toFixed(2) : '—'}</td>
                    <td className="tabular-nums text-ink-muted">{r.tp ? r.tp.toFixed(2) : '—'}</td>
                    <td className="tabular-nums text-ink-muted">
                      {r.status === 'open' ? <span className="text-accent-blue">ลอยอยู่</span> : r.exit_price ? r.exit_price.toFixed(2) : '—'}
                    </td>
                    <td className="tabular-nums text-ink-muted whitespace-nowrap">{fmtDuration(r.duration_sec)}</td>
                    <td className={`whitespace-nowrap font-medium ${reasonColor(r.close_reason)}`}>{r.close_reason ?? '—'}</td>
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
