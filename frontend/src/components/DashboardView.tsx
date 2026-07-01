import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import type {
  AIReviewEntry,
  AIReviewLogResponse,
  LiveDecision,
  StructureResponse,
  ZoneResponse,
} from '../types/strategy';

interface AccountInfo {
  success: boolean;
  balance?: number;
  equity?: number;
  margin?: number;
  profit_total?: number;
  trades_total?: number;
  broker?: string;
  account?: number;
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

interface DashboardViewProps { symbol: string }

const zoneLabel = (zoneType: -1 | 0 | 1) => {
  if (zoneType === 1) return 'RBS · Buy Zone';
  if (zoneType === 0) return 'SBR · Sell Zone';
  return 'No Zone';
};

const biasLabel = (dir?: 'bullish' | 'bearish' | null) =>
  dir === 'bullish' ? 'Bullish' : dir === 'bearish' ? 'Bearish' : 'Neutral';

const STAGE_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  EXECUTED:       { label: 'เปิดไม้',      bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  AI_REJECT:      { label: 'AI ปฏิเสธ',    bg: 'bg-red-500/15',     text: 'text-red-400' },
  NEWS:           { label: 'ข่าวแรง',      bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  SESSION:        { label: 'นอก session',  bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  DAILY_LIMIT:    { label: 'ลิมิตรายวัน', bg: 'bg-red-500/15',     text: 'text-red-400' },
  PORTFOLIO_KILL: { label: 'หยุดพอร์ต',   bg: 'bg-red-500/15',     text: 'text-red-400' },
  POSITION_OPEN:  { label: 'มีไม้เปิด',    bg: 'bg-sky-500/15',     text: 'text-sky-400' },
  SEARCHING:      { label: 'กำลังหา',     bg: 'bg-white/5',        text: 'text-ink-muted' },
};

/* ── Pill badge ─────────────────────────────────── */
const Pill: React.FC<{ label: string; bg: string; text: string }> = ({ label, bg, text }) => (
  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${bg} ${text}`}>{label}</span>
);

/* ── KPI card ───────────────────────────────────── */
const KPI: React.FC<{
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  icon?: string; iconColor?: string; iconBg?: string;
}> = ({ label, value, sub, icon, iconColor = '#82B1FF', iconBg = 'rgba(130,177,255,0.15)' }) => (
  <div className="lux-card px-4 py-3">
    {icon && (
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 text-base"
        style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
    )}
    <p className="lux-label mb-1.5">{label}</p>
    <div className="text-[var(--color-ink)] font-semibold text-lg tabular-nums leading-tight">{value}</div>
    {sub && <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</div>}
  </div>
);

/* ── Pipeline node ──────────────────────────────── */
const PipeNode: React.FC<{
  color: string; title: string; value: string; sub: string;
  state: 'active' | 'warn' | 'idle'; flash?: boolean;
}> = ({ color, title, value, sub, state, flash }) => {
  const dotColor = state === 'active' ? '#00E676' : state === 'warn' ? '#FF5252' : 'rgba(255,255,255,0.2)';
  const glowColor = state === 'active' ? 'rgba(0,230,118,0.12)' : state === 'warn' ? 'rgba(255,82,82,0.10)' : 'transparent';
  return (
    <div className={`flex-1 min-w-0 rounded-xl border p-3.5 transition-all ${flash ? 'agent-card-flash' : ''}`}
      style={{
        background: state !== 'idle'
          ? `rgba(255,255,255,0.08)`
          : 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: state !== 'idle' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
        boxShadow: state !== 'idle' ? `0 0 20px -4px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.10)` : 'none',
      }}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${state !== 'idle' ? 'agent-pulse' : ''}`}
          style={{ backgroundColor: dotColor, boxShadow: state !== 'idle' ? `0 0 6px ${dotColor}` : 'none' }} />
        <p className="text-[11px] uppercase tracking-wider font-semibold truncate" style={{ color }}>{title}</p>
      </div>
      <p className="text-sm font-semibold truncate" style={{ color: '#F0F4FF' }}>{value}</p>
      <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.45)' }} title={sub}>{sub}</p>
    </div>
  );
};

/* ── Animated flow connector ─────────────────────── */
const Arrow: React.FC<{ active: boolean; color?: string }> = ({ active, color = '#3B82F6' }) => (
  <div className="hidden lg:flex items-center justify-center w-14 shrink-0">
    <svg width="56" height="16" viewBox="0 0 56 16">
      {/* glow track */}
      {active && (
        <line x1="0" y1="8" x2="50" y2="8"
          stroke={color} strokeWidth="4" opacity="0.08" />
      )}
      {/* main track */}
      <line x1="0" y1="8" x2="50" y2="8"
        stroke={active ? color : '#1F2937'} strokeWidth="1.5"
        opacity={active ? 0.4 : 1} />
      {/* animated dot 1 */}
      {active && (
        <circle r="2.5" cy="8" fill={color} opacity="0.95">
          <animateMotion dur="1.2s" repeatCount="indefinite" begin="0s" path="M0,0 L50,0" />
        </circle>
      )}
      {/* animated dot 2 (offset) */}
      {active && (
        <circle r="1.5" cy="8" fill={color} opacity="0.5">
          <animateMotion dur="1.2s" repeatCount="indefinite" begin="-0.6s" path="M0,0 L50,0" />
        </circle>
      )}
      {/* arrowhead */}
      <polyline points="44,4 50,8 44,12" fill="none"
        stroke={active ? color : '#1F2937'}
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  </div>
);

const DashboardView: React.FC<DashboardViewProps> = ({ symbol }) => {
  const [online, setOnline] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [zone, setZone] = useState<ZoneResponse | null>(null);
  const [reviewLog, setReviewLog] = useState<AIReviewLogResponse | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [structure, setStructure] = useState<StructureResponse | null>(null);
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
        const [accRes, zoneRes, reviewRes, posRes, structRes, decRes] = await Promise.all([
          api.get<AccountInfo>('/api/account'),
          api.get<ZoneResponse>('/api/strategy/zone', { params: { symbol } }),
          api.get<AIReviewLogResponse>('/api/ai/review-log', { params: { limit: 20 } }),
          api.get<Position[]>('/api/positions', { params: { symbol } }),
          api.get<StructureResponse>('/api/structure', { params: { symbol } }),
          api.get<{ decisions: LiveDecision[]; today_counts: Record<string, number> }>(
            '/api/strategy/decisions', { params: { symbol, limit: 15 } }),
        ]);
        if (cancelled) return;
        setOnline(!!accRes.data.success);
        setAccount(accRes.data);
        setZone(zoneRes.data);
        setReviewLog(reviewRes.data);
        setPositions(posRes.data);
        setStructure(structRes.data);
        setDecisions(decRes.data.decisions);
        setTodayCounts(decRes.data.today_counts ?? {});

        const events = structRes.data.events ?? [];
        const latestEvent = events[events.length - 1];
        triggerFlash('structure', latestEvent ? `${latestEvent.break_time}-${latestEvent.direction}` : '');
        triggerFlash('smc', zoneRes.data.last_message ?? '');
        triggerFlash('review', reviewRes.data.reviews[0]?.time ?? '');
        triggerFlash('portfolio', `${posRes.data.length}-${accRes.data.equity}`);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };

    fetchAll();
    const iv = setInterval(fetchAll, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [symbol]);

  /* ── derived values ─────────────────────────────── */
  const events        = structure?.events ?? [];
  const latestEvent   = events[events.length - 1] ?? null;
  const latestReview  = reviewLog?.reviews?.[0] ?? null;
  const reviewStats   = reviewLog?.stats;
  const floatPL       = positions.reduce((s, p) => s + p.profit, 0);
  const smcRunning    = !!zone?.is_running;
  const dailyLoss     = zone?.daily_loss;
  const halted        = !!dailyLoss?.halted;
  const cfg           = zone?.config;
  const obCount       = (structure?.order_blocks ?? []).filter((o) => !o.mitigated).length;
  const fvgCount      = (structure?.fvgs ?? []).filter((f) => !f.mitigated).length;
  const az            = zone?.zone;
  const azActive      = !!(az && az.zone_type !== -1);
  const azBuy         = az?.zone_type === 1;
  const lastEntry     = zone?.last_entry;
  const mgmtTags      = cfg
    ? [cfg.use_breakeven ? 'BE' : '', cfg.enable_trailing ? 'Trail' : '',
       (cfg.use_partial_tp && cfg.partial_tp_close_pct > 0) ? 'Partial' : '']
        .filter(Boolean).join(' · ') || 'ปิดทั้งหมด'
    : '-';
  const reviewMode = cfg
    ? (!cfg.enable_rule_filter ? 'OFF' : 'Rule Filter')
    : '-';

  const cOpened   = todayCounts.EXECUTED ?? 0;
  const cRejected = todayCounts.AI_REJECT ?? 0;
  const cBlocked  = (todayCounts.NEWS ?? 0) + (todayCounts.SESSION ?? 0)
    + (todayCounts.DAILY_LIMIT ?? 0) + (todayCounts.PORTFOLIO_KILL ?? 0);

  const pipeActive = (a: boolean, b: boolean) => a && b;

  return (
    <div className="flex flex-col gap-3 h-full">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 shrink-0">
        <h1 className="lux-h1">Dashboard</h1>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${
          online ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400 agent-pulse' : 'bg-red-500'}`} />
          {online ? 'MT5 ONLINE' : 'OFFLINE'}
        </span>
        {smcRunning && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)] agent-pulse" />
            AUTO TRADE · {symbol}
          </span>
        )}
        {halted && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
            ⚠ DAILY LOSS LIMIT — บอทหยุดเปิดไม้
          </span>
        )}
      </div>

      {/* ── KPI row ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 shrink-0">
        <KPI label="Balance"
          icon="💰" iconColor="#82B1FF" iconBg="rgba(130,177,255,0.15)"
          value={<span style={{ color: '#F0F4FF' }}>${account?.balance?.toLocaleString('en', { minimumFractionDigits: 2 }) ?? '—'}</span>} />
        <KPI label="Equity"
          icon="📊" iconColor="#B39DDB" iconBg="rgba(179,157,219,0.15)"
          value={<span className="text-gradient-gold">${account?.equity?.toLocaleString('en', { minimumFractionDigits: 2 }) ?? '—'}</span>} />
        <KPI label="Floating P/L"
          icon={floatPL >= 0 ? '📈' : '📉'}
          iconColor={floatPL >= 0 ? '#00E676' : '#FF5252'}
          iconBg={floatPL >= 0 ? 'rgba(0,230,118,0.15)' : 'rgba(255,82,82,0.15)'}
          value={
            <span style={{ color: floatPL >= 0 ? '#00E676' : '#FF5252' }}>
              {floatPL >= 0 ? '+' : ''}{floatPL.toFixed(2)}
            </span>
          }
          sub={`${positions.length} ไม้เปิด`} />
        <KPI label="Total Trades"
          icon="⚡" iconColor="#FFD740" iconBg="rgba(255,215,64,0.15)"
          value={<span style={{ color: '#F0F4FF' }}>{account?.trades_total ?? 0}</span>} />
        <KPI label="Today — เปิด / ปฏิเสธ / บล็อก"
          icon="🎯" iconColor="#82B1FF" iconBg="rgba(130,177,255,0.12)"
          value={
            <span className="flex gap-2">
              <span style={{ color: '#00E676' }}>{cOpened}</span>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>/</span>
              <span style={{ color: '#FF5252' }}>{cRejected}</span>
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>/</span>
              <span style={{ color: '#FFD740' }}>{cBlocked}</span>
            </span>
          } />
        <KPI label="Active Zone"
          icon={azActive ? (azBuy ? '🟢' : '🔴') : '⭕'}
          iconColor={azActive ? (azBuy ? '#00E676' : '#FF5252') : 'rgba(255,255,255,0.3)'}
          iconBg={azActive ? (azBuy ? 'rgba(0,230,118,0.12)' : 'rgba(255,82,82,0.12)') : 'rgba(255,255,255,0.06)'}
          value={
            <span style={{ color: azActive ? (azBuy ? '#00E676' : '#FF5252') : 'rgba(255,255,255,0.35)' }}>
              {az ? zoneLabel(az.zone_type) : 'None'}
            </span>
          }
          sub={az && azActive ? `${az.low_limit.toFixed(2)} – ${az.high_limit.toFixed(2)}` : undefined} />
      </div>

      {/* ── Open Positions ─────────────────────────────────── */}
      {positions.length > 0 && (
        <div className="lux-card p-3 shrink-0">
          <p className="lux-title mb-2">Open Positions</p>
          <div className="overflow-x-auto">
            <table className="lux-table text-xs w-full">
              <thead>
                <tr>
                  {['Symbol','Type','Vol','Open','Current','Profit'].map((h) => (
                    <th key={h} className="pb-1.5">{h}</th>
                  ))}
                </tr>
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

      {/* ── Agent Pipeline ─────────────────────────────────── */}
      <div className="lux-card px-4 py-3 shrink-0">
        <p className="lux-title mb-2.5">Live Pipeline</p>
        <div className="flex items-stretch gap-1">
          <PipeNode
            color="#60A5FA" title="Market Structure"
            value={`${biasLabel(latestEvent?.direction)}${latestEvent ? ` · ${latestEvent.type}` : ''}`}
            sub={`OB ${obCount} · FVG ${fvgCount} active`}
            state={latestEvent ? (latestEvent.direction === 'bearish' ? 'warn' : 'active') : 'idle'}
            flash={flash.structure}
          />
          <Arrow active={pipeActive(!!latestEvent, smcRunning)} color="#F59E0B" />
          <PipeNode
            color="#F59E0B" title="SMC Strategy"
            value={smcRunning ? `RUNNING · ${zone?.zone_timeframe ?? 'M5'}` : 'STOPPED'}
            sub={az ? zoneLabel(az.zone_type) : 'กำลังหาโซน'}
            state={smcRunning ? 'active' : 'idle'}
            flash={flash.smc}
          />
          <Arrow active={pipeActive(smcRunning, !!latestReview)} color="#A78BFA" />
          <PipeNode
            color="#A78BFA" title="AI Review"
            value={latestReview ? `${latestReview.signal_type} ${latestReview.pattern} → ${latestReview.decision}` : 'No signal'}
            sub={`${reviewMode} · ✅ ${reviewStats?.approved ?? 0} / ❌ ${reviewStats?.rejected ?? 0}`}
            state={latestReview ? (latestReview.decision === 'APPROVE' ? 'active' : 'warn') : 'idle'}
            flash={flash.review}
          />
          <Arrow active={pipeActive(smcRunning, smcRunning)} color="#F97316" />
          <PipeNode
            color="#F97316" title="Execution"
            value={`Risk ${cfg?.risk_percent ?? '-'}% / ไม้`}
            sub={lastEntry ? `${lastEntry.type} @ ${lastEntry.price} · ${lastEntry.source}` : 'ยังไม่มีไม้'}
            state={smcRunning ? 'active' : 'idle'}
          />
          <Arrow active={pipeActive(positions.length > 0, positions.length > 0)} color="#34D399" />
          <PipeNode
            color="#34D399" title="Trade Mgmt"
            value={mgmtTags}
            sub={`ดูแลอยู่ ${positions.length} ไม้`}
            state={positions.length > 0 ? 'active' : 'idle'}
            flash={flash.portfolio}
          />
        </div>
      </div>

      {/* ── Activity logs ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">

        {/* AI Review log */}
        <div className="lux-card p-4 min-h-0 flex flex-col">
          <p className="lux-title mb-2 shrink-0">Recent Activity — AI Review</p>
          <div className="flex-1 overflow-y-auto min-h-0">
            {(reviewLog?.reviews ?? []).length === 0 ? (
              <p className="text-ink-muted text-sm">ยังไม่มี signal</p>
            ) : (
              <ul className="space-y-0.5">
                {[...(reviewLog?.reviews ?? [])]
                  .sort((a, b) => (a.time < b.time ? 1 : -1))
                  .slice(0, 15)
                  .map((r: AIReviewEntry, i) => (
                    <li key={i} className="flex items-center gap-2 py-1.5 border-b border-[var(--hairline)] text-xs">
                      <span className="text-ink-faint whitespace-nowrap tabular-nums shrink-0">{r.time.slice(5, 16)}</span>
                      <Pill
                        label={r.decision}
                        bg={r.decision === 'APPROVE' ? 'bg-emerald-500/15' : 'bg-red-500/15'}
                        text={r.decision === 'APPROVE' ? 'text-emerald-400' : 'text-red-400'}
                      />
                      <span className="text-ink shrink-0">{r.symbol}</span>
                      <span className="text-ink-muted shrink-0">{r.signal_type} {r.pattern}</span>
                      <span className="text-ink-faint truncate">{r.reason}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        {/* Live decision log */}
        <div className="lux-card p-4 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-2 shrink-0 flex-wrap gap-2">
            <p className="lux-title">บันทึก Live — ทำไมเข้า/ไม่เข้าไม้</p>
            <div className="flex gap-3 text-[10px] tabular-nums">
              <span className="text-emerald-400 font-semibold">เปิด {cOpened}</span>
              <span className="text-red-400 font-semibold">ปฏิเสธ {cRejected}</span>
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

export default DashboardView;
