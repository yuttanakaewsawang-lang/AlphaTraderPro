import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  LineStyle,
} from 'lightweight-charts';
import {
  Play, Pause, RotateCcw, Download, RefreshCw, CheckCircle2,
  SlidersHorizontal, ChevronDown, ChevronsRight, Trophy, Gauge, Layers, Wallet, Activity, CalendarRange, Radio,
  Save, AlertTriangle,
} from 'lucide-react';
import api from '../api';
import { ZoneBandPrimitive } from '../lib/zoneBandPrimitive';
import { TradePositionPrimitive } from '../lib/tradePositionPrimitive';
import type { StrategyConfig } from '../types/strategy';

interface ReplayCandle { time: number; open: number; high: number; low: number; close: number; warmup?: boolean; }
interface ReplayTrade {
  time: number; exit_time: number; type: 'BUY' | 'SELL';
  entry: number; sl: number; tp: number; result: 'TP' | 'SL' | 'TRAIL';
  r: number; pattern?: string;
  zone_top?: number; zone_bottom?: number;
  // บริบทจุดเข้า (SMC ส่งมาครบ; engine อื่นมี rr/avg) — ใช้อธิบายว่า "เข้าเพราะอะไร"
  zone_type?: number; trend_bias?: number; rr?: number; avg?: number;
  engine?: string;   // โหมด combo: 'SMC' | 'SNIPER' — ไม้มาจาก logic ไหน
  // engine อื่น (sniper/swing/reversal/grid) จำลอง lot จริง — มี profit $ ต่อไม้มาให้เลย
  profit?: number; lot?: number; legs?: number;
}
type IPriceLine = ReturnType<ISeriesApi<'Candlestick', Time>['createPriceLine']>;
interface ZoneState { t: number; h: number | null; b: number | null; tp: number; rt: boolean; }
interface OBZone { s: number; e: number; top: number; bot: number; dir: 'bullish' | 'bearish'; }
interface ReplayData {
  success: boolean; error?: string; symbol: string; month: string; entry_tf: string;
  config_used: Record<number | string, number | string>;
  candles: ReplayCandle[]; trades: ReplayTrade[]; zone_data: ZoneState[];
  ob_zones: OBZone[];
  month_start_ts: number;
  total_trades: number; wins: number; losses: number; total_r: number; expectancy_r: number;
  total_profit: number; max_drawdown: number; max_drawdown_pct: number;
  start_balance: number; risk_percent: number;
  // grid tick-mode: จำนวนตะกร้าที่จำลองด้วย tick จริง / fallback bar-mode (ไม่มี tick history)
  use_real_ticks?: boolean; tick_sim_baskets?: number | null; bar_fallback_baskets?: number | null;
  // live parity (SMC): สัญญาณที่ backtest เห็นแต่บอทจริงเข้าไม่ได้
  ob_detect_mode?: number; spread_blocked?: number; poll_missed?: number;
  // combo: สรุปแยกรายกลยุทธ์ (ไม้รวมอยู่ใน trades ชุดเดียวกันแล้ว แยกด้วย field engine ต่อไม้)
  combo_summary?: {
    smc: { trades: number; profit: number; total_r: number };
    sniper: { trades: number; profit: number; total_r: number; error?: string | null; entry_timeframe?: string };
  } | null;
}

// ── ช่วงวันที่ ────────────────────────────────────────────────────────────────
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ปุ่มลัดเลือกช่วง — ย้อนหลังจาก "ถึงวันที่" ที่กำหนด (นับรวมวันสุดท้าย) */
const RANGE_PRESETS: { label: string; back: (d: Date) => Date }[] = [
  { label: '1 วัน',   back: (d) => d },
  { label: '5 วัน',   back: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 4) },
  { label: '7 วัน',   back: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6) },
  { label: '1 เดือน', back: (d) => new Date(d.getFullYear(), d.getMonth() - 1, d.getDate() + 1) },
  { label: '3 เดือน', back: (d) => new Date(d.getFullYear(), d.getMonth() - 3, d.getDate() + 1) },
  { label: '6 เดือน', back: (d) => new Date(d.getFullYear(), d.getMonth() - 6, d.getDate() + 1) },
  { label: '1 ปี',    back: (d) => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate() + 1) },
];

/** แท่งต่อวันของแต่ละ TF (ตลาด forex/metals เปิด ~24 ชม. × 5 วัน/สัปดาห์) — ใช้ประมาณขนาดข้อมูล */
const BARS_PER_DAY: Record<string, number> = { M1: 1440, M5: 288, M15: 96, M30: 48, H1: 24 };
// เกินนี้เตือน / เกินนี้ไม่ให้รัน (payload + ลูป replay ฝั่งเบราว์เซอร์รับไม่ไหว)
const BARS_WARN = 60_000;
const BARS_MAX = 150_000;

const SPEEDS = [
  { label: '0.5×', ms: 400 }, { label: '1×', ms: 200 }, { label: '2×', ms: 100 },
  { label: '5×', ms: 40 },   { label: '10×', ms: 20 },  { label: '20×', ms: 10 },
  { label: '50×', ms: 4 },
];

const TF_OPTIONS = ['M1', 'M5', 'M15', 'M30', 'H1'];

// สี candle ปกติ/warmup (แชร์ระหว่าง init chart กับ tick loop)
const CANDLE_COLORS = { upColor: '#30D158', downColor: '#FF453A', wickUpColor: '#30D158', wickDownColor: '#FF453A' };
const WARMUP_COLORS = { upColor: '#374151', downColor: '#374151', wickUpColor: '#374151', wickDownColor: '#374151' };
// แถบโซน — สีเดียวกับ Live Chart (SMCChart) เพื่อให้ replay กับของจริงหน้าตาตรงกัน
// จางตอนยังไม่ retest → เข้มขึ้นเมื่อ retest แล้ว (พร้อมเข้าไม้)
const ZONE_BAND = {
  sbr: { dim: 'rgba(255, 69, 58, 0.11)',  lit: 'rgba(255, 69, 58, 0.20)' },   // SBR = โซนขาย (แดง)
  rbs: { dim: 'rgba(48, 209, 88, 0.11)',  lit: 'rgba(48, 209, 88, 0.20)' },   // RBS = โซนซื้อ (เขียว)
};

interface CacheMonth { month: string; status: 'none' | 'saved' | 'active'; zone_type: number | null; high: number | null; low: number | null; }
interface Props { symbol: string; engine?: string; }

// ข้อมูลประจำ engine — สี/ชื่อ ตรงกับการ์ดหน้าเลือกกลยุทธ์และ badge ใน Live Chart
const ENGINE_META: Record<string, { label: string; color: string; title: string }> = {
  smc:      { label: 'SMC',      color: '#0A84FF', title: 'SMC Strategy Setup' },
  sniper:   { label: 'SNIPER',   color: '#30D158', title: 'Sniper Strategy Setup' },
  swing:    { label: 'SWING',    color: '#40C8E0', title: 'Swing Trade Setup' },
  reversal: { label: 'REVERSAL', color: '#FF9F0A', title: 'Reversal Setup' },
  grid:     { label: 'GRID',     color: '#BF5AF2', title: 'Grid Martingale Setup' },
  combo:    { label: 'SMC+SNIPER', color: '#30D158', title: 'Combo Setup (SMC + Sniper)' },
};

// ── UI helpers (นำเสนอล้วน ไม่ยุ่งกับ logic replay) ─────────────────────────
/** ไล่ตัวเลขเข้าหาเป้าหมายแบบ ease-out — ถูกขัดจังหวะกลางทางได้ (ค่าใหม่วิ่งต่อจากตำแหน่งปัจจุบัน) */
const useCountUp = (target: number, ms = 320) => {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * eased;
      fromRef.current = v;
      setVal(v);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else { fromRef.current = target; setVal(target); }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, ms]);
  return val;
};

const AnimatedNum: React.FC<{
  value: number; decimals?: number; prefix?: string; suffix?: string; signed?: boolean; className?: string;
}> = ({ value, decimals = 2, prefix = '', suffix = '', signed = false, className = '' }) => {
  const v = useCountUp(value);
  const sign = signed && v > 0 ? '+' : v < 0 ? '−' : '';
  const body = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span className={`tabular-nums ${className}`}>{sign}{prefix}{body}{suffix}</span>;
};

/** วงแหวน Win Rate — แสดงสัดส่วนชนะเป็นรูปทรง ไม่ใช่แค่ตัวเลข */
const WinRing: React.FC<{ pct: number; wins: number; losses: number }> = ({ pct, wins, losses }) => {
  const R = 30, C = 2 * Math.PI * R;
  const p = useCountUp(Math.max(0, Math.min(100, pct)), 420);
  const has = wins + losses > 0;
  return (
    <div className="relative w-[76px] h-[76px] shrink-0" role="img"
      aria-label={has ? `อัตราชนะ ${pct.toFixed(1)} เปอร์เซ็นต์ ชนะ ${wins} แพ้ ${losses}` : 'ยังไม่มีไม้ปิด'}>
      <svg viewBox="0 0 76 76" className="w-full h-full -rotate-90">
        <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle cx="38" cy="38" r={R} fill="none" stroke="#30D158" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - p / 100)}
          style={{ filter: 'drop-shadow(0 0 5px rgba(48,209,88,0.45))' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-bold tabular-nums leading-none">
          {has ? `${p.toFixed(0)}%` : '—'}
        </span>
        <span className="text-[9px] text-ink-faint mt-0.5 tabular-nums">{wins}/{losses}</span>
      </div>
    </div>
  );
};

/** เส้น equity — เงาจางคือทั้งเดือน, เส้นสว่างคือส่วนที่ replay เดินมาถึงแล้ว */
const EquitySpark: React.FC<{ points: number[]; revealed: number; base: number }> = ({ points, revealed, base }) => {
  const W = 260, H = 60;
  const path = useMemo(() => {
    if (points.length < 2) return null;
    let lo = points[0], hi = points[0];
    for (const v of points) { if (v < lo) lo = v; if (v > hi) hi = v; }
    lo = Math.min(lo, base); hi = Math.max(hi, base);
    const span = hi - lo || 1;
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => H - ((v - lo) / span) * (H - 6) - 3;
    const d = (n: number) => points.slice(0, n).map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const n = Math.min(Math.max(revealed, 0), points.length);
    const last = n > 0 ? { x: x(n - 1), y: y(points[n - 1]), v: points[n - 1] } : null;
    return { full: d(points.length), shown: n >= 2 ? d(n) : '', baseY: y(base), last };
  }, [points, revealed, base]);

  if (!path) return null;
  const up = path.last ? path.last.v >= base : true;
  const stroke = up ? '#30D158' : '#FF453A';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[60px]" aria-hidden="true">
      <line x1="0" y1={path.baseY} x2={W} y2={path.baseY} stroke="rgba(255,255,255,0.14)" strokeWidth="1" strokeDasharray="3 4" />
      <path d={path.full} fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {path.shown && (
        <path d={path.shown} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 4px ${stroke}66)` }} />
      )}
      {path.last && (
        <circle cx={path.last.x} cy={path.last.y} r="2.6" fill={stroke}
          style={{ filter: `drop-shadow(0 0 5px ${stroke})` }} />
      )}
    </svg>
  );
};

/** อธิบายว่า "ไม้นี้เข้าเพราะอะไร" จากบริบทที่ backtest ส่งมา (นำเสนอล้วน ไม่ยุ่ง logic)
 *  คืน { headline, detail } — headline สั้นสำหรับป้าย, detail เป็นประโยคเต็ม */
function describeEntry(t: ReplayTrade, engine: string): { headline: string; detail: string } {
  const isBuy = t.type === 'BUY';
  const dir = isBuy ? 'ขาขึ้น' : 'ขาลง';
  const side = isBuy ? 'BUY' : 'SELL';
  const trendNote =
    t.trend_bias === 1 ? ' · ตามเทรนด์ใหญ่ (ขาขึ้น)' :
    t.trend_bias === -1 ? ' · ตามเทรนด์ใหญ่ (ขาลง)' : '';

  if (engine === 'smc') {
    const p = (t.pattern || 'ZONE').toUpperCase();
    if (p === 'OB') {
      return {
        headline: `แตะ Order Block (${isBuy ? 'ฝั่งซื้อ' : 'ฝั่งขาย'})`,
        detail: `ราคาย้อนมาแตะ Order Block ${isBuy ? 'ฝั่งซื้อ' : 'ฝั่งขาย'} ที่ยังไม่ถูกใช้ (โซนที่สถาบันเคยวางออเดอร์) → เข้า ${side}${trendNote}`,
      };
    }
    if (p === 'FVG') {
      return {
        headline: 'เติมช่องว่าง FVG',
        detail: `ราคาเข้าเติมช่องว่าง FVG (Fair Value Gap) ที่เกิดจากแท่งพุ่งแรง แล้วเด้งกลับ → เข้า ${side}${trendNote}`,
      };
    }
    // ZONE retest — SBR (โซนขาย) / RBS (โซนซื้อ)
    const zoneName = t.zone_type === 0 ? 'โซนขาย (SBR)' : 'โซนซื้อ (RBS)';
    return {
      headline: `รีเทสต์${zoneName}`,
      detail: `ราคาเบรก${zoneName}แล้วย่อกลับมาทดสอบขอบโซน + ได้แท่งยืนยัน${dir} → เข้า ${side}${trendNote}`,
    };
  }
  if (engine === 'sniper') {
    return {
      headline: `เบรกกรอบ ${dir}`,
      detail: `ราคาปิดทะลุกรอบราคา N แท่งล่าสุดออก${dir} → เข้า ${side} ตามการเบรก (TP วัดจากความสูงกรอบ)${trendNote}`,
    };
  }
  if (engine === 'swing') {
    return {
      headline: `ย่อแตะ EMA ตามเทรนด์`,
      detail: `เทรนด์เป็น${dir} ราคาย่อกลับมาแตะเส้น EMA แล้วเด้ง → เข้า ${side} ตามเทรนด์ (SL หลัง swing)${trendNote}`,
    };
  }
  if (engine === 'reversal') {
    return {
      headline: `กลับตัวจาก RSI สุดขั้ว`,
      detail: `RSI แตะเขต${isBuy ? 'ขายมากเกินไป (oversold)' : 'ซื้อมากเกินไป (overbought)'} ที่จุดกลับตัว (pivot) → เข้า ${side} รับการกลับตัว${trendNote}`,
    };
  }
  if (engine === 'grid') {
    const legs = t.legs ?? 1;
    return {
      headline: `เปิดตะกร้า ${side}${legs > 1 ? ` · ถัว ${legs} ชั้น` : ''}`,
      detail: legs > 1
        ? `เปิดตะกร้า ${side} ตามทิศ EMA50 แล้วราคาสวน จึงถัวเฉลี่ยเพิ่มเป็น ${legs} ชั้น (avg ${t.avg ?? '-'}) → ปิดทั้งตะกร้าที่ TP รวม`
        : `เปิดตะกร้า ${side} ตามทิศ EMA50 → ปิดที่ TP ของตะกร้า`,
    };
  }
  return { headline: side, detail: `เข้า ${side}` };
}

const BacktestReplayView: React.FC<Props> = ({ symbol, engine = 'smc' }) => {
  const eng = ENGINE_META[engine] ? engine : 'smc';
  // combo = รันทั้ง SMC และ Sniper ทับช่วงเดียวกันแล้วรวมไม้ (backend จัดการให้) — ฟอร์มยังเป็น
  // ของ SMC เพราะ Sniper ใช้ config ที่บันทึกไว้ของตัวเอง (คนละ TF ได้) ปรับได้ที่หน้า Strategy
  const isCombo = eng === 'combo';
  const isSmc = eng === 'smc' || isCombo;
  const meta = ENGINE_META[eng];
  // ฟิลด์ override ที่ backtest ของแต่ละ engine รองรับจริง (key ไม่รองรับ backend กรองทิ้งอยู่แล้ว
  // แต่ซ่อนจาก UI ด้วย — กติกา dead-knob: ไม่โชว์ปุ่มที่หมุนแล้วไม่มีผล)
  const hasRR = isSmc || eng === 'swing' || eng === 'reversal';
  const hasTrendFilter = eng !== 'grid';
  const hasRisk = eng !== 'grid';
  // engine ที่ backtest จำลองด้วย tick จริงได้ (Every Tick) — smc + grid (2026-07-11)
  const hasTicks = isSmc || eng === 'grid';
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);

  // ── setup form ────────────────────────────────────────────────────────────
  // ช่วงวันที่ (YYYY-MM-DD) — default = ย้อนหลัง 1 เดือนถึงวันนี้
  const today = useMemo(() => new Date(), []);
  const todayStr = fmtDate(today);
  const [dateTo, setDateTo] = useState(todayStr);
  const [dateFrom, setDateFrom] = useState(() =>
    fmtDate(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate() + 1)));
  const applyPreset = (p: typeof RANGE_PRESETS[number]) => {
    const end = new Date(`${dateTo}T00:00:00`);
    setDateFrom(fmtDate(p.back(end)));
  };
  // Every Tick (real tick fill/cost) เปิดตายตัวเสมอ — ให้ผลแม่นสุด ไม่มีเหตุผลให้ปิด จึงตัด toggle ออก
  const useRealTicks = true;
  // defaults ตรง RECOMMENDED live config — จะถูกทับด้วยค่าจริงจาก DB ตอนโหลด (กันกรณี API ล้มแล้วค่าเพี้ยน)
  const [rr, setRr] = useState('2.5');
  const [entryTf, setEntryTf] = useState('M5');
  const [zoneTf, setZoneTf] = useState('M5');
  const [trendFilter, setTrendFilter] = useState(false);
  const [obEntry, setObEntry] = useState(true);
  const [engulfing, setEngulfing] = useState(false);
  const [retest, setRetest] = useState(true);
  const [spread, setSpread] = useState('0');
  const [commission, setCommission] = useState('0');
  const [startBalance, setStartBalance] = useState('200');
  const [riskPct, setRiskPct] = useState('1.0');
  const [showWarmup, setShowWarmup] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  // พับการ์ดตั้งค่าเก็บหลังโหลดข้อมูลสำเร็จ เพื่อให้กราฟ/สกอร์บอร์ดได้พื้นที่เต็ม (กดกางกลับได้ตลอด)
  const [setupOpen, setSetupOpen] = useState(true);
  // บันทึกค่าฟอร์มปัจจุบันกลับเป็น Live Config ของกลยุทธ์นี้ (คนละก้อนกับการรัน backtest —
  // ไม่กระทบ replay ที่กำลังดูอยู่ แค่เขียนทับ config จริงใน DB)
  const [savingLiveConfig, setSavingLiveConfig] = useState(false);
  const [liveConfigMsg, setLiveConfigMsg] = useState('');
  const [liveConfigOk, setLiveConfigOk] = useState(true);

  // ── replay state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cacheMonths, setCacheMonths] = useState<CacheMonth[]>([]);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [done, setDone] = useState(false);
  // โหมด Real-time — แท่งปัจจุบัน "ก่อตัว" ทีละนิดเหมือน live แทนที่จะโผล่ทั้งแท่ง
  const [realtime, setRealtime] = useState(false);
  const realtimeRef = useRef(false);
  useEffect(() => { realtimeRef.current = realtime; }, [realtime]);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [statR, setStatR] = useState(0);
  const [statWins, setStatWins] = useState(0);
  const [statLosses, setStatLosses] = useState(0);
  const [statProfitUsd, setStatProfitUsd] = useState(0);
  const [statMaxDDPct, setStatMaxDDPct] = useState(0);
  const [openTrade, setOpenTrade] = useState<ReplayTrade | null>(null);
  const peakRRef = useRef(0);
  const peakBalanceRef = useRef(0);
  const runningBalanceRef = useRef(0);
  const maxDDPctRef = useRef(0);

  // ตัวขับ playback ใหม่ — requestAnimationFrame แทน setInterval: เรนเดอร์ตาม refresh rate จริง
  // ของจอ (~60fps) เสมอไม่ว่าจะตั้งความเร็วเท่าไร กันอาการกระตุกจาก setInterval ที่ browser
  // throttle ได้ที่ความเร็วสูง (ช่วงสั้นสุดที่เคยตั้งคือ 4ms ซึ่งเบราว์เซอร์ไม่รับประกัน timing)
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const bufferMsRef = useRef(0);
  const msPerBarRef = useRef(SPEEDS[1].ms);
  useEffect(() => { msPerBarRef.current = SPEEDS[speedIdx].ms; }, [speedIdx]);
  const cursorRef = useRef(0);
  const dataRef = useRef<ReplayData | null>(null);
  const openTradeRef = useRef<ReplayTrade | null>(null);
  // precomputed: candle index → trades that ENTER / EXIT at that candle
  // (สร้างครั้งเดียวตอนโหลดข้อมูล — reset replay ไม่ล้าง เพราะ derive จาก data ไม่ใช่ playback state)
  const entryMapRef = useRef<Map<number, ReplayTrade[]>>(new Map());
  const exitMapRef = useRef<Map<number, ReplayTrade[]>>(new Map());
  // zone state ต่อแท่ง keyed ด้วย timestamp (ไม่ใช่ index — index เพี้ยนตอน multi-month + warmup dedup)
  const zoneMapRef = useRef<Map<number, ZoneState>>(new Map());
  // เวลาแท่งเข้า/ออกต่อไม้ (derive จาก data — ใช้วางจุด entry/exit ที่ตำแหน่งเวลาบนกราฟให้ตรงเป๊ะ)
  const markTimesRef = useRef<Map<ReplayTrade, { e: number; x: number }>>(new Map());
  // annotation state (accumulated markers + active price lines)
  const seriesMarkersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const markersRef = useRef<SeriesMarker<Time>[]>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  // แถบโซน — primitive ตัวเดียวกับ Live Chart (วาดแถบสีพาดเต็มความกว้างตามช่วงราคาโซน)
  // แทนที่ของเดิมที่เป็นเส้นขอบบน/ล่าง 4 เส้น + เส้น OB อีก 4 เส้น
  const zoneBandRef = useRef<ZoneBandPrimitive | null>(null);
  // จุด entry/SL/TP/exit ที่ตำแหน่งราคาจริงเป๊ะ — กล่อง position (ไม้ที่เปิด) + จุดเข้า/ออก (ไม้ที่ปิด)
  const tradePrimRef = useRef<TradePositionPrimitive | null>(null);
  // จำโซนที่แสดงอยู่ เพื่อ setZone เฉพาะตอนเปลี่ยนจริง (ไม่เรียกซ้ำทุกแท่ง)
  const shownZoneRef = useRef<string>('');

  // ── load live config (ตาม engine ที่เลือก — คนละ endpoint คนละ shape) ─────
  useEffect(() => {
    if (isSmc) {
      api.get<StrategyConfig>('/api/strategy/config', { params: { symbol } })
        .then((res) => {
          const c = res.data;
          setRr(String(c.tp_ratio_rr));
          setZoneTf(c.zone_timeframe); // TF เดียวใช้ทั้ง zone+entry (entry_timeframe รวมเข้ามาแล้ว)
          setTrendFilter(!!c.use_trend_filter);
          setObEntry(!!c.enable_ob_entry);
          setEngulfing(!!c.require_engulfing);
          setRetest(!!c.require_retest);
          setSpread(String(c.spread_points ?? 0));
          setCommission(String(c.commission_per_lot ?? 0));
          if (c.risk_percent) setRiskPct(String(c.risk_percent));
          setConfigLoaded(true);
        })
        .catch(() => setConfigLoaded(true));
    } else {
      api.get<Record<string, any>>(`/api/${eng}/config`, { params: { symbol } })
        .then((res) => {
          const c = res.data ?? {};
          if (c.rr != null) setRr(String(c.rr));
          if (c.entry_timeframe) setEntryTf(c.entry_timeframe);
          if (c.use_trend_filter != null) setTrendFilter(!!c.use_trend_filter);
          // config live ของ engine อื่นไม่มี spread_points (มีเฉพาะใน backtest) — default 11
          // ให้ตรงกับ DEFAULT_CONFIG ของ <engine>_backtest ทุกตัว ไม่งั้น UI โชว์ 0 แต่ engine ใช้ 11
          setSpread(String(c.spread_points ?? 11));
          if (c.risk_percent != null) setRiskPct(String(c.risk_percent));
          setConfigLoaded(true);
        })
        .catch(() => setConfigLoaded(true));
    }
  }, [symbol, eng, isSmc]);

  // combo: ดึง TF ที่บันทึกไว้ของ Sniper มาเป็นค่าเริ่มต้นของช่อง "Entry TF (Sniper)"
  useEffect(() => {
    if (!isCombo) return;
    api.get<Record<string, any>>('/api/sniper/config', { params: { symbol } })
      .then((res) => { if (res.data?.entry_timeframe) setEntryTf(res.data.entry_timeframe); })
      .catch(() => {});
  }, [symbol, isCombo]);

  // ── init chart ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;
    // สีทั้งหมดอิงโทน iOS ของแอป (hairline โปร่งใส) แทนสีเทาอมน้ำเงิน/เทาเข้มชุดเดิม
    // (#1A1A2E, #374151, #9CA3AF) ที่หลุดจาก palette — กราฟจะกลืนไปกับการ์ดรอบๆ
    // หมายเหตุ: ไม่ตั้ง attributionLogo → โลโก้ TradingView ยังแสดงตาม default
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0C0C0E' },
        textColor: 'rgba(235, 235, 245, 0.55)',
        fontFamily: "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.035)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.035)' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(255, 255, 255, 0.28)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0A84FF' },
        horzLine: { color: 'rgba(255, 255, 255, 0.28)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#0A84FF' },
      },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.08)' },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, { ...CANDLE_COLORS, borderVisible: false });
    chartRef.current = chart;
    candleSeriesRef.current = series;
    seriesMarkersPluginRef.current = createSeriesMarkers(series, []);

    // แถบโซน — primitive ตัวเดียวกับ Live Chart (SMCChart) เริ่มต้นว่างเปล่า
    // กราฟจะวิ่งเปล่าๆ จนกว่าจะเกิดโซน แล้วค่อยโผล่แถบสีพาดตามช่วงราคาของโซนนั้น
    const zoneBand = new ZoneBandPrimitive();
    series.attachPrimitive(zoneBand);
    zoneBandRef.current = zoneBand;

    // กล่อง position + จุดเข้า/ออกที่ราคาจริง — วาดทับแท่ง (zOrder 'top')
    const tradePrim = new TradePositionPrimitive();
    series.attachPrimitive(tradePrim);
    tradePrimRef.current = tradePrim;

    return () => { zoneBandRef.current = null; tradePrimRef.current = null; chart.remove(); };
  }, []);

  // ── fetch cache status ────────────────────────────────────────────────────
  const fetchCacheStatus = useCallback(async () => {
    try {
      const res = await api.get<{ symbol: string; months: CacheMonth[] }>('/api/backtest/cache-status', {
        params: { symbol, months: 12 },
      });
      setCacheMonths(res.data.months ?? []);
    } catch { /* ignore */ }
  }, [symbol]);

  // zone cache = concept ของ SMC เท่านั้น — engine อื่นไม่ต้องดึง
  useEffect(() => { if (isSmc) fetchCacheStatus(); }, [fetchCacheStatus, isSmc]);

  // ── fetch & run backtest (single or multi-month) ─────────────────────────
  const fetchData = async () => {
    setLoading(true);
    setError('');
    stopReplay();
    setReplayData(null); setDone(false);
    setCursor(0); cursorRef.current = 0;
    setStatR(0); setStatWins(0); setStatLosses(0); setStatMaxDDPct(0);
    setStatProfitUsd(0);
    peakRRef.current = 0; peakBalanceRef.current = 0; runningBalanceRef.current = 0; maxDDPctRef.current = 0;
    setOpenTrade(null); openTradeRef.current = null;
    entryMapRef.current = new Map(); exitMapRef.current = new Map(); zoneMapRef.current = new Map();
    clearAnnotations();
    candleSeriesRef.current?.setData([]);

    const rangeLabel = dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`;
    // ส่งเฉพาะ override ที่ engine นั้นรองรับ — sniper/swing/reversal เป็น bar-mode เสมอ
    const commonParams: Record<string, string | number | boolean> = {
      symbol,
      engine: eng,
      // SMC ใช้ TF เดียว (zone_timeframe, ส่งในบล็อก isSmc ด้านล่าง) — entry_timeframe เป็น field
      // ของ Sniper/Swing/Reversal/Grid เท่านั้น (แต่ละ engine มี TF เดียวของตัวเองอยู่แล้ว)
      // combo ส่งทั้งคู่: zone_timeframe = TF ของ SMC (ในบล็อก isSmc ด้านล่าง) และ
      // entry_timeframe = TF ของ Sniper — backend เอาไป override config ของแต่ละ engine แยกกัน
      ...(!isSmc || isCombo ? { entry_timeframe: entryTf } : {}),
      show_warmup: showWarmup,
      start_balance: Number(startBalance) || 200,
      risk_percent: Number(riskPct) || 1.0,
      spread_points: Number(spread),
      ...(hasRR ? { tp_ratio_rr: Number(rr) } : {}),
      ...(hasTrendFilter ? { use_trend_filter: trendFilter ? 1 : 0 } : {}),
      // SMC + Grid จำลองด้วย tick จริง (grid: ตะกร้าที่ไม่มี tick history จะ fallback bar-mode)
      ...(hasTicks ? { use_real_ticks: useRealTicks } : {}),
      ...(isSmc ? {
        zone_timeframe: zoneTf,
        enable_ob_entry: obEntry ? 1 : 0,
        require_engulfing: engulfing ? 1 : 0,
        require_retest: retest ? 1 : 0,
        commission_per_lot: Number(commission),
      } : {}),
    };

    try {
      // เรียกครั้งเดียวด้วยช่วงวันที่ (เดิมวนทีละเดือนแล้ว merge — backend รับ date_from/date_to
      // ตรงๆ แล้ว จึงไม่ต้อง dedup แท่งข้ามเดือนอีก) ช่วงยาว (เป็นปี) ใช้เวลารันนาน → timeout 10 นาที
      const res = await api.get<ReplayData>('/api/backtest/replay-data', {
        params: { ...commonParams, date_from: dateFrom, date_to: dateTo },
        timeout: 600000,
      });
      if (!res.data.success) { setError(res.data.error || `โหลด ${rangeLabel} ไม่สำเร็จ`); setLoading(false); return; }

      const allCandles = [...res.data.candles].sort((a, b) => a.time - b.time);
      const allTrades = [...res.data.trades].sort((a, b) => a.time - b.time);
      const allZoneData = res.data.zone_data ?? [];
      const allObZones = res.data.ob_zones ?? [];

      const monthStartMarkers: SeriesMarker<Time>[] = [];
      if (showWarmup && res.data.month_start_ts) {
        monthStartMarkers.push({
          time: (res.data.month_start_ts) as Time,
          position: 'aboveBar', color: '#FF9F0A',
          shape: 'arrowDown', text: `▶ ${dateFrom}`, size: 2,
        });
      }

      // สถิติคิดจากไม้ที่ได้จริง (ตรงกับที่ animation นับ)
      const combinedWins = allTrades.filter((t) => t.r > 0).length;
      const combinedLosses = allTrades.filter((t) => t.r <= 0).length;
      const combinedTotalR = allTrades.reduce((s, t) => s + t.r, 0);
      const combinedTotal = allTrades.length;

      const combined: ReplayData = {
        ...res.data,
        month: res.data.month || rangeLabel,
        candles: allCandles,
        trades: allTrades,
        zone_data: allZoneData,
        ob_zones: allObZones,
        total_trades: combinedTotal,
        wins: combinedWins,
        losses: combinedLosses,
        total_r: Math.round(combinedTotalR * 100) / 100,
        expectancy_r: combinedTotal ? Math.round((combinedTotalR / combinedTotal) * 1000) / 1000 : 0,
      };

      setReplayData(combined);
      dataRef.current = combined;
      setSetupOpen(false);   // โหลดสำเร็จ → ยุบฟอร์มให้กราฟเต็มจอ

      // precompute entry/exit maps
      const candles = combined.candles;
      const eMap = new Map<number, ReplayTrade[]>();
      const xMap = new Map<number, ReplayTrade[]>();
      const mtMap = new Map<ReplayTrade, { e: number; x: number }>();
      // หา "แท่งที่ครอบเวลานั้น" (แท่งสุดท้ายที่ time <= ts) — ตั้งแต่โหมด live parity
      // เวลาเข้า/ออกไม้เป็นเวลา tick จริงกลางแท่ง ไม่ตรงหัวแท่งอีกแล้ว ถ้าใช้ c.time >= ts
      // marker จะไปโผล่แท่งถัดไปเสมอ (เยื้องจากจุดเข้าจริง 1 แท่ง)
      const barOf = (ts: number) => {
        const after = candles.findIndex((c) => c.time > ts);
        if (after === -1) return candles.length - 1;   // เลยแท่งสุดท้าย → แท่งสุดท้าย
        return after > 0 ? after - 1 : 0;
      };
      combined.trades.forEach((t) => {
        const ei = barOf(t.time);
        if (ei >= 0) eMap.set(ei, [...(eMap.get(ei) ?? []), t]);
        // tick-mode sim ปิดไม้ได้ถึง 14 วันหลัง entry — อาจเลยแท่งสุดท้ายของเดือน
        // ถ้าเลยช่วง chart ให้ปิดที่แท่งสุดท้ายแทน ไม่งั้นไม้ค้าง (W/L ไม่ครบ + banner ค้าง)
        const xIdx = barOf(t.exit_time);
        xMap.set(xIdx, [...(xMap.get(xIdx) ?? []), t]);
        // เวลาแท่งเข้า/ออก (map เป็น candle time จริง เพื่อวางจุดบนกราฟให้ตรง)
        const eTime = ei >= 0 ? candles[ei].time : candles[0]?.time ?? 0;
        const xTime = candles[xIdx]?.time ?? eTime;
        mtMap.set(t, { e: eTime, x: xTime });
      });
      entryMapRef.current = eMap;
      exitMapRef.current = xMap;
      markTimesRef.current = mtMap;

      // ทศนิยมราคาสำหรับป้ายในกล่อง position (XAUUSD~2, FX~4-5) — อิงจากราคาตัวอย่าง
      const sample = candles.find((c) => !c.warmup) ?? candles[0];
      const px = sample?.close ?? 100;
      const priceDigits = px >= 100 ? 2 : px >= 10 ? 3 : px >= 1 ? 4 : 5;
      tradePrimRef.current?.setDigits(priceDigits);
      tradePrimRef.current?.clear();

      // zone state keyed ด้วย timestamp — ทนต่อ candle dedup ตอน multi-month + warmup
      const zMap = new Map<number, ZoneState>();
      allZoneData.forEach((z) => zMap.set(z.t, z));
      zoneMapRef.current = zMap;

      // (OB overlay ถูกถอดออกแล้ว — กราฟโชว์เฉพาะแถบโซน ตามที่ผู้ใช้ขอ
      //  backend ยังส่ง ob_zones มาเหมือนเดิม แค่ไม่ได้วาด)

      // month-start markers
      if (monthStartMarkers.length > 0) {
        seriesMarkersPluginRef.current?.setMarkers(monthStartMarkers);
        markersRef.current = monthStartMarkers;
      }

      // fit chart after load
      setTimeout(() => chartRef.current?.timeScale().fitContent(), 50);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  // ── บันทึกฟอร์มปัจจุบันเป็น Live Config ────────────────────────────────────
  // ส่งเฉพาะ field ที่เป็นค่ากลยุทธ์จริง (มีอยู่ใน live config ของ engine นั้น) — ไม่ส่ง
  // ทุนเริ่มต้น/เดือน/ช่วงวันที่ (เป็นพารามิเตอร์ backtest ล้วน ไม่มีความหมายกับ live)
  // ใช้เงื่อนไข hasRR/hasTrendFilter/hasRisk ชุดเดียวกับที่ใช้ซ่อน/โชว์ฟิลด์ในฟอร์ม เพื่อไม่ส่ง
  // key ที่ engine นั้นไม่รู้จัก (เช่น Grid ไม่มี rr/trend filter/risk_percent ใน live config)
  const buildLiveConfigPayload = (): Record<string, number | string> => {
    if (isSmc) {
      return {
        tp_ratio_rr: Number(rr),
        zone_timeframe: zoneTf,
        use_trend_filter: trendFilter ? 1 : 0,
        enable_ob_entry: obEntry ? 1 : 0,
        require_engulfing: engulfing ? 1 : 0,
        require_retest: retest ? 1 : 0,
        spread_points: Number(spread),
        commission_per_lot: Number(commission),
        risk_percent: Number(riskPct),
      };
    }
    const payload: Record<string, number | string> = { entry_timeframe: entryTf };
    if (hasRR) payload.rr = Number(rr);
    if (hasTrendFilter) payload.use_trend_filter = trendFilter ? 1 : 0;
    if (hasRisk) payload.risk_percent = Number(riskPct);
    return payload;
  };

  const saveLiveConfig = async () => {
    const payload = buildLiveConfigPayload();
    const summary = Object.entries(payload).map(([k, v]) => `${k} = ${v}`).join('\n');
    const confirmed = window.confirm(
      `บันทึกค่านี้เป็น Live Config ของ ${meta.label} (${symbol}) จริง?\n\n${summary}${isCombo ? `\n[Sniper] entry_timeframe = ${entryTf}` : ''}\n\n` +
      `หมายเหตุ: มีผลกับการเทรดจริงทันทีถ้าบัญชี/engine นี้กำลังรันอยู่ — ไม่กระทบ replay ที่กำลังดูอยู่`
    );
    if (!confirmed) return;

    setSavingLiveConfig(true);
    setLiveConfigMsg('');
    try {
      const url = isSmc ? '/api/strategy/config' : `/api/${eng}/config`;
      await api.post(url, payload, { params: { symbol } });
      // combo: ช่อง Entry TF เป็นของ Sniper ซึ่งอยู่คนละ config → เขียนอีกเส้นให้ครบ
      if (isCombo) await api.post('/api/sniper/config', { entry_timeframe: entryTf }, { params: { symbol } });
      setLiveConfigOk(true);
      setLiveConfigMsg(`บันทึกเป็น Live Config ของ ${meta.label} แล้ว`);
    } catch (e: any) {
      setLiveConfigOk(false);
      setLiveConfigMsg(e?.response?.data?.detail ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingLiveConfig(false);
    }
  };

  // ── replay engine ─────────────────────────────────────────────────────────
  const clearAnnotations = useCallback(() => {
    priceLinesRef.current.forEach((pl) => {
      try { candleSeriesRef.current?.removePriceLine(pl); } catch { /* already removed */ }
    });
    priceLinesRef.current = [];
    markersRef.current = [];
    seriesMarkersPluginRef.current?.setMarkers([]);
    // ล้างแถบโซน — เริ่มรอบใหม่ด้วยกราฟเปล่า
    zoneBandRef.current?.setZone(null);
    shownZoneRef.current = '';
    // ล้างกล่อง position + จุดเข้า/ออกทั้งหมด
    tradePrimRef.current?.clear();
    // คืนสี candle ปกติ (เผื่อหยุดค้างช่วง warmup สีเทา)
    candleSeriesRef.current?.applyOptions(CANDLE_COLORS);
  }, []);

  const resetStats = useCallback(() => {
    setCursor(0); cursorRef.current = 0;
    setStatR(0); setStatWins(0); setStatLosses(0); setStatMaxDDPct(0);
    setStatProfitUsd(0);
    peakRRef.current = 0; peakBalanceRef.current = 0; runningBalanceRef.current = 0; maxDDPctRef.current = 0;
    setOpenTrade(null); openTradeRef.current = null;
    bufferMsRef.current = 0;
    setDone(false);
    clearAnnotations();
    candleSeriesRef.current?.setData([]);
  }, [clearAnnotations]);

  const tick = useCallback(() => {
    const data = dataRef.current;
    if (!data || !candleSeriesRef.current) return;
    const idx = cursorRef.current;
    if (idx >= data.candles.length) { stopReplay(); setDone(true); return; }

    const c = data.candles[idx];
    // warmup candles แสดงเป็นสีเทาหรี่ เพื่อแยกออกจากช่วงเดือนจริง
    const isWarmup = c.warmup === true;
    if (isWarmup) {
      candleSeriesRef.current.applyOptions(WARMUP_COLORS);
    } else if (idx > 0 && data.candles[idx - 1]?.warmup) {
      // คืนสีปกติเมื่อผ่านพ้น warmup
      candleSeriesRef.current.applyOptions(CANDLE_COLORS);
    }
    candleSeriesRef.current.update({ ...c, time: c.time as Time });

    // ── annotations ────────────────────────────────────────────────────────
    entryMapRef.current.get(idx)?.forEach((t) => {
      setOpenTrade(t); openTradeRef.current = t;

      // กล่อง position ที่จุดเข้าจริง — โซนกำไร (entry→TP) / ขาดทุน (entry→SL) + ลูกศรจุดเข้า
      // + เส้นราคา SL/TP/entry มีป้ายกำกับ วางตรงตำแหน่งราคาเป๊ะ (แทนเส้นราคาเต็มความกว้างเดิม)
      const mt = markTimesRef.current.get(t);
      tradePrimRef.current?.setOpen({
        entryTime: (mt?.e ?? (c.time as number)) as Time,
        rightTime: c.time as Time,
        entry: t.entry, sl: t.sl, tp: t.tp, type: t.type,
      });
    });

    exitMapRef.current.get(idx)?.forEach((t) => {
      setStatR((prev) => {
        const next = +(prev + t.r).toFixed(3);
        if (next > peakRRef.current) peakRRef.current = next;
        return next;
      });
      // คำนวณ USD แบบ compound — engine อื่นจำลอง lot จริงมาแล้ว ใช้ profit $ ต่อไม้ตรงๆ
      // (แม่นกว่า recompute จาก R เพราะรวม min-lot guard/ปัด volume_step แล้ว) ส่วน SMC ใช้สูตรเดิม
      const bal0 = (dataRef.current?.start_balance ?? 0) || 200;
      const riskPctNum = (dataRef.current?.risk_percent ?? 0) || 1.0;
      setStatProfitUsd((prevUsd) => {
        const curBalance = bal0 + prevUsd;
        const riskAmt = curBalance * riskPctNum / 100;
        const profitThisTrade = !isSmc && t.profit != null ? t.profit : t.r * riskAmt;
        const nextUsd = +(prevUsd + profitThisTrade).toFixed(2);
        const nextBalance = bal0 + nextUsd;
        if (nextBalance > peakBalanceRef.current) peakBalanceRef.current = nextBalance;
        if (peakBalanceRef.current > 0) {
          const ddPct = +((peakBalanceRef.current - nextBalance) / peakBalanceRef.current * 100).toFixed(2);
          if (ddPct > maxDDPctRef.current) {
            maxDDPctRef.current = ddPct;
            setStatMaxDDPct(ddPct);
          }
        }
        runningBalanceRef.current = nextBalance;
        return nextUsd;
      });
      if (t.r > 0) setStatWins((p) => p + 1); else setStatLosses((p) => p + 1);
      if (openTradeRef.current?.time === t.time) {
        setOpenTrade(null); openTradeRef.current = null;
      }

      // ปิดกล่อง position + ปักจุดเข้า/ออกที่ราคาจริงเป๊ะไว้เป็นรอยเทรด
      // ราคาออก: TP→tp, SL→sl, TRAIL→คำนวณจาก R (entry ± R×ระยะความเสี่ยง)
      const mt = markTimesRef.current.get(t);
      const riskDist = Math.abs(t.entry - t.sl);
      const dir = t.type === 'BUY' ? 1 : -1;
      const exitPrice = t.result === 'TP' ? t.tp
        : t.result === 'SL' ? t.sl
        : t.entry + dir * t.r * riskDist;
      tradePrimRef.current?.addClosed({
        entryTime: (mt?.e ?? (c.time as number)) as Time, entryPrice: t.entry,
        exitTime: (mt?.x ?? (c.time as number)) as Time, exitPrice,
        type: t.type, win: t.r > 0,
      });
      tradePrimRef.current?.setOpen(null);
    });

    // ── แถบโซน ───────────────────────────────────────────────────────────────
    // มีโซน  → แถบสีพาดตามช่วงราคาโซน (จาง = รอ retest, เข้ม = retest แล้วพร้อมเข้า)
    // ไม่มี   → ปิดแถบ (โซนถูกใช้ไปแล้ว/หมดอายุ/ถูก invalidate)
    // โซนใหม่ → แถบย้ายไปโซนล่าสุดเอง เพราะยึดตาม state ของแท่งปัจจุบันเสมอ
    {
      const zs = zoneMapRef.current.get(c.time);
      // แท่งที่ไม่มี zone state (เช่นช่วง warmup) → คงแถบเดิมไว้ ไม่สั่งอะไร
      // (ถ้าเคลียร์ทุกแท่งที่ไม่มีข้อมูล แถบจะกะพริบ — พฤติกรรมเดิมก็คงค่าไว้เหมือนกัน)
      if (zs) {
        const active = zs.h !== null && zs.h > 0 && (zs.tp === 0 || zs.tp === 1);
        // key แทนสถานะที่มองเห็น — เรียก setZone เฉพาะตอนเปลี่ยนจริง (setZone สั่ง redraw ทุกครั้ง)
        const key = active ? `${zs.tp}|${zs.h}|${zs.b}|${zs.rt ? 1 : 0}` : '';
        if (key !== shownZoneRef.current) {
          shownZoneRef.current = key;
          if (active) {
            const band = zs.tp === 0 ? ZONE_BAND.sbr : ZONE_BAND.rbs;
            zoneBandRef.current?.setZone({ high: zs.h!, low: zs.b!, color: zs.rt ? band.lit : band.dim });
          } else {
            zoneBandRef.current?.setZone(null);
          }
        }
      }
    }

    // ยืดขอบขวาของกล่อง position ที่เปิดอยู่มาถึงแท่งปัจจุบัน (กล่องโตตามที่ replay เดิน)
    if (openTradeRef.current) tradePrimRef.current?.setRightTime(c.time as Time);

    cursorRef.current = idx + 1;
    setCursor(idx + 1);

    // ให้แท่งปัจจุบันอยู่กึ่งกลางกราฟ: scroll ไปที่ position = ครึ่งหนึ่งของ visible bars
    const ts = chartRef.current?.timeScale();
    if (ts) {
      const range = ts.getVisibleLogicalRange();
      const half = range ? Math.round((range.to - range.from) / 2) : 20;
      ts.scrollToPosition(half, false);
    }
  }, [isSmc]); // eslint-disable-line

  // ── โหมด Real-time: วาดแท่งกำลังก่อตัว (visual ล้วน — ไม่แตะ cursor/stats/zone) ──
  // จำลองเส้นทางราคาในแท่งจาก OHLC: bullish วิ่ง open→low→high→close, bearish วิ่ง open→high→low→close
  // แล้วค่อยให้ tick() commit แท่งจริง (ค่าปิดสุดท้ายตรง OHLC เป๊ะเสมอ ไม่มี drift)
  const drawForming = useCallback((idx: number, frac: number) => {
    const data = dataRef.current;
    const series = candleSeriesRef.current;
    if (!data || !series) return;
    const c = data.candles[idx];
    if (!c) return;
    const bullish = c.close >= c.open;
    const pts = bullish ? [c.open, c.low, c.high, c.close] : [c.open, c.high, c.low, c.close];
    const segs = pts.length - 1;
    const p = Math.min(0.9999, Math.max(0, frac)) * segs;
    const i = Math.floor(p);
    const price = pts[i] + (pts[i + 1] - pts[i]) * (p - i);
    // high/low แบบ running จาก open ถึงราคาปัจจุบัน (เหมือนแท่ง live ก่อตัวจริง)
    let hi = c.open, lo = c.open;
    for (let k = 1; k <= i; k++) { hi = Math.max(hi, pts[k]); lo = Math.min(lo, pts[k]); }
    hi = Math.max(hi, price); lo = Math.min(lo, price);
    series.update({ time: c.time as Time, open: c.open, high: hi, low: lo, close: price });
  }, []);

  // ตัวขับ playback — requestAnimationFrame แทน setInterval เดิม เพื่อให้ลื่นคงที่ทุกความเร็ว
  // แนวคิด: สะสมเวลาจริงที่ผ่านไปในตัวแปร buffer แล้ว "ถอน" ทีละ msPerBar (คาบต่อแท่งตาม speed
  // ที่เลือก) ออกมาเป็นแท่งที่ commit จริงกี่แท่งก็ได้ต่อเฟรม (ความเร็วสูงมากอาจ commit หลายแท่ง
  // ในเฟรมเดียว) ส่วนเศษที่เหลือใช้วาด "แท่งกำลังก่อตัว" ต่อเนื่องด้วย — ทุกเฟรมวิ่งตาม refresh
  // rate จริงของจอ (~60fps) เสมอไม่ขึ้นกับ speed จึงไม่มีอาการกระตุกแบบ setInterval ที่ browser
  // อาจ throttle ที่ความเร็วสูง (ช่วงเดิมสั้นสุด 4ms ซึ่งไม่มี browser ไหนรับประกัน timing ระดับนั้น)
  const frame = useCallback((now: number) => {
    const data = dataRef.current;
    if (!data) { rafRef.current = null; return; }
    const last = lastFrameRef.current ?? now;
    let dt = now - last;
    lastFrameRef.current = now;
    // กันดีดพรวดถ้าแท็บถูก throttle/สลับไปนาน (เบราว์เซอร์อาจไม่ยิง rAF หลายวินาทีตอน background)
    if (dt > 250) dt = 250;
    bufferMsRef.current += dt;
    const msPerBar = Math.max(1, msPerBarRef.current);

    let guard = 0;
    while (bufferMsRef.current >= msPerBar && cursorRef.current < data.candles.length && guard < 5000) {
      tick();
      bufferMsRef.current -= msPerBar;
      guard++;
    }

    if (cursorRef.current >= data.candles.length) {
      // จบ replay แล้ว — tick() เรียก stopReplay()+setDone(true) ไปแล้วตอนแท่งสุดท้าย
      rafRef.current = null;
      return;
    }

    if (realtimeRef.current) {
      drawForming(cursorRef.current, Math.min(0.999, bufferMsRef.current / msPerBar));
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [tick, drawForming]);

  const stopReplay = useCallback(() => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    lastFrameRef.current = null;
    setPlaying(false);
  }, []);

  const startReplay = useCallback(() => {
    if (!dataRef.current) return;
    if (cursorRef.current >= (dataRef.current.candles.length)) resetStats();
    bufferMsRef.current = 0;
    lastFrameRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(frame);
    setPlaying(true);
  }, [frame, resetStats]);

  const togglePlay = () => { if (playing) stopReplay(); else startReplay(); };

  // เลื่อนกราฟกลับไปยังแท่งล่าสุดที่ replay รันถึง โดยให้แท่งนั้นอยู่กึ่งกลางกรอบ — ใช้สูตร
  // centering เดียวกับที่ tick() ทำทุกแท่งระหว่างเล่น (position = ครึ่งหนึ่งของ visible bars
  // = จำนวนแท่งว่างที่เหลือด้านขวาของแท่งล่าสุด) ต่างจาก scrollToRealTime() ของ lightweight-charts
  // เดิมที่ดันแท่งล่าสุดไปชิดขอบขวาแทนกึ่งกลาง — เปิด animation เพราะเป็นการกดครั้งเดียว (ไม่ใช่
  // ทุกเฟรมเหมือน tick() ที่ปิด animation ไว้เพื่อประสิทธิภาพ)
  const jumpToLatest = useCallback(() => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    const range = ts.getVisibleLogicalRange();
    const half = range ? Math.round((range.to - range.from) / 2) : 20;
    ts.scrollToPosition(half, true);
  }, []);

  // เปลี่ยน speed ระหว่างเล่นอยู่ — msPerBarRef อัปเดตสดทุกเฟรมอยู่แล้ว (ดู useEffect ด้านบน)
  // ไม่ต้อง restart loop เลย จึงไม่มีอาการสะดุดตอนสลับความเร็วกลางคันเหมือนของเดิม

  useEffect(() => {
    stopReplay(); setReplayData(null); dataRef.current = null;
    entryMapRef.current = new Map(); exitMapRef.current = new Map(); zoneMapRef.current = new Map();
    candleSeriesRef.current?.setData([]); resetStats();
  }, [symbol]); // eslint-disable-line

  // ── derived ───────────────────────────────────────────────────────────────
  const data = replayData;
  const total = data?.candles.length ?? 0;
  const pct = total ? Math.round((cursor / total) * 100) : 0;
  const totalTrades = statWins + statLosses;
  const winPct = totalTrades ? ((statWins / totalTrades) * 100).toFixed(1) : '—';

  // ── ประมาณขนาดข้อมูลของช่วงที่เลือก (กัน payload/ลูป replay ใหญ่จนเบราว์เซอร์ค้าง) ──
  const rangeDays = useMemo(() => {
    const a = new Date(`${dateFrom}T00:00:00`).getTime();
    const b = new Date(`${dateTo}T00:00:00`).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.floor((b - a) / 86_400_000) + 1;   // รวมวันสุดท้าย
  }, [dateFrom, dateTo]);
  const rangeTf = isSmc ? zoneTf : entryTf;
  const estBars = Math.max(0, Math.round(rangeDays * (5 / 7) * (BARS_PER_DAY[rangeTf] ?? 288)));
  const rangeInvalid = rangeDays <= 0;
  const barsTooMany = estBars > BARS_MAX;
  const barsHeavy = estBars > BARS_WARN && !barsTooMany;
  const canRun = !loading && !rangeInvalid && !barsTooMany;
  const bal0 = (data?.start_balance || Number(startBalance) || 200);
  const curBalance = bal0 + statProfitUsd;
  const pnlPct = bal0 > 0 ? (statProfitUsd / bal0) * 100 : 0;

  // เส้น equity ของทั้งช่วง — คำนวณครั้งเดียวจาก trades (สูตรทบต้นเดียวกับ tick loop / สรุปผล)
  // แล้วค่อยเผยทีละจุดตามจำนวนไม้ที่ปิดไปแล้ว จึงไม่ต้องแตะ tick loop เลย
  const equityPoints = useMemo(() => {
    if (!data) return [] as number[];
    const b0 = data.start_balance || 200;
    const riskPctNum = data.risk_percent || 1.0;
    let run = b0;
    const pts = [b0];
    data.trades.forEach((t) => {
      const p = !isSmc && t.profit != null ? t.profit : t.r * (run * riskPctNum / 100);
      run = +(run + p).toFixed(2);
      pts.push(run);
    });
    return pts;
  }, [data, isSmc]);

  // iOS-style pill switch (ตรงกับ StrategyView)
  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" onClick={() => onChange(!value)}
      className="inline-flex items-center gap-2 text-sm select-none ios-pressable">
      <span className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${value ? 'bg-green-500/70' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${value ? 'left-4' : 'left-0.5'}`} />
      </span>
      <span className={value ? 'text-ink' : 'text-ink-muted'}>{label}</span>
    </button>
  );

  return (
    <div className="ios-fade-in flex flex-col gap-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="ios-icon-tile w-9 h-9 shrink-0"
          style={{ background: `${meta.color}1f`, border: `1px solid ${meta.color}40`, color: meta.color }}>
          <Activity size={17} />
        </span>
        <div className="min-w-0">
          <h1 className="lux-h1 leading-tight">Backtest Replay</h1>
          <p className="text-[11px] text-ink-faint leading-tight">
            เล่นย้อนหลังทีละแท่ง เห็นทุกไม้ที่กลยุทธ์เข้า · {symbol}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide"
          style={{ color: meta.color, background: `${meta.color}1f`, border: `1px solid ${meta.color}4d` }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
          {meta.label}
        </span>

        {data && (
          <span className={`ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
            playing ? 'border-green-500/40 bg-green-500/10 text-green-400'
            : done   ? 'border-[var(--accent-blue)]/40 bg-[#0A84FF]/10 text-[var(--accent-blue)]'
                     : 'border-[var(--hairline)] bg-white/5 text-ink-muted'}`}>
            <span className="relative flex w-1.5 h-1.5">
              {playing && <span className="replay-ping absolute inset-0 rounded-full bg-green-400" />}
              <span className={`relative w-1.5 h-1.5 rounded-full ${
                playing ? 'bg-green-400' : done ? 'bg-[var(--accent-blue)]' : 'bg-ink-faint'}`} />
            </span>
            {playing ? 'กำลังเล่น' : done ? 'เล่นจบแล้ว' : 'หยุดชั่วคราว'}
          </span>
        )}
      </div>

      {eng === 'grid' && (
        <div className="lux-card p-3 border border-red-500/40 bg-red-500/5 text-red-400 text-xs">
          ⚠ Grid Martingale: จากการ backtest ทุก config ที่ทดสอบให้ผลติดลบ — ใช้เพื่อศึกษาพฤติกรรมเท่านั้น ไม่แนะนำเงินจริง
        </div>
      )}
      {eng === 'reversal' && (
        <div className="lux-card p-3 border border-amber-500/40 bg-amber-500/5 text-amber-400 text-xs">
          ⚠ Reversal: Re-tune 2026-07-12 พลิก OOS 2025 จาก -13R เป็น +0.5R (เสมอทุน ไม่ใช่กำไรจริง) — ใช้เพื่อศึกษา/demo เท่านั้น
        </div>
      )}

      {/* ── Strategy Setup (ตาม engine ที่เลือก) — พับเก็บได้ ─────────────── */}
      <div className="lux-card overflow-hidden">
        <div className="flex items-center gap-2 p-3">
          <button type="button" onClick={() => setSetupOpen((v) => !v)} aria-expanded={setupOpen}
            className="flex items-center gap-3 flex-1 min-w-0 text-left p-1 rounded-lg ios-pressable">
            <span className="ios-icon-tile w-8 h-8 shrink-0 bg-white/5 border border-[var(--hairline)] text-ink-muted">
              <SlidersHorizontal size={15} />
            </span>
            <span className="min-w-0 flex-1 block">
              <span className="block text-sm font-semibold leading-tight">{meta.title}</span>
              <span className="block text-[11px] text-ink-faint leading-tight truncate">
                {setupOpen
                  ? (configLoaded
                      ? (isSmc
                          ? 'โหลดจาก live config แล้ว — ค่าอื่นๆ (Zone Guard, Liquidity Sweep ฯลฯ) ใช้ตาม Strategy config อัตโนมัติ'
                          : `โหลดจาก config ของ ${meta.label} แล้ว — ค่าอื่นๆ ใช้ตาม config ที่เซฟไว้ในหน้า Strategy อัตโนมัติ`)
                      : 'กำลังโหลด config…')
                  : `${dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`} (${rangeDays} วัน) · ${rangeTf}${hasRR ? ` · RR ${rr}` : ''} · ทุน $${startBalance}${hasRisk ? ` · เสี่ยง ${riskPct}%` : ''}`}
              </span>
            </span>
          </button>

          {/* ปุ่มกาง/ย่อ — แยกเป็นปุ่มของตัวเองขนาด 44px มีพื้นหลัง+สี กดง่าย
              (ของเดิมเป็นแค่ไอคอน 16px สีจางในปุ่มหัวการ์ด เล็งยากและมีช่องว่างข้างๆ เป็นจุดตาย) */}
          <button type="button" onClick={() => setSetupOpen((v) => !v)} aria-expanded={setupOpen}
            aria-label={setupOpen ? 'ย่อการตั้งค่า' : 'กางการตั้งค่า'}
            title={setupOpen ? 'ย่อการตั้งค่า' : 'กางการตั้งค่า'}
            className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl border
                       border-[var(--accent-blue)]/45 bg-[#0A84FF]/15 text-[var(--accent-blue)]
                       hover:bg-[#0A84FF]/28 hover:border-[var(--accent-blue)]/70 ios-pressable">
            <ChevronDown size={22} strokeWidth={2.75} aria-hidden="true"
              className={`transition-transform duration-200 ${setupOpen ? 'rotate-180' : ''}`}
              style={{ transitionTimingFunction: 'var(--ease-ios)' }} />
          </button>

          {/* พับอยู่ก็สั่งรันซ้ำได้เลย ไม่ต้องกางฟอร์มก่อน */}
          {!setupOpen && (
            <button type="button" onClick={fetchData} disabled={!canRun}
              className="h-11 px-4 shrink-0 lux-btn-primary text-xs font-semibold ios-pressable disabled:opacity-50">
              {loading ? 'กำลังโหลด…' : 'รันใหม่'}
            </button>
          )}
        </div>

        {setupOpen && (
        <div className="px-4 pb-4 pt-3 space-y-3 border-t border-[var(--hairline)] ios-fade-in">
        <div className="flex flex-wrap gap-x-6 gap-y-3 items-end">
          {/* ช่วงวันที่ — เลือกได้ตั้งแต่ 1 วันถึงหลายปี */}
          <div className="flex flex-col gap-1 w-full">
            <span className="lux-label flex items-center gap-1.5">
              <CalendarRange size={11} aria-hidden="true" /> ช่วงเวลา
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={dateFrom} max={dateTo} aria-label="จากวันที่"
                onChange={(e) => setDateFrom(e.target.value)}
                className="lux-input px-3 h-9 text-sm" />
              <span className="text-ink-faint text-sm" aria-hidden="true">→</span>
              <input type="date" value={dateTo} min={dateFrom} max={todayStr} aria-label="ถึงวันที่"
                onChange={(e) => setDateTo(e.target.value)}
                className="lux-input px-3 h-9 text-sm" />

              {/* ประมาณขนาดข้อมูล */}
              <span title={`ประมาณจาก ${rangeTf} · ${rangeDays} วัน (ตลาดเปิด ~5 วัน/สัปดาห์)`}
                className={`inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-xs font-medium border tabular-nums ${
                  rangeInvalid || barsTooMany ? 'text-red-400 bg-red-500/10 border-red-500/30'
                  : barsHeavy ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                  : 'text-ink-muted bg-white/5 border-[var(--hairline)]'}`}>
                {rangeInvalid ? 'ช่วงวันที่ไม่ถูกต้อง' : <>≈ {estBars.toLocaleString()} แท่ง · {rangeDays} วัน</>}
              </span>
            </div>

            {/* ปุ่มลัด */}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {RANGE_PRESETS.map((p) => {
                const active = dateFrom === fmtDate(p.back(new Date(`${dateTo}T00:00:00`)));
                return (
                  <button key={p.label} type="button" onClick={() => applyPreset(p)} aria-pressed={active}
                    className={`h-7 px-2.5 rounded-md text-xs border transition-colors ios-pressable ${
                      active
                        ? 'border-[var(--accent-blue)] bg-[#0A84FF]/15 text-[var(--accent-blue)] font-semibold'
                        : 'border-[var(--hairline)] text-ink-muted hover:text-ink hover:border-white/20'}`}>
                    {p.label}
                  </button>
                );
              })}
              <button type="button" onClick={() => setDateTo(todayStr)}
                className="h-7 px-2.5 rounded-md text-xs border border-[var(--hairline)] text-ink-faint hover:text-ink ios-pressable">
                ถึงวันนี้
              </button>
            </div>

            {(barsTooMany || barsHeavy) && (
              <p className={`text-[11px] mt-1 ${barsTooMany ? 'text-red-400' : 'text-amber-400'}`}>
                {barsTooMany
                  ? `ข้อมูลมากเกินไป (≈ ${estBars.toLocaleString()} แท่ง) — เบราว์เซอร์จะค้าง กรุณาย่นช่วงลง หรือเลือก TF ที่ใหญ่ขึ้น (เพดาน ${BARS_MAX.toLocaleString()} แท่ง)`
                  : `ช่วงนี้ข้อมูลค่อนข้างเยอะ (≈ ${estBars.toLocaleString()} แท่ง) — โหลดนาน และ replay จะใช้เวลาเล่นพอสมควร`}
              </p>
            )}
          </div>

          {/* RR — SMC/Swing/Reversal (Sniper ใช้ measured-move TP, Grid ใช้ basket TP) */}
          {hasRR && (
            <div className="flex flex-col gap-1">
              <span className="lux-label">RR</span>
              <input type="number" step="0.5" min="1" max="10" value={rr}
                onChange={(e) => setRr(e.target.value)}
                className="lux-input px-3 h-9 w-20 text-sm" />
            </div>
          )}

          {/* Entry TF — Sniper/Swing/Reversal/Grid (แต่ละ engine มี TF เดียวของตัวเอง)
              โหมด combo โชว์คู่กับ TF ของ SMC เพราะสอง logic ตั้งคนละ TF ได้จริง */}
          {(!isSmc || isCombo) && (
            <div className="flex flex-col gap-1">
              <span className="lux-label">{isCombo ? 'Entry TF (Sniper)' : 'Entry TF'}</span>
              <select value={entryTf} onChange={(e) => setEntryTf(e.target.value)}
                className="lux-input px-3 h-9 text-sm">
                {TF_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {/* Timeframe — SMC เท่านั้น (TF เดียวใช้ทั้ง zone+entry, entry_timeframe รวมเข้ามาแล้ว) */}
          {isSmc && (
            <div className="flex flex-col gap-1">
              <span className="lux-label">{isCombo ? 'Timeframe (SMC)' : 'Timeframe'}</span>
              <select value={zoneTf} onChange={(e) => setZoneTf(e.target.value)}
                className="lux-input px-3 h-9 text-sm">
                {TF_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {/* Start Balance */}
          <div className="flex flex-col gap-1">
            <span className="lux-label">ทุนเริ่มต้น (USD)</span>
            <input type="number" min="1" step="100" value={startBalance} onChange={(e) => setStartBalance(e.target.value)}
              className="lux-input px-3 h-9 w-28 text-sm" />
          </div>

          {/* Risk % — Grid ใช้ base lot + martingale multiplier ไม่ใช่ risk ต่อไม้ */}
          {hasRisk && (
            <div className="flex flex-col gap-1">
              <span className="lux-label">Risk %/ไม้</span>
              <input type="number" min="0.1" max="100" step="0.5" value={riskPct} onChange={(e) => setRiskPct(e.target.value)}
                className="lux-input px-3 h-9 w-20 text-sm" />
            </div>
          )}

          {/* Spread — ทุก engine มี spread model แล้ว (sniper เพิ่มพร้อม lot จริง 2026-07-11) */}
          <div className="flex flex-col gap-1">
            <span className="lux-label">Spread (pts)</span>
            <input type="number" min="0" value={spread} onChange={(e) => setSpread(e.target.value)}
              className="lux-input px-3 h-9 w-24 text-sm" />
          </div>

          {/* Commission — มีเฉพาะ SMC backtest */}
          {isSmc && (
            <div className="flex flex-col gap-1">
              <span className="lux-label">Commission/Lot</span>
              <input type="number" step="0.1" min="0" value={commission} onChange={(e) => setCommission(e.target.value)}
                className="lux-input px-3 h-9 w-28 text-sm" />
            </div>
          )}
        </div>

        {/* Toggles row */}
        <div className="flex flex-wrap items-center gap-5 pt-1">
          {isSmc && <Toggle label="OB Entry" value={obEntry} onChange={setObEntry} />}
          {isSmc && <Toggle label="Engulfing" value={engulfing} onChange={setEngulfing} />}
          {isSmc && <Toggle label="Retest Zone" value={retest} onChange={setRetest} />}
          {hasTrendFilter && <Toggle label="Trend Filter" value={trendFilter} onChange={setTrendFilter} />}
          <Toggle label="แสดง Warmup (เทาหรี่)" value={showWarmup} onChange={setShowWarmup} />
          {hasTicks ? (
            <span
              title={isSmc
                ? 'จำลอง fill/cost จาก tick จริงเสมอ (แม่นสุด) — ปิดไม่ได้'
                : 'จำลองตะกร้า (เติมชั้น/basket stop/TP) จาก tick จริงตามลำดับราคาจริง — เดือน/ตะกร้าที่ไม่มี tick history จะ fallback เป็น bar-mode อัตโนมัติ'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Every Tick (Real Ticks)
            </span>
          ) : (
            <span
              title="backtest ของกลยุทธ์นี้จำลองจากแท่งปิด (bar-mode) — ไม่มี tick simulation"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-ink-muted border border-[var(--hairline)]">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-faint" style={{ background: meta.color }} />
              Bar Mode (แท่งปิด)
            </span>
          )}
          {isSmc && (
            <span
              title={'โหมด Live Parity: หา OB/FVG ด้วยหน้าต่าง 100 แท่งแบบเดียวกับบอทจริง, เข้าไม้ที่ราคาซึ่งบอทได้จริง '
                   + 'ณ รอบ poll (ทุก 10 วิ) และเช็ค max_spread_points ก่อนเข้าเสมอ — ตัวเลขจะน้อยกว่าโหมดเดิมมาก '
                   + 'แต่เป็นตัวเลขที่ live ทำตามได้จริง'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0A84FF]" />
              Live Parity
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mt-1 items-center">
          <button onClick={fetchData} disabled={!canRun}
            className="h-10 px-6 lux-btn-primary text-sm ios-pressable disabled:opacity-50">
            {loading ? 'กำลังโหลด — รัน backtest อยู่…' : 'โหลดข้อมูล & เริ่ม Replay'}
          </button>

          {/* บันทึกค่าฟอร์มปัจจุบัน (RR/TF/toggle ฯลฯ) กลับเป็น Live Config ของกลยุทธ์นี้ — คนละ
              การกระทำกับการรัน backtest ด้านบน ไม่ต้องกดโหลดข้อมูลก่อนก็บันทึกได้ */}
          <button onClick={saveLiveConfig} disabled={savingLiveConfig}
            title="เขียนค่าที่ตั้งในฟอร์มนี้ทับ Live Config จริง (มีผลกับการเทรดจริงถ้าบัญชีนี้กำลังรันอยู่)"
            className="h-10 px-4 inline-flex items-center gap-1.5 rounded-xl border border-[var(--hairline)]
                       text-sm text-ink-muted hover:text-ink hover:border-white/20 ios-pressable disabled:opacity-50">
            <Save size={15} aria-hidden="true" />
            {savingLiveConfig ? 'กำลังบันทึก…' : 'บันทึกเป็น Live Config'}
          </button>

          {barsTooMany && (
            <span className="text-xs text-red-400">ย่นช่วงวันที่ หรือเลือก TF ที่ใหญ่ขึ้นก่อนจึงจะรันได้</span>
          )}

          {liveConfigMsg && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              liveConfigOk ? 'text-green-400' : 'text-red-400'}`}>
              {liveConfigOk ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
              {liveConfigMsg}
            </span>
          )}
        </div>

        {/* ── Zone Cache Status — ข้อมูลอย่างเดียว (SMC) ─────────────────────
            เลิกใช้เลือกเดือนแล้ว เพราะช่วงเวลาเลือกจากปฏิทินวันที่ด้านบนแทน
            แต่ยังมีประโยชน์ให้เห็นว่าเดือนไหนมี zone ค้างไว้เป็นจุดตั้งต้น */}
        {cacheMonths.length > 0 && (
          <div className="pt-1">
            <div className="flex items-center gap-3 mb-2">
              <p className="lux-label">Zone Cache Status</p>
              <div className="flex items-center gap-3 text-[10px] text-ink-faint">
                <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500/70 mr-1" />Active zone</span>
                <span><span className="inline-block w-2 h-2 rounded-sm bg-sky-500/40 mr-1" />Saved</span>
                <span><span className="inline-block w-2 h-2 rounded-sm bg-white/10 mr-1" />ไม่มี cache</span>
              </div>
              <button onClick={fetchCacheStatus}
                className="ml-auto inline-flex items-center gap-1 text-[10px] text-ink-faint hover:text-ink ios-pressable">
                <RefreshCw size={10} /> รีเฟรช
              </button>
            </div>
            <p className="text-[10px] text-ink-faint mb-1">
              แสดงสถานะอย่างเดียว — โหมดช่วงวันที่ไม่ใช้ zone cache (สร้าง zone จาก warmup 14 วันเสมอ)
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {[...cacheMonths].reverse().map((m) => {
                const isActive = m.status === 'active';
                const isSaved  = m.status === 'saved';
                const zoneLabel = m.zone_type === 0 ? 'SBR' : m.zone_type === 1 ? 'RBS' : null;
                return (
                  <div
                    key={m.month}
                    title={
                      isActive ? `Active zone${zoneLabel ? ` (${zoneLabel})` : ''} · ${m.high?.toFixed(2)} / ${m.low?.toFixed(2)}` :
                      isSaved  ? `Saved${zoneLabel ? ` (${zoneLabel})` : ''}` : 'ไม่มี cache'
                    }
                    className={`relative rounded-md px-1.5 py-2 text-center border border-[var(--hairline)] ${
                      isActive ? 'bg-emerald-500/15' :
                      isSaved  ? 'bg-sky-500/10' :
                                 'bg-white/[0.03]'
                    }`}
                  >
                    <p className="text-[10px] tabular-nums text-ink leading-tight">{m.month.slice(0, 7)}</p>
                    <p className={`text-[9px] font-semibold mt-0.5 ${
                      isActive ? 'text-emerald-400' : isSaved ? 'text-sky-400' : 'text-ink-faint'
                    }`}>
                      {isActive ? (zoneLabel ?? 'Active') : isSaved ? (zoneLabel ?? 'Saved') : '—'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
        )}
      </div>

      {error && (
        <div className="lux-card p-3 text-red-400 text-sm border border-red-500/40 bg-red-500/5" role="alert">{error}</div>
      )}

      {/* ── คำเตือน: Every Tick จำลอง Trailing/BE/Partial แบบมองโลกในแง่ดีเกินจริง ──
          ยืนยันด้วยข้อมูลจริง (2026-07-24): config ที่เปิด trailing/BE/partial ให้ WR ~82% ใน
          replay แต่ live จริงช่วงเดียวกันได้แค่ ~44% (avg win < avg loss เพราะ BE/trail ตัดไม้ชนะ
          ก่อนถึง TP) — tick-replay ล็อกกำไร trailing ได้เพราะไม่มี latency/slippage/spread แปรผัน
          ที่ live เจอจริง ตัวเลขจึงสูงกว่าความเป็นจริงมาก */}
      {data && hasTicks && (
        Number(data.config_used?.enable_trailing) > 0 ||
        Number(data.config_used?.use_breakeven) > 0 ||
        Number(data.config_used?.use_partial_tp) > 0
      ) && (
        <div className="lux-card p-3 border border-amber-500/40 bg-amber-500/5 flex items-start gap-2.5"
             role="alert">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-300">ระวัง: ผลนี้มองโลกในแง่ดีเกินจริง</span> —
            config ที่โหลดมาเปิด{' '}
            {[Number(data.config_used?.use_partial_tp) > 0 && 'Partial TP',
              Number(data.config_used?.use_breakeven) > 0 && 'Breakeven',
              Number(data.config_used?.enable_trailing) > 0 && 'Trailing'].filter(Boolean).join(' / ')}{' '}
            ซึ่งการจำลอง Every Tick <span className="font-semibold">ล็อกกำไรได้ดีกว่า live จริงมาก</span>
            {' '}(ไม่มี latency/slippage/spread แปรผัน). วัดจริงพบ replay ให้ WR ~82% แต่ live จริงได้ ~44%
            เพราะ BE/Trailing ตัดไม้ชนะก่อนถึง TP. <span className="font-semibold">แนะนำ:</span> ปิด
            Partial/BE/Trailing แล้วปล่อยวิ่งถึง TP เพื่อดูผลที่ตรงกับ live (WR ~45–52% แต่กำไรจริงบวก).
          </div>
        </div>
      )}

      {/* ── Scoreboard: ทุน + กำไร + วงแหวน Win Rate + เส้น equity ─────────── */}
      {data && (
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="lux-card p-4 relative overflow-hidden">
            {/* แสงเรืองตามผลกำไร/ขาดทุน — บอกสถานะด้วยสีเสริมข้อความ ไม่ได้ใช้สีสื่อความหมายเดี่ยวๆ */}
            <div aria-hidden="true"
              className="pointer-events-none absolute -top-20 -right-12 w-64 h-64 rounded-full blur-3xl transition-opacity duration-700"
              style={{ background: statProfitUsd >= 0 ? '#30D158' : '#FF453A', opacity: statProfitUsd === 0 ? 0.05 : 0.16 }} />

            <div className="relative flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="lux-label flex items-center gap-1.5">
                  <Wallet size={11} aria-hidden="true" /> Balance · เริ่ม ${bal0.toLocaleString()}
                </p>
                <p className="text-[30px] font-bold leading-none mt-2 tracking-tight">
                  <AnimatedNum value={curBalance} prefix="$" />
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${
                    statProfitUsd >= 0
                      ? 'text-green-400 bg-green-500/10 border-green-500/25'
                      : 'text-red-400 bg-red-500/10 border-red-500/25'}`}>
                    <AnimatedNum value={statProfitUsd} prefix="$" signed />
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${
                    pnlPct >= 0
                      ? 'text-green-400 bg-green-500/10 border-green-500/25'
                      : 'text-red-400 bg-red-500/10 border-red-500/25'}`}>
                    <AnimatedNum value={pnlPct} decimals={1} suffix="%" signed />
                  </span>
                </div>
              </div>
              <WinRing pct={totalTrades ? (statWins / totalTrades) * 100 : 0} wins={statWins} losses={statLosses} />
            </div>

            <div className="relative mt-3 -mb-1">
              <EquitySpark points={equityPoints} revealed={totalTrades + 1} base={bal0} />
              <p className="text-[10px] text-ink-faint mt-0.5">
                เส้นสว่าง = เดินมาถึงแล้ว · เส้นจาง = ทั้งช่วงที่เลือก
              </p>
            </div>
          </div>

          {/* ตัวเลขย่อย */}
          <div className="grid grid-cols-3 gap-2 content-start">
            {[
              { label: 'R สะสม', icon: <Trophy size={11} aria-hidden="true" />,
                value: `${statR >= 0 ? '+' : '−'}${Math.abs(statR).toFixed(2)}`,
                color: statR > 0 ? 'text-green-400' : statR < 0 ? 'text-red-400' : 'text-ink' },
              { label: 'ไม้ (ปิด/ทั้งหมด)', icon: <Layers size={11} aria-hidden="true" />,
                value: `${totalTrades}/${data.total_trades}`, color: 'text-ink' },
              { label: 'Max DD', icon: <Gauge size={11} aria-hidden="true" />,
                value: statMaxDDPct > 0 ? `−${statMaxDDPct.toFixed(1)}%` : '0.0%',
                color: statMaxDDPct > 0 ? 'text-red-400' : 'text-ink' },
              { label: 'ชนะ / แพ้', icon: null, value: `${statWins} / ${statLosses}`, color: 'text-ink' },
              { label: 'แท่งเทียน', icon: null, value: `${cursor.toLocaleString()}/${total.toLocaleString()}`, color: 'text-ink' },
              { label: 'Win Rate', icon: null, value: totalTrades ? `${winPct}%` : '—', color: 'text-ink' },
            ].map((c) => (
              <div key={c.label} className="lux-card p-2.5 min-w-0">
                <p className="lux-label text-[10px] leading-tight flex items-center gap-1 truncate">
                  {c.icon}{c.label}
                </p>
                <p className={`font-semibold tabular-nums text-sm mt-1 truncate ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Player: แถบควบคุม + กราฟ + แถบความคืบหน้า รวมเป็นชิ้นเดียว ────── */}
      <div className="lux-card overflow-hidden">
        {data && (
          <div className="flex flex-wrap items-center gap-2 p-2.5 border-b border-[var(--hairline)]">
            {/* Play/Pause */}
            <button onClick={togglePlay} aria-label={playing ? 'หยุดชั่วคราว' : 'เล่น'}
              className={`h-10 w-10 flex items-center justify-center rounded-xl transition-colors ios-pressable ${
                playing ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'lux-btn-primary'}`}>
              {playing ? <Pause size={18} /> : <Play size={18} className="translate-x-[1px]" />}
            </button>

            {/* Reset */}
            <button onClick={() => { stopReplay(); resetStats(); }} aria-label="เริ่มเล่นใหม่ตั้งแต่ต้น"
              className="h-10 w-10 flex items-center justify-center lux-btn-ghost rounded-xl ios-pressable" title="รีเซ็ต">
              <RotateCcw size={16} />
            </button>

            {/* Speed — iOS segmented control */}
            <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5" role="group" aria-label="ความเร็ว">
              {SPEEDS.map((s, i) => (
                <button key={s.label} onClick={() => setSpeedIdx(i)} aria-pressed={i === speedIdx}
                  className={`h-8 px-2.5 text-xs rounded-md transition-colors ios-pressable ${
                    i === speedIdx ? 'bg-[var(--accent-blue)] text-white font-semibold' : 'text-ink-muted hover:text-ink'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>

            {/* Real-time — แท่งค่อยๆ ก่อตัวเหมือน live (ดูจังหวะราคาเข้าใกล้จุด entry) */}
            <button onClick={() => setRealtime((v) => !v)} aria-pressed={realtime}
              title="แท่งปัจจุบันค่อยๆ ก่อตัวทีละนิดเหมือนดู live ย้อนหลัง — เห็นจังหวะที่ราคาเข้าใกล้จุด entry ชัดขึ้น"
              className={`h-8 inline-flex items-center gap-1.5 px-2.5 text-xs rounded-md border transition-colors ios-pressable ${
                realtime
                  ? 'border-[var(--accent-blue)]/60 text-[var(--accent-blue)] bg-[#0A84FF]/12'
                  : 'border-[var(--hairline)] text-ink-muted hover:text-ink'
              }`}>
              <Radio size={13} aria-hidden="true" />
              เรียลไทม์
            </button>

            {/* ไปแท่งล่าสุด — เผื่อผู้ใช้เลื่อน/ซูมกราฟไปดูของเก่าระหว่างเล่นแล้วอยากกลับมาที่ตำแหน่ง
                replay ปัจจุบัน (ซีรีส์มีแค่แท่ง 0..cursor เท่านั้น scrollToRealTime จึงตรงกับ cursor เป๊ะ) */}
            <button onClick={jumpToLatest} disabled={!data || cursor === 0}
              aria-label="ไปแท่งล่าสุดที่ backtest รันถึง"
              title="เลื่อนกราฟกลับไปยังแท่งล่าสุดที่ replay รันถึงตอนนี้"
              className="h-10 w-10 flex items-center justify-center lux-btn-ghost rounded-xl ios-pressable disabled:opacity-40">
              <ChevronsRight size={18} />
            </button>

            <div className="ml-auto flex items-center gap-2 text-xs tabular-nums text-ink-faint">
              {done && (
                <span className="inline-flex items-center gap-1 text-green-400 font-medium">
                  <CheckCircle2 size={12} aria-hidden="true" /> เสร็จ
                </span>
              )}
              <span>{data.month} · {data.entry_tf}</span>
            </div>
          </div>
        )}

        {/* กราฟ — container นี้ห้ามถูกซ่อนด้วย display:none (chart จะเสียขนาดตอน remount) */}
        <div className="relative" style={{ minHeight: 480 }}>
          <div ref={chartContainerRef} style={{ height: 480 }} />

          {/* ไม้ที่เปิดอยู่ — ป้ายลอยบนกราฟ พร้อมเหตุผลที่เข้า ณ ตอนนั้น */}
          {openTrade && (() => {
            // combo: ไม้มาจากคนละ logic → อธิบายด้วยกติกาของ engine เจ้าของไม้นั้น
            const owner = (openTrade.engine || '').toLowerCase();
            const why = describeEntry(openTrade, isCombo ? (owner || 'smc') : eng);
            return (
            <div className={`absolute top-3 left-3 max-w-[340px] ios-glass rounded-xl px-3 py-2 ios-fade-in border ${
              openTrade.type === 'BUY' ? 'border-green-500/40' : 'border-red-500/40'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                  openTrade.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                  <span className={`replay-breathe w-1.5 h-1.5 rounded-full ${
                    openTrade.type === 'BUY' ? 'bg-green-400' : 'bg-red-400'}`} />
                  {openTrade.type} · {why.headline}
                </span>
                {isCombo && openTrade.engine && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: openTrade.engine === 'SNIPER' ? '#30D158' : '#0A84FF',
                             background: openTrade.engine === 'SNIPER' ? 'rgba(48,209,88,0.14)' : 'rgba(10,132,255,0.14)' }}>
                    {openTrade.engine}
                  </span>
                )}
                <span className="text-[11px] text-ink-muted">Entry <span className="text-ink tabular-nums">{openTrade.entry}</span></span>
                <span className="text-[11px] text-ink-muted">SL <span className="text-red-400 tabular-nums">{openTrade.sl}</span></span>
                <span className="text-[11px] text-ink-muted">TP <span className="text-green-400 tabular-nums">{openTrade.tp}</span></span>
              </div>
              {/* เหตุผลที่เข้า — ประโยคเต็ม */}
              <p className="text-[11px] text-ink-faint mt-1.5 leading-snug border-t border-[var(--hairline)] pt-1.5">
                <span className="text-ink-muted font-medium">ทำไมเข้า: </span>{why.detail}
              </p>
            </div>
            );
          })()}

          {!data && !loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0C0C0E]/90">
              <div className="text-center space-y-2 px-6">
                <span className="ios-icon-tile w-11 h-11 mx-auto bg-white/5 border border-[var(--hairline)] text-ink-faint">
                  <Play size={18} className="translate-x-[1px]" />
                </span>
                <p className="text-ink-muted text-sm">ตั้งค่าด้านบนแล้วกด “โหลดข้อมูล &amp; เริ่ม Replay”</p>
                <p className="text-ink-faint text-xs">ระบบจะรัน backtest จริงแล้วเล่นย้อนหลังทีละแท่งให้ดู</p>
              </div>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0C0C0E]/90">
              <div className="text-center space-y-3" role="status" aria-live="polite">
                <div className="w-7 h-7 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-ink-muted text-sm">
                  กำลังรัน backtest {dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`} ({rangeDays} วัน) — รอสักครู่…
                </p>
              </div>
            </div>
          )}
        </div>

        {/* แถบความคืบหน้า — ชิดขอบล่างการ์ด, ไฮไลต์วิ่งเฉพาะตอนกำลังเล่น */}
        {data && (
          <div className="px-2.5 py-2 border-t border-[var(--hairline)] flex items-center gap-2">
            <div className="relative flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden"
              role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
              aria-label="ความคืบหน้าการเล่นย้อนหลัง">
              <div className={`relative h-full rounded-full overflow-hidden bg-gradient-to-r from-[#0A84FF] to-[#40C8E0] ${playing ? 'replay-shimmer' : ''}`}
                style={{ width: `${pct}%`, transition: 'width 0.12s linear' }} />
            </div>
            <span className="text-ink-faint text-xs tabular-nums w-10 text-right">{pct}%</span>
          </div>
        )}
      </div>

      {/* ── Final summary ─────────────────────────────────────────────────── */}
      {done && data && (() => {
        // คำนวณ Max DD แบบ compound balance (ตรงกับ animation)
        const bal0 = (data.start_balance || 200);
        const riskPctNum = (data.risk_percent || 1.0);
        let peakBal = bal0, runBal = bal0, maxDDPctFinal = 0;
        data.trades.forEach((t) => {
          const riskAmt = runBal * riskPctNum / 100;
          // engine อื่นมี profit $ จริงต่อไม้ (lot จริง) — ใช้ตรงๆ ให้ตรง animation
          const p = !isSmc && t.profit != null ? t.profit : t.r * riskAmt;
          runBal = +(runBal + p).toFixed(2);
          if (runBal > peakBal) peakBal = runBal;
          if (peakBal > 0) {
            const ddPct = +((peakBal - runBal) / peakBal * 100).toFixed(2);
            if (ddPct > maxDDPctFinal) maxDDPctFinal = ddPct;
          }
        });

        const winRate = data.total_trades ? ((data.wins / data.total_trades) * 100).toFixed(1) : '0.0';
        const maxDDPct = maxDDPctFinal.toFixed(1);
        const profitFactor = (() => {
          const gross_win  = data.trades.filter(t => t.r > 0).reduce((s, t) => s + t.r, 0);
          const gross_loss = Math.abs(data.trades.filter(t => t.r <= 0).reduce((s, t) => s + t.r, 0));
          return gross_loss > 0 ? (gross_win / gross_loss).toFixed(2) : '∞';
        })();
        const configStr = isSmc
          ? `RR=${rr} | TF=${zoneTf} | OB=${obEntry?'ON':'OFF'} | Eng=${engulfing?'ON':'OFF'} | Retest=${retest?'ON':'OFF'} | Trend=${trendFilter?'ON':'OFF'} | Spread=${spread} | Comm=${commission}${useRealTicks?' | Every Tick':''}`
          : `Engine=${meta.label} | Entry=${entryTf}${hasRR ? ` | RR=${rr}` : ''}${hasTrendFilter ? ` | Trend=${trendFilter?'ON':'OFF'}` : ''} | Spread=${spread}${hasRisk ? ` | Risk=${riskPct}%` : ''} | ${hasTicks ? 'Every Tick' : 'Bar Mode'}`;

        const exportHTML = async () => {
          setExporting(true);
          setExportMsg('');
          try {
            const res = await api.post('/api/backtest/export-report', {
              symbol: data.symbol,
              month: data.month,
              entry_tf: data.entry_tf,
              config_str: configStr,
              summary: {
                total_trades: data.total_trades,
                wins: data.wins,
                losses: data.losses,
                win_rate: winRate,
                total_r: data.total_r,
                expectancy_r: data.expectancy_r,
                profit_factor: profitFactor,
                max_dd_pct: maxDDPct,
                total_profit_usd: data.trades.reduce((s: number, t: any) => s + (t.profit ?? 0), 0).toFixed(2),
              },
              trades: data.trades,
              start_balance: bal0,
              risk_percent: riskPctNum,
            });
            setExportMsg(`บันทึกแล้ว: ${res.data.path}`);
          } catch (e: any) {
            setExportMsg(e?.response?.data?.detail ?? 'export ไม่สำเร็จ');
          } finally {
            setExporting(false);
          }
        };

        const netUsd = +(runBal - bal0).toFixed(2);
        const netPct = bal0 > 0 ? (netUsd / bal0) * 100 : 0;
        const win = netUsd >= 0;

        return (
        <div className="lux-card p-4 space-y-4 replay-rise">
          {/* หัวสรุป: ผลลัพธ์สุทธิเป็นพระเอก */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className={`ios-icon-tile w-10 h-10 shrink-0 border ${
              win ? 'bg-green-500/12 border-green-500/30 text-green-400'
                  : 'bg-red-500/12 border-red-500/30 text-red-400'}`}>
              <Trophy size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="lux-title">สรุปผล {data.month} · {data.entry_tf}</p>
              <p className={`text-2xl font-bold tabular-nums leading-tight ${win ? 'text-green-400' : 'text-red-400'}`}>
                {win ? '+' : '−'}${Math.abs(netUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-base font-semibold ml-2">
                  ({netPct >= 0 ? '+' : '−'}{Math.abs(netPct).toFixed(1)}%)
                </span>
              </p>
            </div>
            <span className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              win ? 'text-green-400 bg-green-500/10 border-green-500/30'
                  : 'text-red-400 bg-red-500/10 border-red-500/30'}`}>
              {win ? 'ทุนโต' : 'ทุนหด'} · ${bal0.toLocaleString()} → ${runBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
            {[
              { label: 'ไม้ทั้งหมด', value: `${data.total_trades}` },
              { label: 'Win Rate', value: `${winRate}%` },
              { label: 'Total R', value: `${data.total_r >= 0 ? '+' : ''}${data.total_r.toFixed(2)}R`, color: data.total_r >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'Profit Factor', value: profitFactor },
              { label: 'Max DD%', value: `-${maxDDPct}%`, color: maxDDPctFinal > 0 ? 'text-red-400' : 'text-ink' },
              { label: 'Expectancy', value: `${data.expectancy_r.toFixed(3)}R` },
            ].map((c, i) => (
              <div key={c.label} className="lux-inset p-3 replay-rise" style={{ animationDelay: `${80 + i * 55}ms` }}>
                <p className="lux-label mb-1">{c.label}</p>
                <p className={`font-semibold tabular-nums ${(c as any).color ?? 'text-ink'}`}>{c.value}</p>
              </div>
            ))}
          </div>
          {/* combo: แยกให้เห็นว่าไม้/กำไรมาจาก logic ไหน (ผลรวมด้านบนคือสองตัวรวมกันแล้ว) */}
          {isCombo && data.combo_summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {([
                { key: 'smc', label: 'SMC', color: '#0A84FF', d: data.combo_summary.smc },
                { key: 'sniper', label: 'SNIPER', color: '#30D158', d: data.combo_summary.sniper },
              ] as const).map(({ key, label, color, d }) => (
                <div key={key} className="lux-inset p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-xs font-bold" style={{ color }}>{label}</span>
                    {key === 'sniper' && (d as any).entry_timeframe && (
                      <span className="text-[10px] text-ink-faint">TF {(d as any).entry_timeframe}</span>
                    )}
                  </div>
                  {(d as any).error ? (
                    <p className="text-[11px] text-red-400">รันไม่สำเร็จ: {(d as any).error}</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
                      <span>ไม้ <span className="text-ink font-medium tabular-nums">{d.trades}</span></span>
                      <span>กำไร <span className={`font-medium tabular-nums ${d.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {d.profit >= 0 ? '+' : '−'}${Math.abs(d.profit).toFixed(2)}</span></span>
                      <span>R <span className={`font-medium tabular-nums ${d.total_r >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {d.total_r >= 0 ? '+' : ''}{d.total_r.toFixed(2)}</span></span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] text-ink-faint pt-1 leading-relaxed">{configStr}</div>
          {isCombo && (
            <p className="text-[11px] text-ink-faint">
              โหมด COMBO: ฟอร์มด้านบนคุม config ของ SMC — Sniper ใช้ค่าที่บันทึกไว้ของตัวเอง
              (แก้ได้ที่หน้า Strategy · ตั้งคนละ TF ได้) และ backtest นี้ให้ทั้งสอง logic เข้าไม้อิสระกัน
              เหมือน live จริงหลังแก้ให้กรอง magic แล้ว
            </p>
          )}
          {isSmc && ((data.poll_missed ?? 0) > 0 || (data.spread_blocked ?? 0) > 0) && (
            <p className="text-xs text-ink-muted">
              สัญญาณที่บอทจริงเข้าไม่ได้ (ตัดออกจากผลแล้ว):{' '}
              {(data.poll_missed ?? 0) > 0 && <>ราคาแวบเข้า-ออกเร็วกว่ารอบเช็ค 10 วิ <span className="text-ink font-medium">{data.poll_missed}</span> ครั้ง</>}
              {(data.poll_missed ?? 0) > 0 && (data.spread_blocked ?? 0) > 0 && ' · '}
              {(data.spread_blocked ?? 0) > 0 && <>สเปรดกว้างเกิน max_spread_points <span className="text-ink font-medium">{data.spread_blocked}</span> ครั้ง</>}
            </p>
          )}
          {eng === 'grid' && (data.bar_fallback_baskets ?? 0) > 0 && (
            <p className="text-xs text-amber-400">
              ⚠ {data.bar_fallback_baskets} ตะกร้าไม่มี tick history ช่วงนั้น — จำลองแบบ bar-mode แทน
              (tick จริง {data.tick_sim_baskets ?? 0} ตะกร้า)
            </p>
          )}

          {/* Export button */}
          <button
            onClick={exportHTML}
            disabled={exporting}
            className="w-full h-11 lux-btn-primary rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2 ios-pressable disabled:opacity-60">
            <Download size={16} />
            <span>{exporting ? 'กำลัง Export…' : 'Export Report (HTML)'}</span>
          </button>
          {exportMsg && (
            <p className={`text-xs text-center mt-1 break-all ${exportMsg.startsWith('บันทึก') ? 'text-green-400' : 'text-red-400'}`}>
              {exportMsg}
            </p>
          )}
        </div>
        );
      })()}
    </div>
  );
};

export default BacktestReplayView;
