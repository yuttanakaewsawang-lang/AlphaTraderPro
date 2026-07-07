import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../api';
import type { SniperConfig } from '../types/strategy';

const CONFIG_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1'];

const SESSION_OPTIONS: { id: string; th: string }[] = [
  { id: 'Tokyo', th: '06:00–15:00' },
  { id: 'London', th: '14:00–23:00' },
  { id: 'NY', th: '19:00–04:00' },
  { id: 'Sydney', th: '04:00–13:00' },
];

// ค่าเดียวกับ default ใน SniperStrategy.__init__ — ชุดที่ backtest 12 เดือน XAUUSD ยืนยันว่าดีที่สุด
const RECOMMENDED_DEFAULTS: Partial<Record<string, string | number>> = {
  entry_timeframe: 'M15', breakout_lookback_bars: 20, buffer_atr: 0.15, buffer_points: 15,
  min_sl_atr: 0.5, risk_percent: 1.0, max_trades_per_day: 10, max_daily_loss_percent: 15.0,
  max_portfolio_drawdown_pct: 20.0, max_spread_points: 15.0, use_trend_filter: 1,
  trend_filter_mode: 1, swing_lookback: 2, news_filter_minutes: 30, trade_sessions: '',
};

const CONFIG_FIELDS: {
  key: keyof SniperConfig;
  label: string;
  desc?: string;
  step?: string;
  group: 'risk' | 'breakout';
  toggle?: boolean;
  hideWhen?: (form: Record<string, string>) => boolean;
}[] = [
  // ── ความเสี่ยง & ลิมิต ──
  { key: 'risk_percent', label: 'Risk per Trade (%)', desc: '% ของ balance ที่ยอมเสียต่อไม้', step: '0.1', group: 'risk' },
  { key: 'max_trades_per_day', label: 'Max Trades / Day', desc: 'จำนวนไม้สูงสุดที่เปิดได้ต่อวัน', group: 'risk' },
  { key: 'max_daily_loss_percent', label: 'Max Daily Loss (%)', desc: 'หยุดเทรดทันทีเมื่อขาดทุนถึง % นี้ในวันนั้น', step: '0.1', group: 'risk' },
  { key: 'max_portfolio_drawdown_pct', label: 'Portfolio DD Stop (%)', desc: 'หยุดระบบเมื่อ drawdown รวมถึง % (0 = ปิดใช้)', step: '0.5', group: 'risk' },
  { key: 'max_spread_points', label: 'Max Spread (pts)', desc: 'ข้าม signal ถ้า spread เกินค่านี้', group: 'risk' },
  { key: 'news_filter_minutes', label: 'News Filter (±นาที)', desc: 'ล็อคไม่ให้เทรดก่อน/หลังข่าว (0 = ปิด)', step: '5', group: 'risk' },

  // ── Breakout ──
  { key: 'breakout_lookback_bars', label: 'Breakout Lookback (bars)', desc: 'ทะลุ high/low ของ N แท่งก่อนหน้า', group: 'breakout' },
  { key: 'buffer_atr', label: 'SL Buffer ATR×', desc: 'ระยะ buffer เลยแท่ง breakout = ATR × ค่านี้ (0 = ใช้ pts)', step: '0.1', group: 'breakout' },
  { key: 'buffer_points', label: 'SL Buffer (pts)', desc: 'fallback ถ้า ATR ใช้ไม่ได้', group: 'breakout', hideWhen: (f) => Number(f.buffer_atr) > 0 },
  { key: 'min_sl_atr', label: 'Min SL ATR×', desc: 'SL ต้องห่างจาก entry อย่างน้อย ATR × ค่านี้ (0 = ปิด)', step: '0.1', group: 'breakout' },
  { key: 'use_trend_filter', label: 'Trend Filter', desc: 'กรองทิศทางตาม H1 bias ก่อนเข้าไม้ (backtest 12mo: expectancy เพิ่มเกือบเท่าตัว)', group: 'breakout', toggle: true },
  { key: 'trend_filter_mode', label: 'Filter Mode', desc: '0 = EMA50 (H1) · 1 = HH/HL Structure (H1)', step: '1', group: 'breakout', hideWhen: (f) => !Number(f.use_trend_filter) },
  { key: 'swing_lookback', label: 'Swing Lookback', desc: 'จำนวนแท่งรอบข้างที่ใช้นับ swing high/low', group: 'breakout', hideWhen: (f) => !Number(f.use_trend_filter) },
];

const CONFIG_GROUPS: { id: 'risk' | 'breakout'; label: string; color: string; accent: string }[] = [
  { id: 'risk', label: 'ความเสี่ยง', color: 'text-red-400', accent: 'bg-red-500/10' },
  { id: 'breakout', label: 'จุดเข้า Breakout', color: 'text-amber-400', accent: 'bg-amber-500/10' },
];

const GROUP_DOT: Record<string, string> = { risk: 'bg-red-400', breakout: 'bg-amber-400' };

interface Position {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  price_open: number;
  price_current: number;
  profit: number;
}

const SniperConfigPanel: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [config, setConfig] = useState<SniperConfig | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [entryTf, setEntryTf] = useState('M15');
  const [sessions, setSessions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'risk' | 'breakout'>('risk');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const loadedSymbolRef = useRef<string | null>(null);

  const applyConfig = (c: SniperConfig) => {
    setForm(Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, String(c[f.key])])));
    setEntryTf(c.entry_timeframe);
    setSessions((c.trade_sessions || '').split(',').map((s) => s.trim()).filter(Boolean));
    setSaved(false);
    loadedSymbolRef.current = symbol;
  };

  useEffect(() => {
    loadedSymbolRef.current = null;
    api.get<SniperConfig>('/api/sniper/config', { params: { symbol } })
      .then((res) => { setConfig(res.data); if (loadedSymbolRef.current !== symbol) applyConfig(res.data); })
      .catch(() => {});
  }, [symbol]); // eslint-disable-line

  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const res = await api.get<Position[]>('/api/positions', { params: { symbol } });
        setPositions(res.data);
      } catch (err) {
        console.error('Failed to load positions', err);
      }
    };
    fetchPositions();
    const interval = setInterval(fetchPositions, 3000);
    return () => clearInterval(interval);
  }, [symbol]);

  const handleClosePosition = async (ticket: number) => {
    try {
      await api.post(`/api/close/${ticket}`);
    } catch (err) {
      console.error('Failed to close position', err);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const payload: Record<string, number | string> = Object.fromEntries(
        CONFIG_FIELDS.map((f) => [f.key, f.key === 'entry_timeframe' ? entryTf : Number(form[f.key])])
      );
      payload.entry_timeframe = entryTf;
      payload.trade_sessions = sessions.join(',');
      const res = await api.post('/api/sniper/config', payload, { params: { symbol } });
      setConfig(res.data.config);
      applyConfig(res.data.config);
      setSaved(true);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'Unknown error';
      setSaveError(String(detail));
      console.error('Failed to save sniper config', err);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    if (!confirm('Reset ค่า config กลับเป็น Recommended Default?\n(ค่าจาก backtest 12 เดือน XAUUSD — M15 + Trend Filter)')) return;
    setResetting(true);
    setSaved(false);
    try {
      const newForm = { ...form };
      for (const [k, v] of Object.entries(RECOMMENDED_DEFAULTS)) {
        if (k !== 'entry_timeframe' && k !== 'trade_sessions') newForm[k] = String(v);
      }
      setForm(newForm);
      setEntryTf(String(RECOMMENDED_DEFAULTS.entry_timeframe ?? 'M15'));
      setSessions([]);
      const payload: Record<string, number | string> = Object.fromEntries(
        CONFIG_FIELDS.map((f) => [f.key, f.key === 'entry_timeframe' ? String(RECOMMENDED_DEFAULTS.entry_timeframe ?? 'M15') : Number(newForm[f.key])])
      );
      payload.trade_sessions = '';
      const res = await api.post('/api/sniper/config', payload, { params: { symbol } });
      setConfig(res.data.config);
      setSaved(true);
    } catch (err) {
      console.error('Failed to reset sniper config', err);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="ios-fade-in flex flex-col gap-3 h-full overflow-hidden">
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <h1 className="lux-h1">Sniper (N-bar Breakout) Monitor</h1>
      </div>

      {positions.length > 0 && (
        <div className="lux-card px-4 py-3 shrink-0">
          <table className="lux-table text-xs">
            <thead>
              <tr>
                <th className="pr-3">Ticket</th>
                <th className="pr-3">Type</th>
                <th className="pr-3">Lot</th>
                <th className="pr-3">Entry</th>
                <th className="pr-3">Current</th>
                <th className="pr-3">P/L ($)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.ticket} className="text-ink">
                  <td className="pr-3 text-ink-faint tabular-nums">{p.ticket}</td>
                  <td className="pr-3">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${p.type === 'BUY' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                      {p.type}
                    </span>
                  </td>
                  <td className="pr-3 tabular-nums">{p.volume}</td>
                  <td className="pr-3 text-ink-muted tabular-nums">{p.price_open}</td>
                  <td className={`pr-3 tabular-nums ${p.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{p.price_current}</td>
                  <td className={`pr-3 font-semibold tabular-nums ${p.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {p.profit >= 0 ? '+' : ''}{p.profit.toFixed(2)}
                  </td>
                  <td>
                    <button
                      onClick={() => handleClosePosition(p.ticket)}
                      className="ios-pressable text-red-400 hover:text-red-300 text-xs border border-red-500/40 hover:border-red-500/70 rounded-full px-2.5 py-0.5"
                    >
                      CLOSE
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {config && (
        <div className="lux-card flex flex-col min-h-0 flex-1">
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 pt-4 pb-3 border-b border-[var(--hairline)] shrink-0">
            <p className="lux-title">Sniper Configuration</p>
            <div className="flex items-center gap-2">
              <label className="lux-label">Entry TF</label>
              <select value={entryTf} onChange={(e) => { setSaved(false); setEntryTf(e.target.value); }} className="h-7 lux-input px-2 text-sm">
                {CONFIG_TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-1 mx-4 mt-3 mb-1 p-1 rounded-xl shrink-0" style={{ background: 'var(--color-surface-3)' }}>
            {CONFIG_GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveTab(g.id)}
                className={`ios-pressable flex-1 px-3 py-1.5 text-sm font-medium rounded-lg ${
                  activeTab === g.id ? `${g.accent} ${g.color}` : 'text-ink-muted'
                }`}
                style={{ transition: 'background-color 0.25s var(--ease-ios), color 0.25s var(--ease-ios)' }}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {(() => {
              const numerics = CONFIG_FIELDS.filter((f) => f.group === activeTab && !f.toggle && !f.hideWhen?.(form));
              if (numerics.length === 0) return null;
              return (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {numerics.map((f) => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="flex items-center gap-1.5 lux-label">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${GROUP_DOT[activeTab]}`} />
                        {f.label}
                      </label>
                      <input
                        type="number"
                        step={f.step ?? '1'}
                        value={form[f.key] ?? ''}
                        onChange={(e) => { setSaved(false); setForm((prev) => ({ ...prev, [f.key]: e.target.value })); }}
                        className="lux-input px-2 py-1.5 text-sm"
                      />
                      {f.desc && <p className="text-[11px] text-ink-faint leading-tight">{f.desc}</p>}
                    </div>
                  ))}
                </div>
              );
            })()}

            {(() => {
              const toggles = CONFIG_FIELDS.filter((f) => f.group === activeTab && f.toggle);
              if (toggles.length === 0) return null;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {toggles.map((f) => {
                    const on = Number(form[f.key]) > 0;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => { setSaved(false); setForm((prev) => ({ ...prev, [f.key]: on ? '0' : '1' })); }}
                        className={`ios-pressable flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border text-left transition-colors ${
                          on ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-[var(--color-surface-2)] border-[var(--hairline)] text-ink-muted'
                        }`}
                      >
                        <span className="text-sm font-medium">{f.label}</span>
                        {f.desc && <span className="text-[11px] text-ink-faint leading-tight">{f.desc}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {activeTab === 'risk' && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400/80">Trading Session (เวลาไทย)</p>
                <div className="flex flex-wrap items-center gap-3">
                  {SESSION_OPTIONS.map((s) => {
                    const on = sessions.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setSaved(false); setSessions((prev) => on ? prev.filter((x) => x !== s.id) : [...prev, s.id]); }}
                        className={`flex flex-col items-center px-4 py-1.5 rounded-xl border text-sm transition-colors ${
                          on ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-[var(--color-surface-2)] border-[var(--hairline)] text-ink-muted'
                        }`}
                      >
                        <span className="font-medium">{s.id}</span>
                        <span className="text-[10px] text-ink-faint tabular-nums">{s.th}</span>
                      </button>
                    );
                  })}
                  {sessions.length === 0 && <span className="text-ink-faint text-xs">(เทรดทุกเวลา)</span>}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-t border-[var(--hairline)] shrink-0">
            <button onClick={handleSaveConfig} disabled={saving} className="px-6 py-2 lux-btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Config'}
            </button>
            <button
              onClick={handleResetDefault}
              disabled={resetting}
              className="ios-pressable flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
              title="Reset เป็นค่า Recommended จาก backtest 12 เดือน"
            >
              <RotateCcw size={13} strokeWidth={2.2} className={resetting ? 'animate-spin' : ''} />
              {resetting ? 'Resetting...' : 'Recommended Default'}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: '#30D158' }}>
                <CheckCircle2 size={14} strokeWidth={2.3} /> Saved
              </span>
            )}
            {saveError && (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: '#FF453A' }}>
                <AlertTriangle size={14} strokeWidth={2.3} /> Error: {saveError}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SniperConfigPanel;
