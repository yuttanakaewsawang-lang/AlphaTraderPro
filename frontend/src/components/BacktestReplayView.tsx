import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  LineStyle,
} from 'lightweight-charts';
import { Play, Pause, RotateCcw, Download, X, RefreshCw, CheckCircle2 } from 'lucide-react';
import api from '../api';
import type { StrategyConfig } from '../types/strategy';

interface ReplayCandle { time: number; open: number; high: number; low: number; close: number; warmup?: boolean; }
interface ReplayTrade {
  time: number; exit_time: number; type: 'BUY' | 'SELL';
  entry: number; sl: number; tp: number; result: 'TP' | 'SL' | 'TRAIL';
  r: number; pattern?: string;
  zone_top?: number; zone_bottom?: number;
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
}

const MONTH_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('th-TH', { month: 'long', year: 'numeric' }),
    });
  }
  return opts;
})();

const SPEEDS = [
  { label: '0.5×', ms: 400 }, { label: '1×', ms: 200 }, { label: '2×', ms: 100 },
  { label: '5×', ms: 40 },   { label: '10×', ms: 20 },  { label: '20×', ms: 10 },
  { label: '50×', ms: 4 },
];

const TF_OPTIONS = ['M1', 'M5', 'M15', 'M30', 'H1'];

// สี candle ปกติ/warmup (แชร์ระหว่าง init chart กับ tick loop)
const CANDLE_COLORS = { upColor: '#30D158', downColor: '#FF453A', wickUpColor: '#30D158', wickDownColor: '#FF453A' };
const WARMUP_COLORS = { upColor: '#374151', downColor: '#374151', wickUpColor: '#374151', wickDownColor: '#374151' };
// สไตล์เส้นโซนก่อน retest (dashed dim) — ใช้ทั้งตอน init/reset/transition ให้สีไม่ค้างข้ามรอบ
const ZONE_DIM = {
  sbr: { lineStyle: LineStyle.Dashed, lineWidth: 1 as const, color: '#F8717160' },
  rbs: { lineStyle: LineStyle.Dashed, lineWidth: 1 as const, color: '#4ADE8060' },
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
};

const BacktestReplayView: React.FC<Props> = ({ symbol, engine = 'smc' }) => {
  const eng = ENGINE_META[engine] ? engine : 'smc';
  const isSmc = eng === 'smc';
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
  const [selectedMonths, setSelectedMonths] = useState<string[]>([MONTH_OPTIONS[0].value]);
  const toggleMonth = (m: string) => setSelectedMonths((prev) =>
    prev.includes(m) ? (prev.length > 1 ? prev.filter((x) => x !== m) : prev) : [...prev, m].sort()
  );
  // Every Tick (real tick fill/cost) เปิดตายตัวเสมอ — ให้ผลแม่นสุด ไม่มีเหตุผลให้ปิด จึงตัด toggle ออก
  const useRealTicks = true;
  // defaults ตรง RECOMMENDED live config — จะถูกทับด้วยค่าจริงจาก DB ตอนโหลด (กันกรณี API ล้มแล้วค่าเพี้ยน)
  const [rr, setRr] = useState('3.5');
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
  const [showZoneOverlay, setShowZoneOverlay] = useState(true);
  const [showObOverlay, setShowObOverlay] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);

  // ── replay state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cacheMonths, setCacheMonths] = useState<CacheMonth[]>([]);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [done, setDone] = useState(false);
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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorRef = useRef(0);
  const dataRef = useRef<ReplayData | null>(null);
  const openTradeRef = useRef<ReplayTrade | null>(null);
  // precomputed: candle index → trades that ENTER / EXIT at that candle
  // (สร้างครั้งเดียวตอนโหลดข้อมูล — reset replay ไม่ล้าง เพราะ derive จาก data ไม่ใช่ playback state)
  const entryMapRef = useRef<Map<number, ReplayTrade[]>>(new Map());
  const exitMapRef = useRef<Map<number, ReplayTrade[]>>(new Map());
  // zone state ต่อแท่ง keyed ด้วย timestamp (ไม่ใช่ index — index เพี้ยนตอน multi-month + warmup dedup)
  const zoneMapRef = useRef<Map<number, ZoneState>>(new Map());
  // annotation state (accumulated markers + active price lines)
  const seriesMarkersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const markersRef = useRef<SeriesMarker<Time>[]>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  // zone overlay series: SBR (red) top/bot, RBS (green) top/bot
  const sbrTopRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const sbrBotRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const rbsTopRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const rbsBotRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const zoneRetestRef = useRef(false);
  // OB overlay series: bullish OB (amber top/bot), bearish OB (orange top/bot)
  const obBullTopRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const obBullBotRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const obBearTopRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const obBearBotRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  // precomputed map: candle index → active OB state at that bar
  const obMapRef = useRef<Map<number, { top: number; bot: number; dir: 'bullish' | 'bearish' } | null>>(new Map());

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

  // ── init chart ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: '#0C0C0E' }, textColor: '#9CA3AF' },
      grid: { vertLines: { color: '#1A1A2E' }, horzLines: { color: '#1A1A2E' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151', timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, { ...CANDLE_COLORS, borderVisible: false });
    chartRef.current = chart;
    candleSeriesRef.current = series;
    seriesMarkersPluginRef.current = createSeriesMarkers(series, []);

    const zoneLineOpts = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    // SMC zone: เส้นขอบบน/ล่าง สีหรี่ (dim) ตอนยังไม่ retest → สว่างตอน retest
    sbrTopRef.current = chart.addSeries(LineSeries, { ...zoneLineOpts, ...ZONE_DIM.sbr });
    sbrBotRef.current = chart.addSeries(LineSeries, { ...zoneLineOpts, ...ZONE_DIM.sbr });
    rbsTopRef.current = chart.addSeries(LineSeries, { ...zoneLineOpts, ...ZONE_DIM.rbs });
    rbsBotRef.current = chart.addSeries(LineSeries, { ...zoneLineOpts, ...ZONE_DIM.rbs });
    // OB zones: subtle dotted — เล็กกว่า zone เพื่อไม่รกกราฟ
    const obOpts = { ...zoneLineOpts, lineWidth: 1 as const, lineStyle: LineStyle.Dotted };
    obBullTopRef.current = chart.addSeries(LineSeries, { ...obOpts, color: '#D97706' });
    obBullBotRef.current = chart.addSeries(LineSeries, { ...obOpts, color: '#D97706' });
    obBearTopRef.current = chart.addSeries(LineSeries, { ...obOpts, color: '#EA580C' });
    obBearBotRef.current = chart.addSeries(LineSeries, { ...obOpts, color: '#EA580C' });

    return () => { chart.remove(); };
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

    const months = [...selectedMonths].sort();
    // ส่งเฉพาะ override ที่ engine นั้นรองรับ — sniper/swing/reversal เป็น bar-mode เสมอ
    const commonParams: Record<string, string | number | boolean> = {
      symbol,
      engine: eng,
      // SMC ใช้ TF เดียว (zone_timeframe, ส่งในบล็อก isSmc ด้านล่าง) — entry_timeframe เป็น field
      // ของ Sniper/Swing/Reversal/Grid เท่านั้น (แต่ละ engine มี TF เดียวของตัวเองอยู่แล้ว)
      ...(isSmc ? {} : { entry_timeframe: entryTf }),
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
      let allCandles: ReplayCandle[] = [];
      let allTrades: ReplayTrade[] = [];
      let allZoneData: ZoneState[] = [];
      let allObZones: OBZone[] = [];
      let lastData: ReplayData | null = null;
      let monthStartMarkers: SeriesMarker<Time>[] = [];
      let sumTickSim = 0, sumBarFB = 0;   // grid tick-mode: รวมข้ามเดือน

      for (const m of months) {
        const res = await api.get<ReplayData>('/api/backtest/replay-data', {
          params: { ...commonParams, month: m },
          timeout: 180000,
        });
        if (!res.data.success) { setError(res.data.error || `โหลด ${m} ไม่สำเร็จ`); setLoading(false); return; }

        // merge candles (dedup by time)
        const existingTimes = new Set(allCandles.map((c) => c.time));
        res.data.candles.forEach((c) => { if (!existingTimes.has(c.time)) allCandles.push(c); });
        allTrades.push(...res.data.trades);
        allZoneData.push(...(res.data.zone_data ?? []));
        allObZones.push(...(res.data.ob_zones ?? []));
        sumTickSim += res.data.tick_sim_baskets ?? 0;
        sumBarFB += res.data.bar_fallback_baskets ?? 0;
        lastData = res.data;

        if (showWarmup && res.data.month_start_ts) {
          monthStartMarkers.push({
            time: (res.data.month_start_ts) as Time,
            position: 'aboveBar', color: '#FF9F0A',
            shape: 'arrowDown', text: `▶ ${m}`, size: 2,
          });
        }
      }

      if (!lastData) { setError('ไม่มีข้อมูล'); setLoading(false); return; }

      allCandles.sort((a, b) => a.time - b.time);
      allTrades.sort((a, b) => a.time - b.time);

      // รวม stats จากไม้ทั้งหมด
      const combinedWins = allTrades.filter((t) => t.r > 0).length;
      const combinedLosses = allTrades.filter((t) => t.r <= 0).length;
      const combinedTotalR = allTrades.reduce((s, t) => s + t.r, 0);
      const combinedTotal = allTrades.length;

      const combined: ReplayData = {
        ...lastData,
        month: months.length > 1 ? `${months[0]} → ${months[months.length - 1]}` : months[0],
        candles: allCandles,
        trades: allTrades,
        zone_data: allZoneData,
        ob_zones: allObZones,
        total_trades: combinedTotal,
        wins: combinedWins,
        losses: combinedLosses,
        total_r: Math.round(combinedTotalR * 100) / 100,
        expectancy_r: combinedTotal ? Math.round((combinedTotalR / combinedTotal) * 1000) / 1000 : 0,
        tick_sim_baskets: sumTickSim,
        bar_fallback_baskets: sumBarFB,
      };

      setReplayData(combined);
      dataRef.current = combined;

      // precompute entry/exit maps
      const candles = combined.candles;
      const eMap = new Map<number, ReplayTrade[]>();
      const xMap = new Map<number, ReplayTrade[]>();
      combined.trades.forEach((t) => {
        const ei = candles.findIndex((c) => c.time >= t.time);
        if (ei >= 0) eMap.set(ei, [...(eMap.get(ei) ?? []), t]);
        // tick-mode sim ปิดไม้ได้ถึง 14 วันหลัง entry — อาจเลยแท่งสุดท้ายของเดือน
        // ถ้าเลยช่วง chart ให้ปิดที่แท่งสุดท้ายแทน ไม่งั้นไม้ค้าง (W/L ไม่ครบ + banner ค้าง)
        const xi = candles.findIndex((c) => c.time >= t.exit_time);
        const xIdx = xi >= 0 ? xi : candles.length - 1;
        xMap.set(xIdx, [...(xMap.get(xIdx) ?? []), t]);
      });
      entryMapRef.current = eMap;
      exitMapRef.current = xMap;

      // zone state keyed ด้วย timestamp — ทนต่อ candle dedup ตอน multi-month + warmup
      const zMap = new Map<number, ZoneState>();
      allZoneData.forEach((z) => zMap.set(z.t, z));
      zoneMapRef.current = zMap;

      // precompute OB map
      const obMap = new Map<number, { top: number; bot: number; dir: 'bullish' | 'bearish' } | null>();
      (combined.ob_zones ?? []).forEach((ob) => {
        const si = candles.findIndex((c) => c.time >= ob.s);
        const ei = candles.findIndex((c) => c.time >= ob.e);
        if (si < 0) return;
        const end = ei >= 0 ? ei : candles.length - 1;
        for (let k = si; k <= end; k++) obMap.set(k, { top: ob.top, bot: ob.bot, dir: ob.dir });
        if (end + 1 < candles.length && !obMap.has(end + 1)) obMap.set(end + 1, null);
      });
      obMapRef.current = obMap;

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

  // ── toggle zone/OB overlay visibility ────────────────────────────────────
  useEffect(() => {
    const v = showZoneOverlay;
    sbrTopRef.current?.applyOptions({ visible: v });
    sbrBotRef.current?.applyOptions({ visible: v });
    rbsTopRef.current?.applyOptions({ visible: v });
    rbsBotRef.current?.applyOptions({ visible: v });
  }, [showZoneOverlay]);

  useEffect(() => {
    const v = showObOverlay;
    obBullTopRef.current?.applyOptions({ visible: v });
    obBullBotRef.current?.applyOptions({ visible: v });
    obBearTopRef.current?.applyOptions({ visible: v });
    obBearBotRef.current?.applyOptions({ visible: v });
  }, [showObOverlay]);

  // ── replay engine ─────────────────────────────────────────────────────────
  const clearAnnotations = useCallback(() => {
    priceLinesRef.current.forEach((pl) => {
      try { candleSeriesRef.current?.removePriceLine(pl); } catch { /* already removed */ }
    });
    priceLinesRef.current = [];
    markersRef.current = [];
    seriesMarkersPluginRef.current?.setMarkers([]);
    sbrTopRef.current?.setData([]);
    sbrBotRef.current?.setData([]);
    rbsTopRef.current?.setData([]);
    rbsBotRef.current?.setData([]);
    zoneRetestRef.current = false;
    // reset zone line styles กลับ dashed dim — รวมสีด้วย ไม่งั้นสีสว่าง (retest) จากรอบก่อนค้างมารอบใหม่
    sbrTopRef.current?.applyOptions(ZONE_DIM.sbr);
    sbrBotRef.current?.applyOptions(ZONE_DIM.sbr);
    rbsTopRef.current?.applyOptions(ZONE_DIM.rbs);
    rbsBotRef.current?.applyOptions(ZONE_DIM.rbs);
    // clear OB overlay
    obBullTopRef.current?.setData([]);
    obBullBotRef.current?.setData([]);
    obBearTopRef.current?.setData([]);
    obBearBotRef.current?.setData([]);
    // คืนสี candle ปกติ (เผื่อหยุดค้างช่วง warmup สีเทา)
    candleSeriesRef.current?.applyOptions(CANDLE_COLORS);
  }, []);

  const resetStats = useCallback(() => {
    setCursor(0); cursorRef.current = 0;
    setStatR(0); setStatWins(0); setStatLosses(0); setStatMaxDDPct(0);
    setStatProfitUsd(0);
    peakRRef.current = 0; peakBalanceRef.current = 0; runningBalanceRef.current = 0; maxDDPctRef.current = 0;
    setOpenTrade(null); openTradeRef.current = null;
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
    const series = candleSeriesRef.current;
    let markersChanged = false;

    entryMapRef.current.get(idx)?.forEach((t) => {
      setOpenTrade(t); openTradeRef.current = t;

      // entry arrow marker
      markersRef.current.push({
        time: c.time as Time,
        position: t.type === 'BUY' ? 'belowBar' : 'aboveBar',
        color: t.type === 'BUY' ? '#30D158' : '#FF453A',
        shape: t.type === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: `${t.type} ${t.entry.toFixed(2)}`,
        size: 2,
      });
      markersChanged = true;

      if (series) {
        // SL line (red dashed)
        priceLinesRef.current.push(series.createPriceLine({
          price: t.sl, color: '#FF453A', lineWidth: 1,
          lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'SL',
        }));
        // TP line (green dashed)
        priceLinesRef.current.push(series.createPriceLine({
          price: t.tp, color: '#30D158', lineWidth: 1,
          lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'TP',
        }));
        // Entry level (white dotted)
        priceLinesRef.current.push(series.createPriceLine({
          price: t.entry, color: '#E5E7EB', lineWidth: 1,
          lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '',
        }));
        // zone_top/zone_bottom ไม่ต้องวาดซ้ำ — zone overlay แสดงอยู่แล้ว
      }
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

      // exit marker (circle)
      markersRef.current.push({
        time: c.time as Time,
        position: t.type === 'BUY' ? 'aboveBar' : 'belowBar',
        color: t.r > 0 ? '#30D158' : '#FF453A',
        shape: 'circle',
        text: `${t.result} ${t.r > 0 ? '+' : ''}${t.r.toFixed(2)}R`,
        size: 1,
      });
      markersChanged = true;

      // remove all active price lines on exit
      priceLinesRef.current.forEach((pl) => {
        try { series?.removePriceLine(pl); } catch { /* ok */ }
      });
      priceLinesRef.current = [];
    });

    if (markersChanged) seriesMarkersPluginRef.current?.setMarkers(markersRef.current);

    // ── zone overlay ─────────────────────────────────────────────────────────
    // State 1 – broken, รอ retest  : dashed ──── dim color
    // State 2 – retested, พร้อมเข้า : solid ════ bright color
    // State 3 – used / expired      : ไม่มีเส้น (whitespace)
    const zs = zoneMapRef.current.get(c.time);
    if (zs) {
      const t = c.time as Time;
      const active = zs.h !== null && zs.h > 0;

      if (active && zs.tp === 0) {
        sbrTopRef.current?.update({ time: t, value: zs.h! });
        sbrBotRef.current?.update({ time: t, value: zs.b! });
        rbsTopRef.current?.update({ time: t });
        rbsBotRef.current?.update({ time: t });
      } else if (active && zs.tp === 1) {
        rbsTopRef.current?.update({ time: t, value: zs.h! });
        rbsBotRef.current?.update({ time: t, value: zs.b! });
        sbrTopRef.current?.update({ time: t });
        sbrBotRef.current?.update({ time: t });
      } else {
        // zone หาย (used หรือ expired) → reset style กลับ dashed dim พร้อม zone ใหม่
        sbrTopRef.current?.update({ time: t });
        sbrBotRef.current?.update({ time: t });
        rbsTopRef.current?.update({ time: t });
        rbsBotRef.current?.update({ time: t });
        if (zoneRetestRef.current) {
          zoneRetestRef.current = false;
          sbrTopRef.current?.applyOptions(ZONE_DIM.sbr);
          sbrBotRef.current?.applyOptions(ZONE_DIM.sbr);
          rbsTopRef.current?.applyOptions(ZONE_DIM.rbs);
          rbsBotRef.current?.applyOptions(ZONE_DIM.rbs);
        }
      }

      // State 1 → 2: zone ถูก retest → เปลี่ยนเป็น solid สีสว่าง (ทำครั้งเดียวต่อ zone)
      if (active && zs.rt && !zoneRetestRef.current) {
        zoneRetestRef.current = true;
        if (zs.tp === 0) {
          sbrTopRef.current?.applyOptions({ lineStyle: LineStyle.Solid, lineWidth: 2 as const, color: '#EF4444' });
          sbrBotRef.current?.applyOptions({ lineStyle: LineStyle.Solid, lineWidth: 2 as const, color: '#EF4444' });
        } else {
          rbsTopRef.current?.applyOptions({ lineStyle: LineStyle.Solid, lineWidth: 2 as const, color: '#22C55E' });
          rbsBotRef.current?.applyOptions({ lineStyle: LineStyle.Solid, lineWidth: 2 as const, color: '#22C55E' });
        }
      }

      // State 2 → 1: zone ใหม่เกิด (rt reset → false) → กลับ dashed dim
      if (active && !zs.rt && zoneRetestRef.current) {
        zoneRetestRef.current = false;
        sbrTopRef.current?.applyOptions(ZONE_DIM.sbr);
        sbrBotRef.current?.applyOptions(ZONE_DIM.sbr);
        rbsTopRef.current?.applyOptions(ZONE_DIM.rbs);
        rbsBotRef.current?.applyOptions(ZONE_DIM.rbs);
      }
    }

    // ── OB overlay ───────────────────────────────────────────────────────────
    {
      const tob = c.time as Time;
      const ob = obMapRef.current.get(idx) ?? null;
      if (ob) {
        if (ob.dir === 'bullish') {
          obBullTopRef.current?.update({ time: tob, value: ob.top });
          obBullBotRef.current?.update({ time: tob, value: ob.bot });
          obBearTopRef.current?.update({ time: tob, value: NaN });
          obBearBotRef.current?.update({ time: tob, value: NaN });
        } else {
          obBearTopRef.current?.update({ time: tob, value: ob.top });
          obBearBotRef.current?.update({ time: tob, value: ob.bot });
          obBullTopRef.current?.update({ time: tob, value: NaN });
          obBullBotRef.current?.update({ time: tob, value: NaN });
        }
      } else {
        obBullTopRef.current?.update({ time: tob, value: NaN });
        obBullBotRef.current?.update({ time: tob, value: NaN });
        obBearTopRef.current?.update({ time: tob, value: NaN });
        obBearBotRef.current?.update({ time: tob, value: NaN });
      }
    }

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

  const stopReplay = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setPlaying(false);
  }, []);

  const startReplay = useCallback(() => {
    if (!dataRef.current) return;
    if (cursorRef.current >= (dataRef.current.candles.length)) resetStats();
    intervalRef.current = setInterval(tick, SPEEDS[speedIdx].ms);
    setPlaying(true);
  }, [tick, speedIdx, resetStats]);

  const togglePlay = () => { if (playing) stopReplay(); else startReplay(); };

  // ปรับ speed ขณะเล่น
  useEffect(() => {
    if (playing) { stopReplay(); startReplay(); }
  }, [speedIdx]); // eslint-disable-line

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
      <div className="flex items-center gap-3">
        <h1 className="lux-h1">Backtest Replay</h1>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold"
          style={{ color: meta.color, background: `${meta.color}1f`, border: `1px solid ${meta.color}4d` }}>
          {meta.label}
        </span>
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

      {/* ── Strategy Setup (ตาม engine ที่เลือก) ─────────────────────────── */}
      <div className="lux-card p-4 space-y-3">
        <div className="flex items-baseline gap-2">
          <p className="lux-title">{meta.title}</p>
          {configLoaded && <span className="text-[10px] text-ink-faint">
            {isSmc
              ? 'โหลดจาก live config แล้ว — ค่าอื่นๆ (Zone Guard, Liquidity Sweep ฯลฯ) ใช้ตาม Strategy config อัตโนมัติ'
              : `โหลดจาก config ของ ${meta.label} แล้ว — ค่าอื่นๆ ใช้ตาม config ที่เซฟไว้ในหน้า Strategy อัตโนมัติ`}
          </span>}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3 items-end">
          {/* Month */}
          <div className="flex flex-col gap-1">
            <span className="lux-label">เดือน {selectedMonths.length > 1 && <span className="text-[var(--accent-blue)]">({selectedMonths.length} เดือน)</span>}</span>
            <select value={selectedMonths.length === 1 ? selectedMonths[0] : ''}
              onChange={(e) => setSelectedMonths([e.target.value])}
              className="lux-input px-3 h-9 text-sm">
              {selectedMonths.length > 1 && <option value="">— หลายเดือน —</option>}
              {MONTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {selectedMonths.length > 1 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedMonths.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[#0A84FF]/10 text-[var(--accent-blue)] border border-[#0A84FF]/30">
                    {m}
                    <button onClick={() => toggleMonth(m)} className="hover:text-red-400 leading-none"><X size={10} /></button>
                  </span>
                ))}
              </div>
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

          {/* Entry TF — Sniper/Swing/Reversal/Grid เท่านั้น (แต่ละ engine มี TF เดียวของตัวเอง) */}
          {!isSmc && (
            <div className="flex flex-col gap-1">
              <span className="lux-label">Entry TF</span>
              <select value={entryTf} onChange={(e) => setEntryTf(e.target.value)}
                className="lux-input px-3 h-9 text-sm">
                {TF_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {/* Timeframe — SMC เท่านั้น (TF เดียวใช้ทั้ง zone+entry, entry_timeframe รวมเข้ามาแล้ว) */}
          {isSmc && (
            <div className="flex flex-col gap-1">
              <span className="lux-label">Timeframe</span>
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
        </div>

        <div className="flex flex-wrap gap-3 mt-1 items-start">
          <button onClick={fetchData} disabled={loading}
            className="h-10 px-6 lux-btn-primary text-sm ios-pressable">
            {loading ? 'กำลังโหลด — รัน backtest อยู่…' : 'โหลดข้อมูล & เริ่ม Replay'}
          </button>
        </div>

        {/* ── Month multi-select grid (engine อื่นที่ไม่มี Zone Cache grid ของ SMC) ──
            ให้เลือกหลายเดือนย้อนหลัง 12 เดือนต่อกันได้แบบเดียวกับ SMC */}
        {!isSmc && (
          <div className="pt-1">
            <p className="lux-label mb-1">เลือกเดือนย้อนหลัง</p>
            <p className="text-[10px] text-ink-faint mb-1">คลิกเพื่อเลือก/ยกเลิกเดือน (เลือกได้หลายเดือน — replay ต่อกันตามลำดับ)</p>
            <div className="grid grid-cols-6 gap-1.5">
              {[...MONTH_OPTIONS].reverse().map((o) => {
                const isSelected = selectedMonths.includes(o.value);
                return (
                  <button
                    key={o.value}
                    onClick={() => toggleMonth(o.value)}
                    title={o.label}
                    className={`relative rounded-md px-1.5 py-2 text-center transition-all border ios-pressable ${
                      isSelected
                        ? 'border-[var(--accent-blue)] ring-1 ring-[var(--accent-blue)]/40 bg-white/[0.06]'
                        : 'border-[var(--hairline)] hover:border-white/20 bg-white/[0.03]'
                    }`}>
                    <span className="text-[11px] font-medium block">{o.value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Zone Cache Status grid ──────────────────────────────────────── */}
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
            <p className="text-[10px] text-ink-faint mb-1">คลิกเพื่อเลือก/ยกเลิกเดือน (เลือกได้หลายเดือน)</p>
            <div className="grid grid-cols-6 gap-1.5">
              {[...cacheMonths].reverse().map((m) => {
                const isActive = m.status === 'active';
                const isSaved  = m.status === 'saved';
                const isSelected = selectedMonths.includes(m.month);
                const zoneLabel = m.zone_type === 0 ? 'SBR' : m.zone_type === 1 ? 'RBS' : null;
                return (
                  <button
                    key={m.month}
                    onClick={() => toggleMonth(m.month)}
                    title={
                      isActive ? `Active zone${zoneLabel ? ` (${zoneLabel})` : ''} · ${m.high?.toFixed(2)} / ${m.low?.toFixed(2)}` :
                      isSaved  ? `Saved${zoneLabel ? ` (${zoneLabel})` : ''}` : 'ไม่มี cache'
                    }
                    className={`relative rounded-md px-1.5 py-2 text-center transition-all border ios-pressable ${
                      isSelected
                        ? 'border-[var(--accent-blue)] ring-1 ring-[var(--accent-blue)]/40'
                        : 'border-[var(--hairline)] hover:border-white/20'
                    } ${
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
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {error && <div className="lux-card p-3 text-red-400 text-sm">{error}</div>}

      {/* ── Playback controls ─────────────────────────────────────────────── */}
      {data && (
        <div className="lux-card p-3 flex flex-wrap items-center gap-3">
          {/* Play/Pause */}
          <button onClick={togglePlay}
            className={`h-10 w-10 flex items-center justify-center rounded-xl transition-colors ios-pressable ${
              playing ? 'bg-yellow-500/20 text-yellow-400' : 'lux-btn-primary'}`}>
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>

          {/* Reset */}
          <button onClick={() => { stopReplay(); resetStats(); }}
            className="h-10 w-10 flex items-center justify-center lux-btn-ghost rounded-xl ios-pressable" title="รีเซ็ต">
            <RotateCcw size={16} />
          </button>

          {/* Speed — iOS segmented control */}
          <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
            {SPEEDS.map((s, i) => (
              <button key={s.label} onClick={() => setSpeedIdx(i)}
                className={`h-7 px-2.5 text-xs rounded-md transition-colors ios-pressable ${
                  i === speedIdx ? 'bg-[var(--accent-blue)] text-white font-medium' : 'text-ink-muted hover:text-ink'
                }`}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Zone / OB overlay toggles — overlay เหล่านี้มีเฉพาะ SMC backtest */}
          {isSmc && (
          <div className="flex gap-1 ml-auto">
            <button
              onClick={() => setShowZoneOverlay((v) => !v)}
              title="ปิด/เปิด SMC Zone overlay (เส้นแดง/เขียว)"
              className={`h-8 px-2.5 text-xs rounded-md border transition-colors ios-pressable ${
                showZoneOverlay
                  ? 'border-rose-500/60 text-rose-400 bg-rose-500/10'
                  : 'border-[var(--hairline)] text-ink-faint'
              }`}>
              Zone
            </button>
            <button
              onClick={() => setShowObOverlay((v) => !v)}
              title="ปิด/เปิด OB overlay (เส้นอำพัน/ส้ม)"
              className={`h-8 px-2.5 text-xs rounded-md border transition-colors ios-pressable ${
                showObOverlay
                  ? 'border-amber-500/60 text-amber-400 bg-amber-500/10'
                  : 'border-[var(--hairline)] text-ink-faint'
              }`}>
              OB
            </button>
          </div>
          )}

          {/* Progress */}
          <div className="flex-1 flex items-center gap-2 min-w-[160px]">
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#0A84FF] to-[#40C8E0]"
                style={{ width: `${pct}%` }} />
            </div>
            <span className="text-ink-faint text-xs tabular-nums">{pct}%</span>
            {done && (
              <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
                <CheckCircle2 size={12} /> เสร็จ
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Live stats ────────────────────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {[
            { label: 'แท่ง', value: `${cursor}/${total}` },
            { label: 'ไม้ (ปิดแล้ว/ทั้งหมด)', value: `${totalTrades}/${data.total_trades}` },
            { label: 'W/L', value: `${statWins}/${statLosses}` },
            { label: 'Win%', value: totalTrades ? `${winPct}%` : '—' },
            { label: 'R สะสม', value: statR !== 0 ? `${statR >= 0 ? '+' : ''}${statR.toFixed(2)}` : '0.00', color: statR >= 0 ? 'text-green-400' : 'text-red-400' },
            (() => {
              const bal0n = (dataRef.current?.start_balance || Number(startBalance) || 200);
              const curBal = bal0n + statProfitUsd;
              return {
                label: `Balance (เริ่ม $${bal0n.toLocaleString()})`,
                value: `$${curBal.toFixed(2)}`,
                color: curBal >= bal0n ? 'text-green-400' : 'text-red-400',
              };
            })(),
            (() => {
              const bal0n = (dataRef.current?.start_balance || Number(startBalance) || 200);
              const pctPnl = bal0n > 0 ? (statProfitUsd / bal0n) * 100 : 0;
              return {
                label: 'กำไร/ขาดทุน (USD · %)',
                value: statProfitUsd !== 0
                  ? `${statProfitUsd >= 0 ? '+' : ''}$${statProfitUsd.toFixed(2)} (${pctPnl >= 0 ? '+' : ''}${pctPnl.toFixed(1)}%)`
                  : '$0.00 (0.0%)',
                color: statProfitUsd >= 0 ? 'text-green-400' : 'text-red-400',
              };
            })(),
            {
              label: 'Max DD%',
              value: statMaxDDPct > 0 ? `-${statMaxDDPct.toFixed(1)}%` : '0.0%',
              color: statMaxDDPct > 0 ? 'text-red-400' : 'text-ink',
            },
          ].map((c) => (
            <div key={c.label} className="lux-card p-2.5">
              <p className="lux-label text-[10px] mb-0.5 leading-tight">{c.label}</p>
              <p className={`font-semibold tabular-nums text-xs ${(c as any).color ?? 'text-ink'}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Open trade banner ─────────────────────────────────────────────── */}
      {openTrade && (
        <div className={`lux-card p-2.5 flex items-center gap-4 border ${
          openTrade.type === 'BUY' ? 'border-green-500/40 bg-green-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
          <span className={`text-sm font-bold ${openTrade.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
            {openTrade.type}{openTrade.pattern ? ` [${openTrade.pattern}]` : ''}{openTrade.legs != null ? ` (${openTrade.legs} ชั้น)` : ''}
          </span>
          <span className="text-ink-muted text-xs">Entry <span className="text-ink tabular-nums">{openTrade.entry}</span></span>
          <span className="text-ink-muted text-xs">SL <span className="text-red-400 tabular-nums">{openTrade.sl}</span></span>
          <span className="text-ink-muted text-xs">TP <span className="text-green-400 tabular-nums">{openTrade.tp}</span></span>
        </div>
      )}

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <div className="lux-card overflow-hidden relative" style={{ minHeight: 480 }}>
        <div ref={chartContainerRef} style={{ height: 480 }} />
        {!data && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-ink-muted text-sm bg-[#0C0C0E]/90">
            ตั้งค่าด้านบนแล้วกด "โหลดข้อมูล & เริ่ม Replay"
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0C0C0E]/90">
            <div className="text-center space-y-2">
              <div className="w-6 h-6 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-ink-muted text-sm">กำลังรัน backtest {selectedMonths.length > 1 ? `(${selectedMonths.length} เดือน)` : ''} — รอสักครู่…</p>
            </div>
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

        return (
        <div className="lux-card p-4 space-y-3">
          <p className="lux-title">สรุปผล {data.month} — {data.entry_tf}</p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: 'ไม้ทั้งหมด', value: `${data.total_trades}` },
              { label: 'Win Rate', value: `${winRate}%` },
              { label: 'Total R', value: `${data.total_r >= 0 ? '+' : ''}${data.total_r.toFixed(2)}R`, color: data.total_r >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'Profit Factor', value: profitFactor },
              { label: 'Max DD%', value: `-${maxDDPct}%`, color: maxDDPctFinal > 0 ? 'text-red-400' : 'text-ink' },
              { label: 'Expectancy', value: `${data.expectancy_r.toFixed(3)}R` },
            ].map((c) => (
              <div key={c.label} className="lux-card p-3">
                <p className="lux-label mb-1">{c.label}</p>
                <p className={`font-semibold tabular-nums ${(c as any).color ?? 'text-ink'}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="text-xs text-ink-faint pt-1">{configStr}</div>
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
