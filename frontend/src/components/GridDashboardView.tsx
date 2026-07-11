import React, { useEffect, useRef, useState } from 'react';
import { Wallet, LineChart, TrendingUp, TrendingDown, Zap, Target, LayoutGrid, AlertTriangle } from 'lucide-react';
import api from '../api';
import type { LiveDecision, GridStatusResponse } from '../types/strategy';

// Dashboard เฉพาะกลยุทธ์ Grid Martingale (EA5) — แยกไฟล์ตาม pattern SniperDashboardView
// โทนสีประจำกลยุทธ์ = ม่วง #BF5AF2 (ตรงการ์ดหน้าเลือกกลยุทธ์)
// มี banner คำเตือนถาวร: backtest 6 เดือน 2026 ติดลบทุก config — เหมาะ sideways + demo เท่านั้น

const GRID_PURPLE = '#BF5AF2';

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
  EXECUTED:       { label: 'เปิดตะกร้า',   bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  GRID_ADD:       { label: 'เติมไม้ถัว',   bg: 'bg-purple-500/15',  text: 'text-purple-400' },
  BASKET_SL:      { label: 'ตัดตะกร้า',    bg: 'bg-red-500/15',     text: 'text-red-400' },
  NEWS:           { label: 'ข่าวแรง',      bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  SESSION:        { label: 'นอก session',  bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  DAILY_LIMIT:    { label: 'ลิมิตรายวัน', bg: 'bg-red-500/15',     text: 'text-red-400' },
  PORTFOLIO_KILL: { label: 'หยุดพอร์ต',   bg: 'bg-red-500/15',     text: 'text-red-400' },
  SPREAD:         { label: 'สเปรดกว้าง',  bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  ERROR:          { label: 'ผิดพลาด',     bg: 'bg-red-500/15',     text: 'text-red-400' },
  SEARCHING:      { label: 'กำลังหา',     bg: 'bg-white/5',        text: 'text-ink-muted' },
};

const Pill: React.FC<{ label: string; bg: string; text: string }> = ({ label, bg, text }) => (
  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${bg} ${text}`}>{label}</span>
);

const KPI: React.FC<{
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  icon?: React.ElementType; iconColor?: string; iconBg?: string;
}> = ({ label, value, sub, icon: Icon, iconColor = GRID_PURPLE, iconBg = 'rgba(191,90,242,0.15)' }) => (
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

const Arrow: React.FC<{ active: boolean; color?: string }> = ({ active, color = GRID_PURPLE }) => (
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

const GridDashboardView: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [online, setOnline] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [status, setStatus] = useState<GridStatusResponse | null>(null);
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
          api.get<GridStatusResponse>('/api/grid/status', { params: { symbol } }),
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
        triggerFlash('basket', String(stRes.data.basket?.levels ?? 0));
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
  const basket    = status?.basket ?? null;
  const hasBasket = !!basket && basket.levels > 0;
  const dailyLoss = status?.daily_loss;
  const halted    = !!dailyLoss?.halted;
  const floatPL   = positions.reduce((s, p) => s + p.profit, 0);
  const tf        = status?.entry_timeframe ?? cfg?.entry_timeframe ?? '—';

  // floating loss เทียบเพดาน basket stop (%. ของ balance)
  const stopLimit = (account?.balance ?? 0) * ((cfg?.basket_sl_percent ?? 15) / 100);
  const lossPct = hasBasket && basket!.floating < 0 && stopLimit > 0
    ? Math.min(100, (-basket!.floating / stopLimit) * 100) : 0;

  const cOpened  = todayCounts.EXECUTED ?? 0;
  const cBlocked = (todayCounts.NEWS ?? 0) + (todayCounts.SESSION ?? 0)
    + (todayCounts.DAILY_LIMIT ?? 0) + (todayCounts.PORTFOLIO_KILL ?? 0)
    + (todayCounts.SPREAD ?? 0);
  const cBasketSL = todayCounts.BASKET_SL ?? 0;

  return (
    <div className="ios-fade-in flex flex-col gap-3 h-full">

      {/* Header */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <h1 className="lux-h1">Dashboard</h1>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
          style={{ color: GRID_PURPLE, background: 'rgba(191,90,242,0.12)', border: '1px solid rgba(191,90,242,0.30)' }}>
          <LayoutGrid size={11} strokeWidth={2.5} />
          GRID MARTINGALE
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

      {/* คำเตือนถาวร */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-[11px] leading-relaxed shrink-0"
        style={{ color: '#FF9F0A', background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)' }}>
        <AlertTriangle size={14} strokeWidth={2.3} className="shrink-0 mt-0.5" />
        <span>
          <b>ความเสี่ยงสูง:</b> Grid Martingale ถัวสวนราคา — backtest XAUUSD ม.ค.–มิ.ย. 2026 (ตลาดเทรนด์แรง)
          ติดลบทุก config ที่ทดสอบ เหมาะเฉพาะตลาด sideways · แนะนำใช้บัญชี demo เท่านั้น
          และห้ามปิด Basket Stop
        </span>
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
        <KPI label="Today — ตะกร้า / ตัด" icon={Target}
          value={
            <span className="flex gap-2">
              <span style={{ color: '#30D158' }}>{cOpened}</span>
              <span style={{ color: 'rgba(235,235,245,0.25)' }}>/</span>
              <span style={{ color: '#FF453A' }}>{cBasketSL}</span>
            </span>
          }
          sub={`บล็อก ${cBlocked}`} />
        <KPI label="Basket"
          icon={LayoutGrid}
          iconColor={hasBasket ? GRID_PURPLE : 'rgba(235,235,245,0.3)'}
          iconBg={hasBasket ? 'rgba(191,90,242,0.12)' : 'rgba(255,255,255,0.06)'}
          value={
            <span style={{ color: hasBasket ? '#FFFFFF' : 'rgba(235,235,245,0.40)' }}>
              {hasBasket ? `${basket!.levels}/${basket!.max_levels} ชั้น` : 'ว่าง'}
            </span>
          }
          sub={hasBasket ? `${basket!.direction} · floating ${basket!.floating >= 0 ? '+' : ''}${basket!.floating.toFixed(2)}` : basket?.cooldown ? 'พัก cooldown' : undefined} />
      </div>

      {/* Pipeline */}
      <div className="lux-card px-4 py-3 shrink-0">
        <p className="lux-title mb-2.5">Live Pipeline — Grid Martingale</p>
        <div className="flex items-stretch gap-1">
          <PipeNode
            color={GRID_PURPLE} title="Direction (EMA50)"
            value={running ? `RUNNING · ${tf}` : 'STOPPED'}
            sub={basket && !hasBasket && basket.ema50 != null && basket.price != null
              ? `ราคา ${basket.price.toFixed(2)} ${basket.price > basket.ema50 ? '>' : '<'} EMA50 ${basket.ema50.toFixed(2)}`
              : cfg ? `ทิศ${cfg.direction_mode === 0 ? 'ตาม' : 'สวน'} EMA50` : '—'}
            state={running ? 'active' : 'idle'}
          />
          <Arrow active={hasBasket} />
          <PipeNode
            color={GRID_PURPLE} title="Basket Open"
            value={hasBasket ? `${basket!.direction} · base ${cfg?.base_lot ?? '-'} lot` : basket?.cooldown ? 'พัก cooldown' : 'รอเปิดตะกร้า'}
            sub={hasBasket && basket!.avg != null ? `avg ${basket!.avg.toFixed(2)}` : '—'}
            state={hasBasket ? 'active' : 'idle'}
            flash={flash.basket}
          />
          <Arrow active={hasBasket && basket!.levels > 1} />
          <PipeNode
            color={GRID_PURPLE} title="Grid Add"
            value={hasBasket ? `${basket!.levels}/${basket!.max_levels} ชั้น (×${cfg?.lot_multiplier ?? '-'})` : `สูงสุด ${cfg?.max_grid_levels ?? '-'} ชั้น`}
            sub={hasBasket && basket!.next_level != null && basket!.levels < basket!.max_levels
              ? `ชั้นถัดไปที่ ${basket!.next_level.toFixed(2)}` : hasBasket ? 'ครบทุกชั้นแล้ว' : `ระยะชั้น ${cfg?.grid_step_atr ?? '-'}×ATR`}
            state={hasBasket && basket!.levels > 1 ? 'active' : 'idle'}
          />
          <Arrow active={hasBasket} />
          <PipeNode
            color={GRID_PURPLE} title="Basket TP"
            value={hasBasket && basket!.tp != null ? `TP รวมที่ ${basket!.tp.toFixed(2)}` : `avg ± ${cfg?.basket_tp_atr ?? '-'}×ATR`}
            sub="ทุกไม้ TP เดียวกัน — broker ปิดทั้งชุด"
            state={hasBasket ? 'active' : 'idle'}
          />
          <Arrow active={hasBasket && lossPct > 50} />
          <PipeNode
            color={GRID_PURPLE} title="Basket Stop"
            value={`ตัดที่ -${cfg?.basket_sl_percent ?? '-'}% ของพอร์ต`}
            sub={hasBasket ? `ตอนนี้ใช้ไป ${lossPct.toFixed(0)}% ของเพดาน` : `พัก ${cfg?.cooldown_bars ?? '-'} แท่งหลังตัด`}
            state={lossPct > 75 ? 'warn' : hasBasket && lossPct > 0 ? 'active' : 'idle'}
          />
        </div>
      </div>

      {/* Basket panel + Live log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        <div className="lux-card p-4 min-h-0 flex flex-col">
          <p className="lux-title mb-2 shrink-0">ตะกร้าปัจจุบัน {hasBasket ? `— ${basket!.direction} ${basket!.levels} ชั้น` : ''}</p>
          {!hasBasket ? (
            <p className="text-ink-muted text-sm">
              {basket?.cooldown ? 'พัก cooldown หลังตัดตะกร้า — รอครบเวลาแล้วค่อยเปิดใหม่' : 'ยังไม่มีตะกร้าเปิด — รอสัญญาณทิศทางจาก EMA50'}
            </p>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
              {/* แถบ floating loss เทียบเพดาน basket stop */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-ink-muted">Floating เทียบเพดานตัด (-{cfg?.basket_sl_percent}%)</span>
                  <span className={basket!.floating >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {basket!.floating >= 0 ? '+' : ''}{basket!.floating.toFixed(2)} / -{stopLimit.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${lossPct}%`,
                      background: lossPct > 75 ? '#FF453A' : lossPct > 40 ? '#FF9F0A' : GRID_PURPLE,
                    }} />
                </div>
              </div>

              <table className="lux-table text-xs w-full">
                <thead>
                  <tr>{['ชั้น','ราคาเข้า','Lot','P/L'].map((h) => <th key={h} className="pb-1.5">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {basket!.legs.map((l, i) => (
                    <tr key={l.ticket}>
                      <td>{i + 1}</td>
                      <td className="tabular-nums">{l.price.toFixed(2)}</td>
                      <td className="tabular-nums">{l.lot}</td>
                      <td className={`tabular-nums font-semibold ${l.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {l.profit >= 0 ? '+' : ''}{l.profit.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs tabular-nums">
                {basket!.avg != null && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">ราคาเฉลี่ยถ่วง lot</span>
                    <span className="text-ink">{basket!.avg.toFixed(2)}</span>
                  </div>
                )}
                {basket!.tp != null && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Basket TP</span>
                    <span className="text-emerald-400">{basket!.tp.toFixed(2)}</span>
                  </div>
                )}
                {basket!.next_level != null && basket!.levels < basket!.max_levels && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">ชั้นถัดไป</span>
                    <span className="text-ink">{basket!.next_level.toFixed(2)}</span>
                  </div>
                )}
                {basket!.price != null && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">ราคาปัจจุบัน</span>
                    <span className="text-ink">{basket!.price.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="lux-card p-4 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-2 shrink-0 flex-wrap gap-2">
            <p className="lux-title">บันทึก Live — เหตุการณ์ตะกร้า</p>
            <div className="flex gap-3 text-[10px] tabular-nums">
              <span className="text-emerald-400 font-semibold">เปิด {cOpened}</span>
              <span className="text-red-400 font-semibold">ตัด {cBasketSL}</span>
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

export default GridDashboardView;
