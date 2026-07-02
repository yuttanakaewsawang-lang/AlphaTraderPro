import React, { useEffect, useState } from 'react';
import api from '../api';
import SMCChart, { type EntryMarker } from './SMCChart';
import type { ActiveZone, EntryPreview, ZoneResponse, StrategyConfig } from '../types/strategy';

const TIMEFRAMES = ['M1', 'M5', 'M15', 'H1'];

// สร้าง STEPS แบบ dynamic ตาม config จริง
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

interface LiveChartViewProps {
  symbol: string;
}

const LiveChartView: React.FC<LiveChartViewProps> = ({ symbol }) => {
  const [zone, setZone] = useState<ActiveZone | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastMessage, setLastMessage] = useState('');
  const [openPos, setOpenPos] = useState<EntryPreview | null>(null);
  const [markers, setMarkers] = useState<EntryMarker[]>([]);
  const [brokerOffset, setBrokerOffset] = useState(0);
  const [showOverlays, setShowOverlays] = useState(true);
  const [timeframe, setTimeframe] = useState('M5');
  const [config, setConfig] = useState<StrategyConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchZone = async () => {
      try {
        const res = await api.get<ZoneResponse>('/api/strategy/zone', { params: { symbol } });
        if (cancelled) return;
        setZone(res.data.zone);
        setIsRunning(res.data.is_running);
        setLastMessage(res.data.last_message || '');
        if (res.data.config) setConfig(res.data.config);
        if (typeof (res.data as any).broker_offset === 'number') setBrokerOffset((res.data as any).broker_offset);
      } catch (err) {
        console.error('Failed to load zone', err);
      }
    };
    fetchZone();
    const interval = setInterval(fetchZone, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [symbol]);

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

  const hasZone = !!zone && (zone.zone_type === 0 || zone.zone_type === 1);
  const reqRetest = config ? !!config.require_retest : true;
  const STEPS = buildSteps(config);
  // step index ปรับตาม require_retest: ถ้า OFF ให้ข้ามขั้น retest
  let step = 0;
  if (hasZone) {
    if (!zone!.is_broken) step = 1;
    else if (!zone!.is_retested && reqRetest) step = 2;
    else step = reqRetest ? 3 : 2; // ถ้าไม่มี retest step, last step = index 2
  }

  const direction = !hasZone ? null : zone!.zone_type === 1 ? 'BUY' : 'SELL';
  const dirColor = direction === 'BUY' ? 'text-green-400' : direction === 'SELL' ? 'text-red-400' : 'text-ink-faint';
  // เส้น retest = ขอบโซนที่ราคาต้องกลับมาแตะ (โชว์เฉพาะตอนเบรกแล้วแต่ยังไม่ retest)
  const retestLevel = hasZone && zone!.is_broken && !zone!.is_retested
    ? (zone!.zone_type === 1 ? zone!.high_limit : zone!.low_limit)
    : null;
  const shiftHours = 7 - brokerOffset; // โบรกเกอร์ -> เวลาไทย (UTC+7)

  return (
    <div className="ios-fade-in flex flex-col gap-3 h-full">
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <h1 className="lux-h1">Live Chart — {symbol}</h1>
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
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                timeframe === tf ? 'lux-btn-primary' : 'lux-btn-ghost text-ink-muted'
              }`}
            >{tf}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 lux-label cursor-pointer select-none">
          <input type="checkbox" checked={showOverlays} onChange={(e) => setShowOverlays(e.target.checked)} className="w-4 h-4 accent-[#0A84FF]" />
          แสดง Order Block
        </label>
        <span className="lux-label">เวลาไทย</span>
      </div>

      {/* แถบ logic: ขั้นไหนกำลังรออยู่ */}
      <div className="lux-card p-4 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="lux-title">สถานะการรอเข้าออเดอร์</p>
          {hasZone && (
            <div className="flex items-center gap-3 text-sm">
              <span>ทิศ: <span className={`font-bold ${dirColor}`}>{direction}</span> ({zone!.zone_type === 1 ? 'RBS' : 'SBR'})</span>
              <span className="text-ink-muted">โซนรอเข้า: <span className="tabular-nums text-ink">{zone!.low_limit} – {zone!.high_limit}</span></span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {STEPS.map((s, i) => {
            const active = isRunning && hasZone && i === step;
            const done = isRunning && hasZone && i < step;
            const searching = isRunning && !hasZone && i === 0;
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
          zone={zone}
          showOverlays={showOverlays}
          preview={openPos}
          markers={markers}
          retestLevel={retestLevel}
          shiftHours={shiftHours}
        />
      </div>
    </div>
  );
};

export default LiveChartView;
