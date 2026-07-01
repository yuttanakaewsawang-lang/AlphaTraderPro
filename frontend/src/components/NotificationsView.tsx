import React, { useEffect, useState, useCallback } from 'react';
import { Bell, BellOff, RefreshCw } from 'lucide-react';
import api from '../api';

interface Notification {
  id: number;
  time: string;
  symbol: string;
  type: string;
  title: string;
  body: string;
  discord_sent: number;
}

interface NotificationsViewProps {
  symbol: string;
}

// ── type → visual config ─────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  TRADE_OPEN:   { label: 'เปิดไม้',       bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: '🟢' },
  TRADE_CLOSE:  { label: 'ปิดไม้',        bg: 'bg-sky-500/15',     text: 'text-sky-400',     icon: '🏁' },
  PARTIAL_TP:   { label: 'Partial TP',    bg: 'bg-amber-500/15',   text: 'text-amber-400',   icon: '🔶' },
  BREAKEVEN:    { label: 'Breakeven',     bg: 'bg-blue-500/15',    text: 'text-blue-400',    icon: '🔵' },
  TRAIL:        { label: 'Trailing SL',   bg: 'bg-violet-500/15',  text: 'text-violet-400',  icon: '📈' },
  ZONE_NEW:     { label: 'โซนใหม่',       bg: 'bg-orange-500/15',  text: 'text-orange-400',  icon: '📦' },
  ZONE_RETEST:  { label: 'Zone Retest',   bg: 'bg-yellow-500/15',  text: 'text-yellow-400',  icon: '🎯' },
  AI_APPROVE:   { label: 'AI Approve',    bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: '✅' },
  AI_REJECT:    { label: 'AI Reject',     bg: 'bg-red-500/15',     text: 'text-red-400',     icon: '❌' },
  DAILY_LIMIT:  { label: 'Daily Limit',   bg: 'bg-red-500/15',     text: 'text-red-400',     icon: '🚫' },
  SYSTEM:       { label: 'System',        bg: 'bg-white/5',        text: 'text-ink-muted',   icon: 'ℹ️' },
  ERROR:        { label: 'Error',         bg: 'bg-red-500/15',     text: 'text-red-400',     icon: '⚠️' },
};

const getConfig = (type: string) =>
  TYPE_CONFIG[type] ?? { label: type, bg: 'bg-white/5', text: 'text-ink-muted', icon: '•' };

// ── Filter types for tab bar ─────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'ALL',       label: 'ทั้งหมด' },
  { key: 'TRADE',     label: 'Trade' },
  { key: 'ZONE',      label: 'Zone' },
  { key: 'MANAGE',    label: 'Trade Mgmt' },
  { key: 'SYSTEM',    label: 'System' },
];

const matchesFilter = (n: Notification, filter: string) => {
  if (filter === 'ALL') return true;
  if (filter === 'TRADE')  return n.type === 'TRADE_OPEN' || n.type === 'TRADE_CLOSE';
  if (filter === 'ZONE')   return n.type === 'ZONE_NEW' || n.type === 'ZONE_RETEST';
  if (filter === 'MANAGE') return ['PARTIAL_TP', 'BREAKEVEN', 'TRAIL'].includes(n.type);
  if (filter === 'SYSTEM') return ['SYSTEM', 'ERROR', 'DAILY_LIMIT'].includes(n.type);
  return true;
};

const NotificationsView: React.FC<NotificationsViewProps> = ({ symbol }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [allSymbols, setAllSymbols] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Notification[]>('/api/notifications', {
        params: { symbol: allSymbols ? '' : symbol, limit: 100 },
      });
      setNotifications(res.data ?? []);
    } catch (e) {
      console.error('Failed to load notifications', e);
    } finally {
      setLoading(false);
    }
  }, [symbol, allSymbols]);

  useEffect(() => {
    fetchNotifications();
    const iv = setInterval(fetchNotifications, 8000);
    return () => clearInterval(iv);
  }, [fetchNotifications]);

  const filtered = notifications.filter((n) => matchesFilter(n, filter));

  // summary counts
  const countByType = (types: string[]) =>
    notifications.filter((n) => types.includes(n.type)).length;

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <Bell size={18} className="text-[var(--accent-blue)]" />
        <h1 className="lux-h1">Notifications</h1>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allSymbols}
            onChange={(e) => setAllSymbols(e.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--accent-blue)]"
          />
          ทุก symbol
        </label>
        <button
          onClick={fetchNotifications}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs lux-btn-ghost disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Summary KPI strip ────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
        {[
          { label: 'Trade Open/Close', count: countByType(['TRADE_OPEN', 'TRADE_CLOSE']), color: 'text-emerald-400' },
          { label: 'Partial/BE/Trail',  count: countByType(['PARTIAL_TP', 'BREAKEVEN', 'TRAIL']), color: 'text-amber-400' },
          { label: 'Zone Events',       count: countByType(['ZONE_NEW', 'ZONE_RETEST']), color: 'text-orange-400' },
          { label: 'AI / System',       count: countByType(['AI_APPROVE', 'AI_REJECT', 'SYSTEM', 'ERROR', 'DAILY_LIMIT']), color: 'text-red-400' },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--color-surface-2)] border border-[var(--hairline)] rounded-lg px-4 py-2.5">
            <p className="text-[9px] uppercase tracking-widest text-ink-faint mb-1">{s.label}</p>
            <p className={`font-bold text-lg tabular-nums ${s.color}`}>{s.count}</p>
          </div>
        ))}
      </div>

      {/* ── Filter tabs ──────────────────────────────────────── */}
      <div className="flex gap-1 shrink-0">
        {FILTER_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              filter === t.key
                ? 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30'
                : 'text-ink-muted hover:text-ink hover:bg-white/5 border border-transparent'
            }`}
          >
            {t.label}
            {t.key !== 'ALL' && (
              <span className="ml-1.5 tabular-nums text-ink-faint">
                ({notifications.filter((n) => matchesFilter(n, t.key)).length})
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] text-ink-faint self-center tabular-nums">{filtered.length} รายการ</span>
      </div>

      {/* ── Notification list ────────────────────────────────── */}
      <div className="lux-card flex-1 min-h-0 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-ink-faint">
            <BellOff size={28} />
            <p className="text-sm">ยังไม่มี notification</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {filtered.map((n) => {
              const cfg = getConfig(n.type);
              const isWin  = n.type === 'TRADE_CLOSE' && n.title.includes('WIN');
              const isLoss = n.type === 'TRADE_CLOSE' && n.title.includes('LOSS');
              return (
                <li
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors ${
                    isWin ? 'border-l-2 border-emerald-500/50' :
                    isLoss ? 'border-l-2 border-red-500/50' : ''
                  }`}
                >
                  {/* icon */}
                  <span className="text-base shrink-0 mt-0.5">{cfg.icon}</span>

                  {/* content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {/* type badge */}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      {/* symbol */}
                      {n.symbol && (
                        <span className="text-[10px] text-ink-faint font-mono">{n.symbol}</span>
                      )}
                      {/* discord sent */}
                      {n.discord_sent ? (
                        <span className="text-[9px] text-[#5865F2] bg-[#5865F2]/10 px-1 py-0.5 rounded">Discord ✓</span>
                      ) : null}
                    </div>
                    <p className="text-sm text-ink font-medium truncate">{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-ink-faint mt-0.5 truncate">{n.body}</p>
                    )}
                  </div>

                  {/* time */}
                  <span className="text-[10px] text-ink-faint tabular-nums whitespace-nowrap shrink-0 mt-0.5">
                    {n.time.slice(5, 16)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default NotificationsView;
