import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import SMCChart, { type EntryMarker, type PriceLevel } from './SMCChart';
import type {
  ActiveZone, EntryPreview, ZoneResponse, StrategyConfig, SniperStatusResponse,
  SwingStatusResponse, ReversalStatusResponse, GridStatusResponse,
} from '../types/strategy';

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1'];

// สร้าง STEPS แบบ dynamic ตาม config จริง (SMC)
function buildSteps(cfg: StrategyConfig | null) {
  const reqRetest = cfg ? !!cfg.require_retest : true;
  const reqEng = cfg ? !!cfg.require_engulfing : true;
  const hasOB = cfg ? !!cfg.enable_ob_entry : false;

  const steps = [
    { label: 'หาโซน SMC', desc: 'สแกนหา swing + สร้างโซน SBR/RBS' },
    { label: 'รอราคาเบรกโซน', desc: 'รอแท่งปิดทะลุโซน' },
  ];
  if (reqRetest) {
    steps.push({ label: 'รอ retest', desc: 'รอราคากลับมาแตะโซนเดิม' });
  }
  const entryDesc = [
    hasOB ? 'OB/FVG หรือ Zone entry' : 'Zone entry',
    reqEng ? '+ รอ Engulfing ยืนยัน' : '',
  ].filter(Boolean).join(' ');
  steps.push({ label: reqRetest ? 'รอแท่งยืนยัน → เข้า' : 'รอสัญญาณ → เข้า', desc: entryDesc || 'รอสัญญาณเข้าออเดอร์' });
  return steps;
}

// STEPS ของ Sniper — N-bar breakout ไม่มี zone/retest/engulfing
function buildSniperSteps(lookback: number | null, trendOn: boolean) {
  return [
    { label: 'สแกนกรอบราคา', desc: `หา High/Low จาก ${lookback ?? 'N'} แท่งล่าสุด` },
    {
      label: 'รอแท่งปิดทะลุกรอบ',
      desc: `BUY ปิดเหนือขอบบน / SELL ปิดใต้ขอบล่าง${trendOn ? ' (ไม่สวนเทรนด์ H1)' : ''}`,
    },
    { label: 'เข้าออเดอร์ + SL/TP', desc: 'TP = measured move (ความสูงกรอบ) · SL หลังแท่งสัญญาณ' },
  ];
}

// STEPS ของ engine ใหม่ 3 ตัว — ชุดละ 3 ขั้นตามขั้นตอนจริงใน execute_logic ของแต่ละ class
const ENGINE_STEPS: Record<string, { label: string; desc: string }[]> = {
  swing: [
    { label: 'เทรนด์ TF ใหญ่ชัด', desc: 'HH/HL (หรือ EMA50) บน TF คู่ที่สูงขึ้น' },
    { label: 'รอราคาย่อแตะ EMA', desc: 'pullback มาแตะ EMA20 บน entry TF' },
    { label: 'แท่งยืนยัน → เข้า + SL/TP', desc: 'แท่งปิดกลับทิศเทรนด์ · SL หลัง swing · TP แบบ RR' },
  ],
  reversal: [
    { label: 'ราคาแตะจุดสุดขั้ว', desc: 'ทำ low/high ใหม่ในรอบ N แท่ง (pivot)' },
    { label: 'RSI สุดขั้ว + แท่งกลับตัว', desc: 'RSI ≤30/≥70 + แท่งยืนยัน (ไม่สวนเทรนด์ TF ใหญ่)' },
    { label: 'เข้าออเดอร์ + SL/TP', desc: 'SL เลยปลาย extreme · TP แบบ RR' },
  ],
  grid: [
    { label: 'ทิศทางจาก EMA50', desc: 'เปิดตะกร้าตามฝั่งของราคาเทียบ EMA50' },
    { label: 'ตะกร้า + เติมชั้นถัว', desc: 'ราคาวิ่งสวนถึงระยะ step → เติมไม้ lot × multiplier' },
    { label: 'Basket TP / Stop', desc: 'ปิดทั้งชุดที่ราคาเฉลี่ย±TP · ตัดขาดทุนเมื่อเกิน % พอร์ต' },
  ],
};

const ENGINE_BADGE: Record<string, { label: string; color: string }> = {
  sniper: { label: 'SNIPER', color: '#30D158' },
  swing: { label: 'SWING TRADE', color: '#40C8E0' },
  reversal: { label: 'REVERSAL', color: '#FF9F0A' },
  grid: { label: 'GRID MARTINGALE', color: '#BF5AF2' },
};

interface LiveChartViewProps {
  symbol: string;
  engine?: string; // 'smc' (default) | 'sniper' | 'swing' | 'reversal' | 'grid'
}

const LiveChartView: React.FC<LiveChartViewProps> = ({ symbol, engine = 'smc' }) => {
  const isSniper = engine === 'sniper';
  // engine ใหม่ 3 ตัว — poll /api/<engine>/status ชุดเดียวกัน (shape ต่างกันแค่ field เฉพาะกลยุทธ์)
  const isAltEngine = engine === 'swing' || engine === 'reversal' || engine === 'grid';
  const isSmc = !isSniper && !isAltEngine;
  const [zone, setZone] = useState<ActiveZone | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastMessage, setLastMessage] = useState('');
  const [openPos, setOpenPos] = useState<EntryPreview | null>(null);
  const [markers, setMarkers] = useState<EntryMarker[]>([]);
  const [brokerOffset, setBrokerOffset] = useState(0);
  const [showOverlays, setShowOverlays] = useState(true);
  const [timeframe, setTimeframe] = useState('M5');
  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [sniperStatus, setSniperStatus] = useState<SniperStatusResponse | null>(null);
  const [altStatus, setAltStatus] = useState<SwingStatusResponse | ReversalStatusResponse | GridStatusResponse | null>(null);
  // ผู้ใช้กดเลือก TF เองแล้วหรือยัง — ถ้ายัง ให้ TF ตาม TF ที่กลยุทธ์ใช้จริงใน config ที่เซฟไว้
  const tfManualRef = useRef(false);

  // SMC: poll zone + config (แถบขั้นตอน/overlay โซนบนกราฟ)
  useEffect(() => {
    if (!isSmc) return;
    let cancelled = false;
    const fetchZone = async () => {
      try {
        const res = await api.get<ZoneResponse>('/api/strategy/zone', { params: { symbol } });
        if (cancelled) return;
        setZone(res.data.zone);
        setIsRunning(res.data.is_running);
        setLastMessage(res.data.last_message || '');
        if (res.data.config) {
          setConfig(res.data.config);
          const cfgTf = res.data.config.zone_timeframe;
          if (!tfManualRef.current && cfgTf && TIMEFRAMES.includes(cfgTf)) setTimeframe(cfgTf);
        }
        if (typeof (res.data as any).broker_offset === 'number') setBrokerOffset((res.data as any).broker_offset);
      } catch (err) {
        console.error('Failed to load zone', err);
      }
    };
    fetchZone();
    const interval = setInterval(fetchZone, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [symbol, isSmc]);

  // Sniper: poll สถานะ breakout (กรอบ N แท่ง + สัญญาณ) แทน zone
  useEffect(() => {
    if (!isSniper) return;
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await api.get<SniperStatusResponse>('/api/sniper/status', { params: { symbol } });
        if (cancelled) return;
        setSniperStatus(res.data);
        setIsRunning(res.data.is_running);
        setLastMessage(res.data.last_message || '');
        const tf = res.data.entry_timeframe;
        if (!tfManualRef.current && tf && TIMEFRAMES.includes(tf)) setTimeframe(tf);
        if (typeof (res.data as any).broker_offset === 'number') setBrokerOffset((res.data as any).broker_offset);
      } catch (err) {
        console.error('Failed to load sniper status', err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [symbol, isSniper]);

  // Swing/Reversal/Grid: poll /api/<engine>/status (shape ต่างกันแค่ field เฉพาะกลยุทธ์)
  useEffect(() => {
    if (!isAltEngine) return;
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await api.get(`/api/${engine}/status`, { params: { symbol } });
        if (cancelled) return;
        setAltStatus(res.data);
        setIsRunning(res.data.is_running);
        setLastMessage(res.data.last_message || '');
        const tf = res.data.entry_timeframe;
        if (!tfManualRef.current && tf && TIMEFRAMES.includes(tf)) setTimeframe(tf);
        if (typeof res.data.broker_offset === 'number') setBrokerOffset(res.data.broker_offset);
      } catch (err) {
        console.error(`Failed to load ${engine} status`, err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [symbol, engine, isAltEngine]);

  useEffect(() => {
    let cancelled = false;
    const fetchMarkers = async () => {
      try {
        const res = await api.get<EntryMarker[]>('/api/strategy/entry-markers', { params: { symbol } });
        if (!cancelled) setMarkers(res.data || []);
      } catch (err) {
        console.error('Failed to load entry markers', err);
      }
    };
    fetchMarkers();
    const interval = setInterval(fetchMarkers, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [symbol]);

  // ออเดอร์ที่เปิดอยู่จริง — ใช้วาดเส้น Entry/SL/TP + กล่อง RR (โชว์เฉพาะตอนมีไม้เปิด)
  useEffect(() => {
    let cancelled = false;
    const fetchPositions = async () => {
      try {
        const res = await api.get<any[]>('/api/positions', { params: { symbol } });
        if (cancelled) return;
        const p = (res.data || []).find((x) => x.sl > 0 || x.tp > 0) || (res.data || [])[0];
        setOpenPos(p ? { type: p.type, entry: p.price_open, sl: p.sl, tp: p.tp, profit: p.profit, volume: p.volume } : null);
      } catch (err) {
        console.error('Failed to load positions', err);
      }
    };
    fetchPositions();
    const interval = setInterval(fetchPositions, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [symbol]);

  const bo = isSniper ? sniperStatus?.breakout ?? null : null;
  const brokeUp = !!bo && bo.last_close > bo.range_high;
  const brokeDown = !!bo && bo.last_close < bo.range_low;
  const trendOn = isSniper && !!sniperStatus?.config?.use_trend_filter;

  // ข้อมูลเฉพาะของ engine ใหม่
  const swingSetup = engine === 'swing' ? (altStatus as SwingStatusResponse | null)?.setup ?? null : null;
  const revSetup = engine === 'reversal' ? (altStatus as ReversalStatusResponse | null)?.setup ?? null : null;
  const gridBasket = engine === 'grid' ? (altStatus as GridStatusResponse | null)?.basket ?? null : null;
  const revOversold = !!revSetup && revSetup.rsi <= revSetup.rsi_buy_level;
  const revOverbought = !!revSetup && revSetup.rsi >= revSetup.rsi_sell_level;

  const hasZone = isSmc && !!zone && (zone.zone_type === 0 || zone.zone_type === 1);
  const reqRetest = config ? !!config.require_retest : true;
  const STEPS = isSniper ? buildSniperSteps(bo?.lookback ?? null, trendOn)
    : isAltEngine ? ENGINE_STEPS[engine]
    : buildSteps(config);
  // มี setup ให้ไล่ขั้นตอนหรือยัง — SMC = มีโซน active, Sniper = คำนวณกรอบ breakout ได้แล้ว,
  // engine ใหม่ = status คืนข้อมูล setup/basket แล้ว
  const hasSetup = isSniper ? !!bo
    : engine === 'swing' ? !!swingSetup
    : engine === 'reversal' ? !!revSetup
    : engine === 'grid' ? !!gridBasket
    : hasZone;
  // step index: SMC ปรับตาม require_retest (ถ้า OFF ข้ามขั้น retest), engine อื่นมี 3 ขั้นตายตัว
  let step = 0;
  if (isSniper) {
    if (openPos) step = 2;
    else if (bo) step = 1;
  } else if (engine === 'swing') {
    if (openPos) step = 2;
    else if (swingSetup && (swingSetup.bias !== 0 || !(altStatus as SwingStatusResponse).config?.use_trend_filter)) step = 1;
  } else if (engine === 'reversal') {
    if (openPos) step = 2;
    else if (revOversold || revOverbought) step = 1;
  } else if (engine === 'grid') {
    if (gridBasket && gridBasket.levels > 0) step = 2;
    else if (isRunning) step = 1;
  } else if (hasZone) {
    if (!zone!.is_broken) step = 1;
    else if (!zone!.is_retested && reqRetest) step = 2;
    else step = reqRetest ? 3 : 2; // ถ้าไม่มี retest step, last step = index 2
  }

  const direction = isSniper
    ? (brokeUp ? 'BUY' : brokeDown ? 'SELL' : null)
    : engine === 'swing' ? (swingSetup?.bias === 1 ? 'BUY' : swingSetup?.bias === -1 ? 'SELL' : null)
    : engine === 'reversal' ? (revOversold ? 'BUY' : revOverbought ? 'SELL' : null)
    : engine === 'grid' ? (gridBasket?.direction ?? null)
    : (!hasZone ? null : zone!.zone_type === 1 ? 'BUY' : 'SELL');
  const dirColor = direction === 'BUY' ? 'text-green-400' : direction === 'SELL' ? 'text-red-400' : 'text-ink-faint';
  // เส้น retest = ขอบโซนที่ราคาต้องกลับมาแตะ (SMC เท่านั้น — โชว์เฉพาะตอนเบรกแล้วแต่ยังไม่ retest)
  const retestLevel = hasZone && zone!.is_broken && !zone!.is_retested
    ? (zone!.zone_type === 1 ? zone!.high_limit : zone!.low_limit)
    : null;
  // ขอบกรอบ breakout ของ Sniper บนกราฟ — memo ตามตัวเลขจริง กันสร้าง array ใหม่ทุก render
  // (effect วาดเส้นใน SMCChart depend ที่ reference ของ levels)
  const breakoutLevels = useMemo<PriceLevel[] | undefined>(() => {
    if (!bo) return undefined;
    return [
      { price: bo.range_high, color: '#30D158', title: `ขอบบน (${bo.lookback} แท่ง)` },
      { price: bo.range_low, color: '#FF453A', title: `ขอบล่าง (${bo.lookback} แท่ง)` },
    ];
  }, [bo?.range_high, bo?.range_low, bo?.lookback]);

  // เส้นระดับราคาของ engine ใหม่ — memo ตามตัวเลขจริงกัน re-create ทุก render (เหมือน breakoutLevels)
  const altLevels = useMemo<PriceLevel[] | undefined>(() => {
    if (engine === 'swing' && swingSetup) {
      return [{ price: swingSetup.ema, color: '#40C8E0', title: `EMA${swingSetup.pullback_ema}` }];
    }
    if (engine === 'reversal' && revSetup) {
      return [
        { price: revSetup.extreme_high, color: '#FF453A', title: `High สุดขั้ว (${revSetup.lookback} แท่ง)` },
        { price: revSetup.extreme_low, color: '#30D158', title: `Low สุดขั้ว (${revSetup.lookback} แท่ง)` },
      ];
    }
    if (engine === 'grid' && gridBasket && gridBasket.levels > 0) {
      const lv: PriceLevel[] = [];
      if (gridBasket.avg != null) lv.push({ price: gridBasket.avg, color: '#BF5AF2', title: 'ราคาเฉลี่ยตะกร้า' });
      if (gridBasket.tp != null) lv.push({ price: gridBasket.tp, color: '#30D158', title: 'Basket TP' });
      if (gridBasket.next_level != null && gridBasket.levels < gridBasket.max_levels)
        lv.push({ price: gridBasket.next_level, color: '#FF9F0A', title: 'ชั้นถัดไป' });
      return lv.length ? lv : undefined;
    }
    return undefined;
  }, [
    engine,
    swingSetup?.ema, swingSetup?.pullback_ema,
    revSetup?.extreme_high, revSetup?.extreme_low, revSetup?.lookback,
    gridBasket?.avg, gridBasket?.tp, gridBasket?.next_level, gridBasket?.levels, gridBasket?.max_levels,
  ]);
  const shiftHours = 7 - brokerOffset; // โบรกเกอร์ -> เวลาไทย (UTC+7)

  return (
    <div className="ios-fade-in flex flex-col gap-3 h-full">
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <h1 className="lux-h1">Live Chart — {symbol}</h1>
        {ENGINE_BADGE[engine] && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold"
            style={{
              color: ENGINE_BADGE[engine].color,
              background: `${ENGINE_BADGE[engine].color}1f`,
              border: `1px solid ${ENGINE_BADGE[engine].color}4d`,
            }}>
            {ENGINE_BADGE[engine].label}
          </span>
        )}
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
          isRunning ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-ink-muted'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-400 agent-pulse' : 'bg-ink-faint'}`} />
          {isRunning ? 'AUTO TRADE ทำงาน' : 'หยุดอยู่'}
        </span>
        <div className="flex-1" />
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => { tfManualRef.current = true; setTimeframe(tf); }}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                timeframe === tf ? 'lux-btn-primary' : 'lux-btn-ghost text-ink-muted'
              }`}
            >{tf}</button>
          ))}
        </div>
        {isSmc && (
          <label className="flex items-center gap-2 lux-label cursor-pointer select-none">
            <input type="checkbox" checked={showOverlays} onChange={(e) => setShowOverlays(e.target.checked)} className="w-4 h-4 accent-[#0A84FF]" />
            แสดง Order Block
          </label>
        )}
        <span className="lux-label">เวลาไทย</span>
      </div>

      {/* แถบ logic: ขั้นไหนกำลังรออยู่ */}
      <div className="lux-card p-4 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="lux-title">สถานะการรอเข้าออเดอร์</p>
          {isSniper && bo ? (
            <div className="flex items-center gap-3 text-sm">
              {direction && (
                <span>สัญญาณ: <span className={`font-bold ${dirColor}`}>{direction}</span> (ปิด{brokeUp ? 'เหนือขอบบน' : 'ใต้ขอบล่าง'})</span>
              )}
              <span className="text-ink-muted">กรอบ {bo.lookback} แท่ง: <span className="tabular-nums text-ink">{bo.range_low.toFixed(2)} – {bo.range_high.toFixed(2)}</span></span>
            </div>
          ) : engine === 'swing' && swingSetup ? (
            <div className="flex items-center gap-3 text-sm">
              {direction && <span>เทรนด์: <span className={`font-bold ${dirColor}`}>{direction === 'BUY' ? 'ขาขึ้น' : 'ขาลง'}</span></span>}
              <span className="text-ink-muted">EMA{swingSetup.pullback_ema}: <span className="tabular-nums text-ink">{swingSetup.ema.toFixed(2)}</span></span>
              {swingSetup.touched && <span className="text-emerald-400 font-semibold">ราคาแตะ EMA แล้ว</span>}
            </div>
          ) : engine === 'reversal' && revSetup ? (
            <div className="flex items-center gap-3 text-sm">
              <span>RSI: <span className={`font-bold tabular-nums ${revOversold ? 'text-green-400' : revOverbought ? 'text-red-400' : 'text-ink'}`}>{revSetup.rsi.toFixed(1)}</span></span>
              <span className="text-ink-muted">กรอบสุดขั้ว {revSetup.lookback} แท่ง: <span className="tabular-nums text-ink">{revSetup.extreme_low.toFixed(2)} – {revSetup.extreme_high.toFixed(2)}</span></span>
            </div>
          ) : engine === 'grid' && gridBasket && gridBasket.levels > 0 ? (
            <div className="flex items-center gap-3 text-sm">
              <span>ตะกร้า: <span className={`font-bold ${dirColor}`}>{gridBasket.direction}</span> {gridBasket.levels}/{gridBasket.max_levels} ชั้น</span>
              {gridBasket.tp != null && <span className="text-ink-muted">Basket TP: <span className="tabular-nums text-ink">{gridBasket.tp.toFixed(2)}</span></span>}
              <span className={`tabular-nums font-semibold ${gridBasket.floating >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {gridBasket.floating >= 0 ? '+' : ''}{gridBasket.floating.toFixed(2)}
              </span>
            </div>
          ) : hasZone ? (
            <div className="flex items-center gap-3 text-sm">
              <span>ทิศ: <span className={`font-bold ${dirColor}`}>{direction}</span> ({zone!.zone_type === 1 ? 'RBS' : 'SBR'})</span>
              <span className="text-ink-muted">โซนรอเข้า: <span className="tabular-nums text-ink">{zone!.low_limit} – {zone!.high_limit}</span></span>
            </div>
          ) : null}
        </div>
        <div className={`grid grid-cols-2 gap-2 ${STEPS.length <= 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
          {STEPS.map((s, i) => {
            const active = isRunning && hasSetup && i === step;
            const done = isRunning && hasSetup && i < step;
            const searching = isRunning && !hasSetup && i === 0;
            const on = active || searching;
            return (
              <div
                key={i}
                className={`rounded-lg border p-2.5 transition-colors ${
                  on ? 'bg-[var(--gold)]/12 border-[var(--gold)]/50'
                  : done ? 'bg-green-500/8 border-green-500/30'
                  : 'bg-[var(--color-surface-2)] border-[var(--hairline)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    on ? 'bg-[var(--gold)] text-black'
                    : done ? 'bg-green-500/70 text-white'
                    : 'bg-white/10 text-ink-faint'
                  }`}>{done ? '✓' : i + 1}</span>
                  <span className={`text-sm font-medium ${on ? 'text-ink' : done ? 'text-green-400' : 'text-ink-muted'}`}>
                    {s.label}
                    {on && <span className="ml-1 text-[var(--gold)]">●</span>}
                  </span>
                </div>
                <p className="text-[11px] text-ink-faint mt-1 leading-tight">{s.desc}</p>
              </div>
            );
          })}
        </div>
        {openPos ? (
          <div className="flex flex-wrap items-center gap-3 mt-3 text-sm tabular-nums">
            <span className={`font-semibold px-2.5 py-0.5 rounded-full text-xs ${openPos.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {openPos.type}
            </span>
            {openPos.volume != null && (
              <span className="text-ink-muted text-xs">{openPos.volume} lot</span>
            )}
            <span>Entry <span className="text-[#0A84FF] font-medium">{openPos.entry}</span></span>
            <span>SL <span className="text-red-400 font-medium">{openPos.sl}</span></span>
            <span>TP <span className="text-green-400 font-medium">{openPos.tp}</span></span>
            {openPos.profit != null && (
              <span className={`font-semibold ${openPos.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {openPos.profit >= 0 ? '+' : ''}{openPos.profit.toFixed(2)} USD
              </span>
            )}
          </div>
        ) : (
          <div className="mt-3 text-xs text-ink-faint">ไม่มี order เปิดอยู่</div>
        )}
        {lastMessage && (
          <p className="text-ink-muted text-xs mt-3">
            ข้อความล่าสุดจากบอท: <span className="text-ink">{lastMessage}</span>
          </p>
        )}
        {!isRunning && (
          <p className="text-yellow-500/90 text-xs mt-2">บอทยังไม่ทำงาน — กด START AUTO TRADE (ซ้ายล่าง) เพื่อเริ่มสแกน</p>
        )}
      </div>

      <div className="lux-card p-2 flex-1 min-h-0">
        <SMCChart
          symbol={symbol}
          timeframe={timeframe}
          zone={isSmc ? zone : null}
          showOverlays={isSmc ? showOverlays : false}
          preview={openPos}
          markers={markers}
          retestLevel={retestLevel}
          levels={isSniper ? breakoutLevels : isAltEngine ? altLevels : undefined}
          shiftHours={shiftHours}
        />
      </div>
    </div>
  );
};

export default LiveChartView;
