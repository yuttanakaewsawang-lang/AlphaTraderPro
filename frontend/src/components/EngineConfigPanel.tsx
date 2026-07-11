import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../api';

// หน้า config รวมของกลยุทธ์ใหม่ 3 ตัว (Swing/Reversal/Grid) — โครงเดียวกับ SniperConfigPanel
// แต่ field/สี/endpoint ขับเคลื่อนด้วยนิยามต่อ engine (ENGINE_DEFS) แทนการ copy ไฟล์ละชุด
// ค่า RECOMMENDED = default จาก sweep 6 เดือน XAUUSD (ดู changelog CLAUDE.md)

const CONFIG_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1'];

const SESSION_OPTIONS: { id: string; th: string }[] = [
  { id: 'Tokyo', th: '06:00–15:00' },
  { id: 'London', th: '14:00–23:00' },
  { id: 'NY', th: '19:00–04:00' },
  { id: 'Sydney', th: '04:00–13:00' },
];

interface FieldDef {
  key: string;
  label: string;
  desc?: string;
  step?: string;
  group: 'risk' | 'entry';
  toggle?: boolean;
  hideWhen?: (form: Record<string, string>) => boolean;
}

interface EngineDef {
  title: string;
  color: string;          // สีประจำกลยุทธ์ (accent แท็บ entry)
  endpoint: string;       // /api/<engine>/config
  recommended: Record<string, string | number>;
  fields: FieldDef[];
  warning?: string;       // banner คำเตือน (grid)
}

const RISK_FIELDS_COMMON: FieldDef[] = [
  { key: 'risk_percent', label: 'Risk per Trade (%)', desc: '% ของ balance ที่ยอมเสียต่อไม้', step: '0.1', group: 'risk' },
  { key: 'max_trades_per_day', label: 'Max Trades / Day', desc: 'จำนวนไม้สูงสุดที่เปิดได้ต่อวัน', group: 'risk' },
  { key: 'max_daily_loss_percent', label: 'Max Daily Loss (%)', desc: 'หยุดเทรดทันทีเมื่อขาดทุนถึง % นี้ในวันนั้น', step: '0.1', group: 'risk' },
  { key: 'max_portfolio_drawdown_pct', label: 'Portfolio DD Stop (%)', desc: 'หยุดระบบเมื่อ drawdown รวมถึง % (0 = ปิดใช้)', step: '0.5', group: 'risk' },
  { key: 'max_spread_points', label: 'Max Spread (pts)', desc: 'ข้าม signal ถ้า spread เกินค่านี้', group: 'risk' },
  { key: 'news_filter_minutes', label: 'News Filter (±นาที)', desc: 'ล็อคไม่ให้เทรดก่อน/หลังข่าว (0 = ปิด)', step: '5', group: 'risk' },
];

const TREND_FIELDS: FieldDef[] = [
  { key: 'use_trend_filter', label: 'Trend Filter', desc: 'เข้าเฉพาะทิศเดียวกับเทรนด์ TF ใหญ่', group: 'entry', toggle: true },
  { key: 'trend_filter_mode', label: 'Filter Mode', desc: '0 = EMA50 · 1 = HH/HL Structure', step: '1', group: 'entry', hideWhen: (f) => !Number(f.use_trend_filter) },
  { key: 'swing_lookback', label: 'Swing Lookback', desc: 'จำนวนแท่งรอบข้างที่ใช้นับ swing high/low', group: 'entry', hideWhen: (f) => !Number(f.use_trend_filter) },
];

const ENGINE_DEFS: Record<string, EngineDef> = {
  swing: {
    title: 'Swing Trade (Trend Pullback) Monitor',
    color: '#40C8E0',
    endpoint: '/api/swing/config',
    recommended: {
      entry_timeframe: 'M30', pullback_ema: 20, sl_lookback_bars: 10, buffer_atr: 0.15,
      buffer_points: 15, min_sl_atr: 0.5, rr: 3.0, risk_percent: 1.0, max_trades_per_day: 5,
      max_daily_loss_percent: 15.0, max_portfolio_drawdown_pct: 20.0, max_spread_points: 15,
      use_trend_filter: 1, trend_filter_mode: 1, swing_lookback: 2, news_filter_minutes: 30,
      trade_sessions: '',
    },
    fields: [
      ...RISK_FIELDS_COMMON,
      { key: 'pullback_ema', label: 'Pullback EMA', desc: 'รอราคาย่อมาแตะ EMA เส้นนี้ก่อนเข้า', group: 'entry' },
      { key: 'sl_lookback_bars', label: 'SL Lookback (bars)', desc: 'วาง SL เลย swing low/high ของ N แท่งล่าสุด', group: 'entry' },
      { key: 'rr', label: 'TP Ratio (RR)', desc: 'TP = entry ± RR × ระยะ SL (sweep 6 เดือน: 3.0 ดีสุดบน M30)', step: '0.5', group: 'entry' },
      { key: 'buffer_atr', label: 'SL Buffer ATR×', desc: 'ระยะ buffer เลย swing = ATR × ค่านี้ (0 = ใช้ pts)', step: '0.1', group: 'entry' },
      { key: 'buffer_points', label: 'SL Buffer (pts)', desc: 'fallback ถ้า ATR ใช้ไม่ได้', group: 'entry', hideWhen: (f) => Number(f.buffer_atr) > 0 },
      { key: 'min_sl_atr', label: 'Min SL ATR×', desc: 'SL ต้องห่างจาก entry อย่างน้อย ATR × ค่านี้', step: '0.1', group: 'entry' },
      ...TREND_FIELDS,
    ],
  },
  reversal: {
    title: 'Reversal (RSI Extreme) Monitor',
    color: '#FF9F0A',
    endpoint: '/api/reversal/config',
    recommended: {
      entry_timeframe: 'M5', rsi_period: 14, rsi_buy_level: 30, rsi_sell_level: 70,
      extreme_lookback_bars: 20, require_engulfing: 0, buffer_atr: 0.15, buffer_points: 15,
      min_sl_atr: 0.5, rr: 2.0, risk_percent: 1.0, max_trades_per_day: 5,
      max_daily_loss_percent: 15.0, max_portfolio_drawdown_pct: 20.0, max_spread_points: 15,
      use_trend_filter: 1, trend_filter_mode: 1, swing_lookback: 2, news_filter_minutes: 30,
      trade_sessions: '',
    },
    fields: [
      ...RISK_FIELDS_COMMON,
      { key: 'rsi_period', label: 'RSI Period', desc: 'จำนวนแท่งคำนวณ RSI', group: 'entry' },
      { key: 'rsi_buy_level', label: 'RSI Oversold (BUY ≤)', desc: 'RSI ต่ำกว่านี้ = รอกลับตัวขึ้น', step: '1', group: 'entry' },
      { key: 'rsi_sell_level', label: 'RSI Overbought (SELL ≥)', desc: 'RSI สูงกว่านี้ = รอกลับตัวลง', step: '1', group: 'entry' },
      { key: 'extreme_lookback_bars', label: 'Extreme Lookback (bars)', desc: 'แท่งสุดขั้วต้องเป็น low/high สุดในรอบ N แท่ง (pivot)', group: 'entry' },
      { key: 'rr', label: 'TP Ratio (RR)', desc: 'TP = entry ± RR × ระยะ SL', step: '0.5', group: 'entry' },
      { key: 'buffer_atr', label: 'SL Buffer ATR×', desc: 'buffer เลยปลาย extreme = ATR × ค่านี้', step: '0.1', group: 'entry' },
      { key: 'buffer_points', label: 'SL Buffer (pts)', desc: 'fallback ถ้า ATR ใช้ไม่ได้', group: 'entry', hideWhen: (f) => Number(f.buffer_atr) > 0 },
      { key: 'min_sl_atr', label: 'Min SL ATR×', desc: 'SL ต้องห่างจาก entry อย่างน้อย ATR × ค่านี้', step: '0.1', group: 'entry' },
      { key: 'require_engulfing', label: 'Require Engulfing', desc: 'บังคับแท่งยืนยันกลืน body แท่งสุดขั้ว (sweep: ปิดแล้วดีกว่า)', group: 'entry', toggle: true },
      ...TREND_FIELDS.map((f) => f.key === 'use_trend_filter'
        ? { ...f, desc: 'เข้าเฉพาะกลับตัวไปทิศเทรนด์ TF ใหญ่ — backtest: ปิดแล้วขาดทุนทุก config ไม่แนะนำให้ปิด' }
        : f),
    ],
  },
  grid: {
    title: 'Grid Martingale Monitor',
    color: '#BF5AF2',
    endpoint: '/api/grid/config',
    warning: 'ความเสี่ยงสูง: backtest XAUUSD ม.ค.–มิ.ย. 2026 (เทรนด์แรง) ติดลบทุก config — เหมาะเฉพาะตลาด sideways · แนะนำบัญชี demo เท่านั้น',
    recommended: {
      entry_timeframe: 'M15', base_lot: 0.01, lot_multiplier: 1.5, grid_step_atr: 2.0,
      grid_step_points: 300, max_grid_levels: 3, basket_tp_atr: 0.5, basket_tp_points: 150,
      basket_sl_percent: 15.0, direction_mode: 0, cooldown_bars: 30, max_baskets_per_day: 10,
      max_daily_loss_percent: 15.0, max_portfolio_drawdown_pct: 20.0, max_spread_points: 15,
      news_filter_minutes: 30, trade_sessions: '',
    },
    fields: [
      { key: 'base_lot', label: 'Base Lot', desc: 'lot ไม้แรกของตะกร้า (คงที่ ไม่ใช่ % risk)', step: '0.01', group: 'risk' },
      { key: 'basket_sl_percent', label: 'Basket Stop (%)', desc: 'ตัดขาดทุนทั้งตะกร้าเมื่อ floating เกิน % ของ balance — ห้ามตั้ง 0', step: '1', group: 'risk' },
      { key: 'max_baskets_per_day', label: 'Max Baskets / Day', desc: 'จำนวนตะกร้าสูงสุดต่อวัน', group: 'risk' },
      { key: 'cooldown_bars', label: 'Cooldown (bars)', desc: 'พักกี่แท่งหลังโดนตัดตะกร้า กันเข้าซ้ำกลางเทรนด์เดิม', group: 'risk' },
      { key: 'max_daily_loss_percent', label: 'Max Daily Loss (%)', desc: 'หยุดเทรดทันทีเมื่อขาดทุนถึง % นี้ในวันนั้น', step: '0.1', group: 'risk' },
      { key: 'max_portfolio_drawdown_pct', label: 'Portfolio DD Stop (%)', desc: 'หยุดระบบเมื่อ drawdown รวมถึง %', step: '0.5', group: 'risk' },
      { key: 'max_spread_points', label: 'Max Spread (pts)', desc: 'ไม่เปิดตะกร้าใหม่ถ้า spread เกิน', group: 'risk' },
      { key: 'news_filter_minutes', label: 'News Filter (±นาที)', desc: 'ไม่เปิดตะกร้าใหม่รอบข่าว (0 = ปิด)', step: '5', group: 'risk' },
      { key: 'grid_step_atr', label: 'Grid Step ATR×', desc: 'ระยะห่างระหว่างชั้น = ATR × ค่านี้ (fix ตอนเปิดตะกร้า)', step: '0.5', group: 'entry' },
      { key: 'grid_step_points', label: 'Grid Step (pts)', desc: 'fallback ถ้า ATR ใช้ไม่ได้', group: 'entry', hideWhen: (f) => Number(f.grid_step_atr) > 0 },
      { key: 'lot_multiplier', label: 'Lot Multiplier', desc: 'lot ชั้นถัดไป = ชั้นก่อน × ค่านี้', step: '0.1', group: 'entry' },
      { key: 'max_grid_levels', label: 'Max Levels', desc: 'จำนวนไม้สูงสุดในตะกร้า (รวมไม้แรก)', group: 'entry' },
      { key: 'basket_tp_atr', label: 'Basket TP ATR×', desc: 'TP = ราคาเฉลี่ยถ่วง lot ± ATR × ค่านี้', step: '0.1', group: 'entry' },
      { key: 'basket_tp_points', label: 'Basket TP (pts)', desc: 'fallback ถ้า ATR ใช้ไม่ได้', group: 'entry', hideWhen: (f) => Number(f.basket_tp_atr) > 0 },
      { key: 'direction_mode', label: 'Direction Mode', desc: '0 = ตาม EMA50 (ถัวย่อในเทรนด์) · 1 = สวน EMA50', step: '1', group: 'entry' },
    ],
  },
};

interface Position {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  price_open: number;
  price_current: number;
  profit: number;
}

const EngineConfigPanel: React.FC<{ engine: 'swing' | 'reversal' | 'grid'; symbol: string }> = ({ engine, symbol }) => {
  const def = ENGINE_DEFS[engine];
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [entryTf, setEntryTf] = useState(String(def.recommended.entry_timeframe));
  const [sessions, setSessions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'risk' | 'entry'>('risk');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const loadedSymbolRef = useRef<string | null>(null);

  const applyConfig = (c: Record<string, any>) => {
    setForm(Object.fromEntries(def.fields.map((f) => [f.key, String(c[f.key])])));
    setEntryTf(c.entry_timeframe);
    setSessions((c.trade_sessions || '').split(',').map((s: string) => s.trim()).filter(Boolean));
    setSaved(false);
    loadedSymbolRef.current = symbol;
  };

  useEffect(() => {
    loadedSymbolRef.current = null;
    api.get(def.endpoint, { params: { symbol } })
      .then((res) => { setConfig(res.data); if (loadedSymbolRef.current !== symbol) applyConfig(res.data); })
      .catch(() => {});
  }, [symbol, engine]); // eslint-disable-line

  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const res = await api.get<Position[]>('/api/positions', { params: { symbol } });
        setPositions(res.data);
      } catch {}
    };
    fetchPositions();
    const interval = setInterval(fetchPositions, 3000);
    return () => clearInterval(interval);
  }, [symbol]);

  const buildPayload = (src: Record<string, string>, tf: string, sess: string) => {
    const payload: Record<string, number | string> = Object.fromEntries(
      def.fields.map((f) => [f.key, Number(src[f.key])])
    );
    payload.entry_timeframe = tf;
    payload.trade_sessions = sess;
    return payload;
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const res = await api.post(def.endpoint, buildPayload(form, entryTf, sessions.join(',')), { params: { symbol } });
      setConfig(res.data.config);
      applyConfig(res.data.config);
      setSaved(true);
    } catch (err: any) {
      setSaveError(String(err?.response?.data?.detail ?? err?.message ?? 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    if (!confirm('Reset ค่า config กลับเป็น Recommended Default?\n(ค่าที่ backtest 6 เดือน XAUUSD เลือกให้)')) return;
    setResetting(true);
    setSaved(false);
    try {
      const newForm: Record<string, string> = { ...form };
      for (const [k, v] of Object.entries(def.recommended)) {
        if (k !== 'entry_timeframe' && k !== 'trade_sessions') newForm[k] = String(v);
      }
      setForm(newForm);
      const tf = String(def.recommended.entry_timeframe);
      setEntryTf(tf);
      setSessions([]);
      const res = await api.post(def.endpoint, buildPayload(newForm, tf, ''), { params: { symbol } });
      setConfig(res.data.config);
      setSaved(true);
    } catch {} finally {
      setResetting(false);
    }
  };

  const GROUPS: { id: 'risk' | 'entry'; label: string; color: string; accent: string }[] = [
    { id: 'risk', label: 'ความเสี่ยง', color: 'text-red-400', accent: 'bg-red-500/10' },
    { id: 'entry', label: 'จุดเข้า', color: 'text-amber-400', accent: 'bg-amber-500/10' },
  ];

  return (
    <div className="ios-fade-in flex flex-col gap-3 h-full overflow-hidden">
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <h1 className="lux-h1">{def.title}</h1>
      </div>

      {def.warning && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-[11px] leading-relaxed shrink-0"
          style={{ color: '#FF9F0A', background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.25)' }}>
          <AlertTriangle size={14} strokeWidth={2.3} className="shrink-0 mt-0.5" />
          <span>{def.warning}</span>
        </div>
      )}

      {positions.length > 0 && (
        <div className="lux-card px-4 py-3 shrink-0">
          <table className="lux-table text-xs">
            <thead>
              <tr>
                <th className="pr-3">Ticket</th><th className="pr-3">Type</th><th className="pr-3">Lot</th>
                <th className="pr-3">Entry</th><th className="pr-3">Current</th><th className="pr-3">P/L ($)</th><th></th>
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
                      onClick={() => api.post(`/api/close/${p.ticket}`).catch(() => {})}
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
            <p className="lux-title">Configuration</p>
            <div className="flex items-center gap-2">
              <label className="lux-label">Entry TF</label>
              <select value={entryTf} onChange={(e) => { setSaved(false); setEntryTf(e.target.value); }} className="h-7 lux-input px-2 text-sm">
                {CONFIG_TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-1 mx-4 mt-3 mb-1 p-1 rounded-xl shrink-0" style={{ background: 'var(--color-surface-3)' }}>
            {GROUPS.map((g) => (
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
              const numerics = def.fields.filter((f) => f.group === activeTab && !f.toggle && !f.hideWhen?.(form));
              if (numerics.length === 0) return null;
              return (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {numerics.map((f) => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="flex items-center gap-1.5 lux-label">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: activeTab === 'risk' ? '#FF453A' : def.color }} />
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
              const toggles = def.fields.filter((f) => f.group === activeTab && f.toggle);
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
              title="Reset เป็นค่า Recommended จาก backtest 6 เดือน"
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

export default EngineConfigPanel;
