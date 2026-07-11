import React, { useEffect, useRef, useState } from 'react';
import { Wallet, LineChart, TrendingUp, TrendingDown, Zap, Target, ArrowDownUp } from 'lucide-react';
import api from '../api';
import type { LiveDecision, ReversalStatusResponse } from '../types/strategy';

// Dashboard เฉพาะกลยุทธ์ Reversal (EA4 — RSI extreme + trend filter) — แยกไฟล์ตาม pattern
// SniperDashboardView · โทนสีประจำกลยุทธ์ = ส้ม #FF9F0A (ตรงการ์ดหน้าเลือกกลยุทธ์)

const REV_ORANGE = '#FF9F0A';

interface AccountInfo {
  success: boolean;
  balance?: number;
  equity?: number;
  profit_total?: number;
  trades_total?: number;
}

interface Position {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  price_open: number;
  price_current: number;
  profit: number;
}

const STAGE_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  EXECUTED:       { label: 'เปิดไม้',      bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  RISK_GUARD:     { label: 'Risk Guard',   bg: 'bg-red-500/15',     text: 'text-red-400' },
  NEWS:           { label: 'ข่าวแรง',      bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  SESSION:        { label: 'นอก session',  bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  DAILY_LIMIT:    { label: 'ลิมิตรายวัน', bg: 'bg-red-500/15',     text: 'text-red-400' },
  PORTFOLIO_KILL: { label: 'หยุดพอร์ต',   bg: 'bg-red-500/15',     text: 'text-red-400' },
  SPREAD:         { label: 'สเปรดกว้าง',  bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  ERROR:          { label: 'ผิดพลาด',     bg: 'bg-red-500/15',     text: 'text-red-400' },
  POSITION_OPEN:  { label: 'มีไม้เปิด',    bg: 'bg-sky-500/15',     text: 'text-sky-400' },
  SEARCHING:      { label: 'กำลังหา',     bg: 'bg-white/5',        text: 'text-ink-muted' },
};

const biasText = (bias: -1 | 0 | 1) =>
  bias === 1 ? 'BULLISH' : bias === -1 ? 'BEARISH' : 'NEUTRAL';
const biasColor = (bias: -1 | 0 | 1) =>
  bias === 1 ? '#30D158' : bias === -1 ? '#FF453A' : 'rgba(235,235,245,0.45)';

const Pill: React.FC<{ label: string; bg: string; text: string }> = ({ label, bg, text }) => (
  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${bg} ${text}`}>{label}</span>
);

const KPI: React.FC<{
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  icon?: React.ElementType; iconColor?: string; iconBg?: string;
}> = ({ label, value, sub, icon: Icon, iconColor = REV_ORANGE, iconBg = 'rgba(255,159,10,0.15)' }) => (
  <div className="lux-card px-4 py-3">
    {Icon && (
      <div className="ios-icon-tile w-8 h-8 mb-2" style={{ background: iconBg }}>
        <Icon size={15} color={iconColor} strokeWidth={2.3} />
      </div>
    )}
    <p className="lux-label mb-1.5">{label}</p>
    <div className="text-[var(--color-ink)] font-semibold text-lg tabular-nums leading-tight">{value}</div>
    {sub && <div className="text-xs mt-1" style={{ color: 'rgba(235,235,245,0.38)' }}>{sub}</div>}
  </div>
);

const PipeNode: React.FC<{
  color: string; title: string; value: string; sub: string;
  state: 'active' | 'warn' | 'idle'; flash?: boolean;
}> = ({ color, title, value, sub, state, flash }) => {
  const dotColor = state === 'active' ? '#30D158' : state === 'warn' ? '#FF453A' : 'rgba(235,235,245,0.2)';
  const glowColor = state === 'active' ? 'rgba(48,209,88,0.12)' : state === 'warn' ? 'rgba(255,69,58,0.10)' : 'transparent';
  return (
    <div className={`flex-1 min-w-0 rounded-2xl border p-3.5 ${flash ? 'agent-card-flash' : ''}`}
      style={{
        background: state !== 'idle' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: state !== 'idle' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
        boxShadow: state !== 'idle' ? `0 0 20px -4px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.08)` : 'none',
        transition: 'border-color 0.3s var(--ease-ios), box-shadow 0.3s var(--ease-ios), background-color 0.3s var(--ease-ios)',
      }}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${state !== 'idle' ? 'agent-pulse' : ''}`}
          style={{ backgroundColor: dotColor, boxShadow: state !== 'idle' ? `0 0 6px ${dotColor}` : 'none' }} />
        <p className="text-[11px] uppercase tracking-wider font-semibold truncate" style={{ color }}>{title}</p>
      </div>
      <p className="text-sm font-semibold truncate" style={{ color: '#FFFFFF' }}>{value}</p>
      <p className="text-xs mt-1 truncate" style={{ color: 'rgba(235,235,245,0.45)' }} title={sub}>{sub}</p>
    </div>
  );
};

const Arrow: React.FC<{ active: boolean; color?: string }> = ({ active, color = REV_ORANGE }) => (
  <div className="hidden lg:flex items-center justify-center w-14 shrink-0">
    <svg width="56" height="16" viewBox="0 0 56 16">
      {active && <line x1="0" y1="8" x2="50" y2="8" stroke={color} strokeWidth="4" opacity="0.08" />}
      <line x1="0" y1="8" x2="50" y2="8" stroke={active ? color : '#1F2937'} strokeWidth="1.5" opacity={active ? 0.4 : 1} />
      {active && (
        <circle r="2.5" cy="8" fill={color} opacity="0.95">
          <animateMotion dur="1.2s" repeatCount="indefinite" begin="0s" path="M0,0 L50,0" />
        </circle>
      )}
      <polyline points="44,4 50,8 44,12" fill="none"
        stroke={active ? color : '#1F2937'} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  </div>
);

const ReversalDashboardView: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [online, setOnline] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [status, setStatus] = useState<ReversalStatusResponse | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [decisions, setDecisions] = useState<LiveDecision[]>([]);
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const lastSigs = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const triggerFlash = (key: string, sig: string) => {
      if (!sig) return;
      const prev = lastSigs.current[key];
      if (prev !== undefined && prev !== sig) {
        setFlash((f) => ({ ...f, [key]: true }));
        setTimeout(() => setFlash((f) => ({ ...f, [key]: false })), 800);
      }
      lastSigs.current[key] = sig;
    };

    const fetchAll = async () => {
      try {
        const [accRes, stRes, posRes, decRes] = await Promise.all([
          api.get<AccountInfo>('/api/account'),
          api.get<ReversalStatusResponse>('/api/reversal/status', { params: { symbol } }),
          api.get<Position[]>('/api/positions', { params: { symbol } }),
          api.get<{ decisions: LiveDecision[]; today_counts: Record<string, number> }>(
            '/api/strategy/decisions', { params: { symbol, limit: 15 } }),
        ]);
        if (cancelled) return;
        setOnline(!!accRes.data.success);
        setAccount(accRes.data);
        setStatus(stRes.data);
        setPositions(posRes.data);
        setDecisions(decRes.data.decisions);
        setTodayCounts(decRes.data.today_counts ?? {});
        triggerFlash('scan', stRes.data.last_message ?? '');
        triggerFlash('rsi', stRes.data.setup ? stRes.data.setup.rsi.toFixed(1) : '');
        triggerFlash('portfolio', `${posRes.data.length}-${accRes.data.equity}`);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };

    fetchAll();
    const iv = setInterval(fetchAll, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [symbol]);

  const running   = !!status?.is_running;
  const cfg       = status?.config;
  const setup     = status?.setup ?? null;
  const dailyLoss = status?.daily_loss;
  const halted    = !!dailyLoss?.halted;
  const lastEntry = status?.last_entry;
  const floatPL   = positions.reduce((s, p) => s + p.profit, 0);
  const tf        = status?.entry_timeframe ?? cfg?.entry_timeframe ?? '—';
  const bias      = setup?.bias ?? 0;
  const trendOn   = !!cfg && !!cfg.use_trend_filter;

  const oversold   = !!setup && setup.rsi <= setup.rsi_buy_level;
  const overbought = !!setup && setup.rsi >= setup.rsi_sell_level;

  const cOpened  = todayCounts.EXECUTED ?? 0;
  const cBlocked = (todayCounts.NEWS ?? 0) + (todayCounts.SESSION ?? 0)
    + (todayCounts.DAILY_LIMIT ?? 0) + (todayCounts.PORTFOLIO_KILL ?? 0)
    + (todayCounts.SPREAD ?? 0) + (todayCounts.RISK_GUARD ?? 0);

  return (
    <div className="ios-fade-in flex flex-col gap-3 h-full">

      {/* Header */}
      <div className="flex items-center gap-2 shrink-0">
        <h1 className="lux-h1">Dashboard</h1>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
          style={{ color: REV_ORANGE, background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.30)' }}>
          <ArrowDownUp size={11} strokeWidth={2.5} />
          REVERSAL
        </span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
          online ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 agent-pulse' : 'bg-red-500'}`} />
          {online ? 'MT5 ONLINE' : 'OFFLINE'}
        </span>
        {running && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 agent-pulse" />
            AUTO TRADE · {symbol}
          </span>
        )}
        {halted && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
            ⚠ DAILY LOSS LIMIT — บอทหยุดเปิดไม้
          </span>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 shrink-0">
        <KPI label="Balance" icon={Wallet}
          value={<span style={{ color: '#FFFFFF' }}>${account?.balance?.toLocaleString('en', { minimumFractionDigits: 2 }) ?? '—'}</span>} />
        <KPI label="Equity" icon={LineChart}
          value={<span style={{ color: '#FFFFFF' }}>${account?.equity?.toLocaleString('en', { minimumFractionDigits: 2 }) ?? '—'}</span>} />
        <KPI label="Floating P/L"
          icon={floatPL >= 0 ? TrendingUp : TrendingDown}
          iconColor={floatPL >= 0 ? '#30D158' : '#FF453A'}
          iconBg={floatPL >= 0 ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)'}
          value={<span style={{ color: floatPL >= 0 ? '#30D158' : '#FF453A' }}>{floatPL >= 0 ? '+' : ''}{floatPL.toFixed(2)}</span>}
          sub={`${positions.length} ไม้เปิด`} />
        <KPI label="Total Trades" icon={Zap}
          value={<span style={{ color: '#FFFFFF' }}>{account?.trades_total ?? 0}</span>} />
        <KPI label="Today — เปิด / บล็อก" icon={Target}
          value={
            <span className="flex gap-2">
              <span style={{ color: '#30D158' }}>{cOpened}</span>
              <span style={{ color: 'rgba(235,235,245,0.25)' }}>/</span>
              <span style={{ color: '#FFD60A' }}>{cBlocked}</span>
            </span>
          } />
        <KPI label={`RSI(${cfg?.rsi_period ?? 14})`}
          icon={ArrowDownUp}
          iconColor={oversold || overbought ? REV_ORANGE : 'rgba(235,235,245,0.3)'}
          iconBg={oversold || overbought ? 'rgba(255,159,10,0.12)' : 'rgba(255,255,255,0.06)'}
          value={
            <span style={{ color: setup ? (oversold ? '#30D158' : overbought ? '#FF453A' : '#FFFFFF') : 'rgba(235,235,245,0.40)' }}>
              {setup ? setup.rsi.toFixed(1) : 'รอข้อมูล'}
            </span>
          }
          sub={setup ? (oversold ? 'Oversold — รอกลับตัวขึ้น' : overbought ? 'Overbought — รอกลับตัวลง' : `โซนกลาง · ${tf}`) : undefined} />
      </div>

      {/* Open Positions */}
      {positions.length > 0 && (
        <div className="lux-card p-3 shrink-0">
          <p className="lux-title mb-2">Open Positions</p>
          <div className="overflow-x-auto">
            <table className="lux-table text-xs w-full">
              <thead>
                <tr>{['Symbol','Type','Vol','Open','Current','Profit'].map((h) => <th key={h} className="pb-1.5">{h}</th>)}</tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.ticket}>
                    <td className="font-medium">{p.symbol}</td>
                    <td>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        p.type === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      }`}>{p.type}</span>
                    </td>
                    <td>{p.volume}</td>
                    <td className="tabular-nums">{p.price_open}</td>
                    <td className="tabular-nums">{p.price_current}</td>
                    <td className={`tabular-nums font-semibold ${p.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {p.profit >= 0 ? '+' : ''}{p.profit.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pipeline */}
      <div className="lux-card px-4 py-3 shrink-0">
        <p className="lux-title mb-2.5">Live Pipeline — Reversal at Extreme</p>
        <div className="flex items-stretch gap-1">
          <PipeNode
            color={REV_ORANGE} title="Extreme Scan"
            value={running ? `RUNNING · ${tf}` : 'STOPPED'}
            sub={setup ? `กรอบ ${setup.lookback} แท่ง: ${setup.extreme_low.toFixed(2)} – ${setup.extreme_high.toFixed(2)}` : 'รอข้อมูลแท่งเทียน'}
            state={running && setup ? 'active' : 'idle'}
          />
          <Arrow active={running && !!setup} />
          <PipeNode
            color={REV_ORANGE} title="RSI Extreme"
            value={setup ? (oversold ? `RSI ${setup.rsi.toFixed(1)} ≤ ${setup.rsi_buy_level}` : overbought ? `RSI ${setup.rsi.toFixed(1)} ≥ ${setup.rsi_sell_level}` : `RSI ${setup.rsi.toFixed(1)} โซนกลาง`) : 'รอข้อมูล'}
            sub={`เกณฑ์ BUY ≤ ${cfg?.rsi_buy_level ?? 30} · SELL ≥ ${cfg?.rsi_sell_level ?? 70}`}
            state={oversold ? 'active' : overbought ? 'warn' : 'idle'}
            flash={flash.rsi}
          />
          <Arrow active={oversold || overbought} />
          <PipeNode
            color={REV_ORANGE} title="Reversal Candle"
            value={trendOn ? `ยืนยัน + ไม่สวนเทรนด์ (${biasText(bias)})` : 'รอแท่งยืนยันกลับตัว'}
            sub={status?.last_message ?? '—'}
            state={running && (oversold || overbought) ? 'active' : 'idle'}
            flash={flash.scan}
          />
          <Arrow active={positions.length > 0} />
          <PipeNode
            color={REV_ORANGE} title="Execution"
            value={`Risk ${cfg?.risk_percent ?? '-'}% / ไม้`}
            sub={lastEntry ? `${lastEntry.type} @ ${lastEntry.price} · ${lastEntry.source}` : 'ยังไม่มีไม้'}
            state={positions.length > 0 ? 'active' : 'idle'}
          />
          <Arrow active={positions.length > 0} />
          <PipeNode
            color={REV_ORANGE} title="SL/TP @ Order"
            value={`RR 1:${cfg?.rr ?? '-'}`}
            sub={positions.length > 0 ? `โบรกเกอร์ดูแล ${positions.length} ไม้ (SL หลัง extreme)` : 'SL/TP ตั้งที่ออเดอร์ตั้งแต่เปิดไม้'}
            state={positions.length > 0 ? 'active' : 'idle'}
            flash={flash.portfolio}
          />
        </div>
      </div>

      {/* RSI panel + Live log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        <div className="lux-card p-4 min-h-0 flex flex-col">
          <p className="lux-title mb-2 shrink-0">RSI + กรอบสุดขั้ว {setup ? `${setup.lookback} แท่ง (${tf})` : ''}</p>
          {!setup ? (
            <p className="text-ink-muted text-sm">รอข้อมูลแท่งเทียนจาก MT5...</p>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
              {/* แถบ RSI 0-100 พร้อม marker เกณฑ์และค่าปัจจุบัน */}
              <div className="pt-5 pb-1">
                <div className="relative h-2.5 rounded-full"
                  style={{ background: 'linear-gradient(90deg, rgba(48,209,88,0.4), rgba(255,255,255,0.08) 35%, rgba(255,255,255,0.08) 65%, rgba(255,69,58,0.4))' }}>
                  {/* เส้นเกณฑ์ */}
                  <div className="absolute top-[-3px] w-px h-4 bg-white/30" style={{ left: `${setup.rsi_buy_level}%` }} />
                  <div className="absolute top-[-3px] w-px h-4 bg-white/30" style={{ left: `${setup.rsi_sell_level}%` }} />
                  {/* marker RSI ปัจจุบัน */}
                  <div className="absolute -top-[7px] w-1 h-6 rounded-full"
                    style={{
                      left: `calc(${Math.min(100, Math.max(0, setup.rsi))}% - 2px)`,
                      background: '#FFFFFF',
                      boxShadow: `0 0 8px ${oversold ? '#30D158' : overbought ? '#FF453A' : REV_ORANGE}`,
                    }} />
                </div>
                <div className="flex justify-between mt-2 text-xs tabular-nums">
                  <span className="text-emerald-400">Oversold ≤ {setup.rsi_buy_level}</span>
                  <span className="text-ink font-semibold">RSI {setup.rsi.toFixed(1)}</span>
                  <span className="text-red-400">Overbought ≥ {setup.rsi_sell_level}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs tabular-nums">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Low สุดขั้ว ({setup.lookback} แท่ง)</span>
                  <span className="text-emerald-400">{setup.extreme_low.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">High สุดขั้ว ({setup.lookback} แท่ง)</span>
                  <span className="text-red-400">{setup.extreme_high.toFixed(2)}</span>
                </div>
                {setup.price != null && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">ราคาปัจจุบัน</span>
                    <span className="text-ink">{setup.price.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-ink-muted">แท่งปิดล่าสุด</span>
                  <span className="text-ink">{setup.last_close.toFixed(2)}</span>
                </div>
                {setup.atr != null && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">ATR(14)</span>
                    <span className="text-ink">{setup.atr.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-ink-muted">เทรนด์ TF ใหญ่</span>
                  <span className="font-semibold" style={{ color: biasColor(bias) }}>
                    {trendOn ? biasText(bias) : 'ปิด filter'}
                  </span>
                </div>
              </div>

              <p className="text-[10px] text-ink-faint leading-relaxed">
                สัญญาณเข้า = ราคาทำจุดต่ำ/สูงสุดใหม่ในรอบ {setup.lookback} แท่ง + RSI เข้าเขตสุดขั้ว +
                แท่งยืนยันกลับตัว{trendOn ? ' — เข้าเฉพาะทิศเดียวกับเทรนด์ TF ใหญ่ (backtest ชี้ว่าสวนเทรนด์เพียวๆ ขาดทุน)' : ''} ·
                SL เลยปลาย extreme + buffer · TP = {cfg?.rr ?? 2}× ระยะ SL
              </p>
            </div>
          )}
        </div>

        <div className="lux-card p-4 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-2 shrink-0 flex-wrap gap-2">
            <p className="lux-title">บันทึก Live — ทำไมเข้า/ไม่เข้าไม้</p>
            <div className="flex gap-3 text-[10px] tabular-nums">
              <span className="text-emerald-400 font-semibold">เปิด {cOpened}</span>
              <span className="text-amber-400 font-semibold">บล็อก {cBlocked}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {decisions.length === 0 ? (
              <p className="text-ink-muted text-sm">ยังไม่มีเหตุการณ์ — บอทกำลังสแกนตามปกติ</p>
            ) : (
              <ul className="space-y-0.5">
                {decisions.map((d, i) => {
                  const st = STAGE_STYLE[d.stage] ?? { label: d.stage, bg: 'bg-white/5', text: 'text-ink-muted' };
                  return (
                    <li key={i} className="flex items-center gap-2 py-1.5 border-b border-[var(--hairline)] text-xs">
                      <span className="text-ink-faint whitespace-nowrap tabular-nums shrink-0">{d.time?.slice(5, 16)}</span>
                      <Pill label={st.label} bg={st.bg} text={st.text} />
                      <span className="text-ink-muted truncate" title={d.reason}>{d.reason}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default ReversalDashboardView;
