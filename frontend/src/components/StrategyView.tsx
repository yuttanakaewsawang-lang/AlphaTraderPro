import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../api';
import type { StrategyConfig, ZoneResponse } from '../types/strategy';
import SniperConfigPanel from './SniperConfigPanel';

// TF ที่เลือกได้สำหรับ zone/entry ใน Strategy Configuration (ต้องตรงกับ TIMEFRAME_LABELS ฝั่ง backend)
const CONFIG_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1'];

// Session ที่เลือกเทรดได้ (id ต้องตรงกับ filters.SESSIONS ฝั่ง backend ซึ่งเทียบเป็น UTC)
// th = ช่วงเวลาประเทศไทย (UTC+7) แสดงให้ผู้ใช้อ่านง่าย — ไม่กระทบ logic ที่ยังคิดด้วย UTC
const SESSION_OPTIONS: { id: string; th: string }[] = [
  { id: 'Tokyo', th: '06:00–15:00' },
  { id: 'London', th: '14:00–23:00' },
  { id: 'NY', th: '19:00–04:00' },
  { id: 'Sydney', th: '04:00–13:00' },
];

// Default config จาก backtest 12 เดือน (XAUUSD) ให้ผลดีที่สุด: +$1661, win 57.5%, maxDD -10.9%, หัก spread 11
// ปิด engulfing/trend/rule/trailing, RR 3.5, OB on, zone 0.3, buffer 0.05, partial+BE on
const RECOMMENDED_DEFAULTS: Partial<Record<string, string | number>> = {
  risk_percent: 1, tp_ratio_rr: 3.5, max_trades_per_day: 10, max_daily_loss_percent: 15,
  max_portfolio_drawdown_pct: 20, max_spread_points: 15, news_filter_minutes: 30,
  retrain_interval_days: 30, zone_expiry_bars: 50, zone_atr_mult: 0.3,
  min_candle_atr: 0.3, max_candle_atr: 2.5, buffer_atr: 0.15,
  use_trend_filter: 0, trend_filter_mode: 1, require_retest: 1, enable_ob_entry: 1, enable_fvg_entry: 0,
  require_engulfing: 0, use_partial_tp: 1, use_breakeven: 1, enable_trailing: 0,
  be_trigger_pct: 40, be_offset_pips: 20, trail_trigger_pct: 50, trail_mode: 1,
  trail_candle_offset_pips: 30, min_sl_atr: 0.5, max_ob_zone_atr: 5.0, use_swing_sl: 1,
  entry_mode: 1, max_entry_zone_atr: 0.3,
  enable_liquidity_sweep: 1, sweep_tolerance_atr: 0.3, sweep_lookback_bars: 40,
  zone_timeframe: 'M5', entry_timeframe: 'M5', trade_sessions: '',
};

// รายการกลยุทธ์ที่เลือกได้บนหน้านี้ — ดู/แก้ config ของ logic ไหนก็ได้จากทุก instance
// (แก้แล้วมีผลทันทีเฉพาะ logic ที่ instance นี้รัน APOLLO_STRATEGY ตรงกันอยู่จริง)
const STRATEGIES: { id: string; name: string; title: string }[] = [
  { id: 'smc', name: 'SMC', title: 'SMC (Smart Money Concepts) Monitor' },
  { id: 'sniper', name: 'Sniper', title: 'Sniper (N-bar Breakout) Monitor' },
];

interface Position {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  price_open: number;
  price_current: number;
  profit: number;
}

// hideWhen: ซ่อนช่อง pts เดิมเมื่อ ATR× ของมันเปิดอยู่ (>0) เหลือไว้เป็น fallback ตอนตั้ง 0
const CONFIG_FIELDS: {
  key: keyof StrategyConfig;
  label: string;
  desc?: string;
  step?: string;
  group: string;
  hideWhen?: (form: Record<string, string>) => boolean;
  disabledWhen?: (form: Record<string, string>) => boolean;
  toggle?: boolean;
}[] = [
  // ── ความเสี่ยง & ลิมิต ──
  { key: 'risk_percent', label: 'Risk per Trade (%)', desc: '% ของ balance ที่ยอมเสียต่อไม้', step: '0.1', group: 'risk' },
  { key: 'tp_ratio_rr', label: 'TP Ratio (RR)', desc: 'อัตราส่วน TP : SL เช่น 3 = TP 3 เท่าของ SL', step: '0.1', group: 'risk' },
  { key: 'max_trades_per_day', label: 'Max Trades / Day', desc: 'จำนวนไม้สูงสุดที่เปิดได้ต่อวัน', group: 'risk' },
  { key: 'max_daily_loss_percent', label: 'Max Daily Loss (%)', desc: 'หยุดเทรดทันทีเมื่อขาดทุนถึง % นี้ในวันนั้น', step: '0.1', group: 'risk' },
  { key: 'max_portfolio_drawdown_pct', label: 'Portfolio DD Stop (%)', desc: 'หยุดระบบเมื่อ drawdown รวมถึง % (0 = ปิดใช้)', step: '0.5', group: 'risk' },
  { key: 'max_spread_points', label: 'Max Spread (pts)', desc: 'ข้าม signal ถ้า spread เกินค่านี้', group: 'risk' },
  { key: 'news_filter_minutes', label: 'News Filter (±นาที)', desc: 'ล็อคไม่ให้เทรดก่อน/หลังข่าว (0 = ปิด)', step: '5', group: 'risk' },
  { key: 'retrain_interval_days', label: 'Auto-retrain (วัน)', desc: 'รีเซต stats filter ทุก N วัน (0 = ปิด)', step: '1', group: 'risk' },

  // ── โซน & แท่งเข้า ──
  { key: 'zone_expiry_bars', label: 'Zone Expiry (bars)', desc: 'โซนหมดอายุหลังผ่านไปกี่แท่ง', group: 'zone' },
  { key: 'zone_atr_mult', label: 'Zone Width ATR×', desc: 'ความกว้างโซน = ATR × ค่านี้ (0 = ใช้ค่า fix)', step: '0.1', group: 'zone' },
  { key: 'min_candle_points', label: 'Min Candle (pts)', desc: 'แท่งเข้าต้องสูงอย่างน้อยเท่านี้ (pts)', group: 'zone', hideWhen: (f) => Number(f.max_candle_atr) > 0 },
  { key: 'max_candle_points', label: 'Max Candle (pts)', desc: 'แท่งเข้าต้องไม่สูงเกินเท่านี้ (pts)', group: 'zone', hideWhen: (f) => Number(f.max_candle_atr) > 0 },
  { key: 'min_candle_atr', label: 'Min Candle ATR×', desc: 'แท่งเข้าต้องสูง ≥ ATR × ค่านี้ (0 = ใช้ pts)', step: '0.1', group: 'zone' },
  { key: 'max_candle_atr', label: 'Max Candle ATR×', desc: 'แท่งเข้าต้องไม่สูง > ATR × ค่านี้ (0 = ใช้ pts)', step: '0.1', group: 'zone' },
  { key: 'buffer_points', label: 'SL Buffer (pts)', desc: 'ระยะห่างเพิ่มเติมจากขอบโซนไป SL (pts)', group: 'zone', hideWhen: (f) => Number(f.buffer_atr) > 0 },
  { key: 'buffer_atr', label: 'SL Buffer ATR×', desc: 'ระยะ buffer = ATR × ค่านี้ (0 = ใช้ pts)', step: '0.1', group: 'zone' },
  { key: 'min_sl_atr', label: 'Min SL ATR×', desc: 'SL ต้องห่างจาก entry อย่างน้อย ATR × ค่านี้ (0 = ปิด)', step: '0.1', group: 'zone' },
  { key: 'use_swing_sl', label: 'Swing SL', desc: 'วาง SL เหนือ/ใต้ swing high/low ล่าสุด (ปลอดภัยกว่า เลี่ยง stop-hunt)', group: 'zone', toggle: true },
  { key: 'entry_mode', label: 'Zone Entry Guard', desc: 'เข้าเฉพาะไม้ที่ราคายังใกล้ขอบโซน — ข้ามไม้ที่ราคาวิ่งหนีไปไกลแล้ว (backtest +59%)', group: 'zone', toggle: true },
  { key: 'max_entry_zone_atr', label: 'Max Entry-Zone ATR×', desc: 'ระยะห่างจากขอบโซนสูงสุดที่ยอมเข้า = ATR × ค่านี้', step: '0.1', group: 'zone', hideWhen: (f) => !Number(f.entry_mode) },
  { key: 'max_ob_zone_atr', label: 'Max OB-Zone ATR×', desc: 'OB/FVG ต้องห่างจาก active zone ไม่เกิน ATR × ค่านี้ (0 = ปิด)', step: '0.5', group: 'zone' },
  { key: 'enable_liquidity_sweep', label: 'Liquidity Sweep Filter', desc: 'ต้องเห็น double-top/bottom (equal-high/low) sweep ก่อนยอมรับ zone break (backtest 12mo: +9.3% กำไร)', group: 'zone', toggle: true },
  { key: 'sweep_tolerance_atr', label: 'Sweep Tolerance ATR×', desc: 'สอง swing ถือว่า "เท่ากัน" (liquidity pool) ถ้าห่างกันไม่เกิน ATR × ค่านี้', step: '0.1', group: 'zone', hideWhen: (f) => !Number(f.enable_liquidity_sweep) },
  { key: 'sweep_lookback_bars', label: 'Sweep Lookback (bars)', desc: 'ค้นหา swing ย้อนหลังกี่แท่งก่อนจุด break', group: 'zone', hideWhen: (f) => !Number(f.enable_liquidity_sweep) },

  // ── ตัวกรองสัญญาณ ──
  { key: 'use_trend_filter', label: 'Trend Filter', desc: 'กรองทิศตาม Trend Filter ที่เลือก', group: 'filter', toggle: true },
  { key: 'trend_filter_mode', label: 'Filter Mode', desc: '0 = EMA50 · 1 = HH/HL Structure — คำนวณบน TF คู่ที่สูงกว่า Zone TF หนึ่งขั้น (M1→M5, M5→M15, M15/M30→H1)', step: '1', group: 'filter', hideWhen: (f) => !Number(f.use_trend_filter) },
  { key: 'require_retest', label: 'Retest Zone', desc: 'รอให้ราคากลับมาแตะโซนก่อนถึงจะเข้า', group: 'filter', toggle: true },
  { key: 'enable_ob_entry', label: 'Order Block Entry', desc: 'เปิด signal จาก Order Block (แนะนำ)', group: 'filter', toggle: true },
  { key: 'enable_fvg_entry', label: 'FVG Entry', desc: 'เปิด signal จาก Fair Value Gap (ผล backtest อ่อนกว่า OB)', group: 'filter', toggle: true },
  { key: 'require_engulfing', label: 'Engulfing Confirm', desc: 'ต้องมีแท่ง engulfing ยืนยันทิศก่อนเข้า', group: 'filter', toggle: true },

  // ── การจัดการไม้ ──
  { key: 'use_partial_tp', label: 'Partial TP', desc: 'ปิดบางส่วนก่อนถึง TP เต็ม', group: 'manage', toggle: true },
  { key: 'use_breakeven', label: 'Breakeven', desc: 'ขยับ SL มาที่ทุนเมื่อราคาวิ่งพอ', group: 'manage', toggle: true },
  { key: 'enable_trailing', label: 'Trailing SL', desc: 'ลาก SL ตามราคาเพื่อล็อกกำไร', group: 'manage', toggle: true },
  { key: 'be_trigger_pct', label: 'BE Trigger (%TP)', desc: 'เปิด breakeven เมื่อราคาวิ่งถึง % นี้ของ TP', step: '1', group: 'manage',
    disabledWhen: (f) => Number(f['use_breakeven'] ?? 1) === 0 },
  { key: 'be_offset_pips', label: 'BE Offset (pips)', desc: 'SL ใหม่ = entry + offset นี้ (pips)', step: '0.1', group: 'manage',
    disabledWhen: (f) => Number(f['use_breakeven'] ?? 1) === 0 },
  { key: 'trail_trigger_pct', label: 'Trail Trigger (%TP)', desc: 'เริ่ม trail เมื่อราคาวิ่งถึง % นี้ของ TP', step: '1', group: 'manage',
    disabledWhen: (f) => Number(f['enable_trailing'] ?? 1) === 0 },
  { key: 'trail_mode', label: 'Trail Mode', desc: '0 = ตาม Swing High/Low  |  1 = ตามแท่งปิด', step: '1', group: 'manage',
    disabledWhen: (f) => Number(f['enable_trailing'] ?? 1) === 0 },
  { key: 'trail_candle_offset_pips', label: 'Candle Trail Offset (pips)', desc: 'ระยะห่างจากแท่งปิดไปยัง SL ใหม่ (pips)', step: '1', group: 'manage',
    hideWhen: (f) => Number(f['trail_mode'] ?? 0) !== 1,
    disabledWhen: (f) => Number(f['enable_trailing'] ?? 1) === 0 },
  { key: 'sl_offset_pips', label: 'Swing Trail Offset (pips)', desc: 'ระยะห่างจาก swing point ไปยัง SL ใหม่ (pips)', step: '0.1', group: 'manage',
    hideWhen: (f) => Number(f['trail_mode'] ?? 0) === 1,
    disabledWhen: (f) => Number(f['enable_trailing'] ?? 1) === 0 },
  { key: 'partial_tp_trigger_pct', label: 'Partial TP Trigger (%)', desc: 'ปิดบางส่วนเมื่อราคาถึง % นี้ของ TP', step: '0.1', group: 'manage',
    disabledWhen: (f) => Number(f['use_partial_tp'] ?? 1) === 0 },
  { key: 'partial_tp_close_pct', label: 'Partial TP Close (%)', desc: 'ปิดกี่ % ของ position เมื่อ trigger', step: '0.1', group: 'manage',
    disabledWhen: (f) => Number(f['use_partial_tp'] ?? 1) === 0 },

  // หมายเหตุ: Spread/Commission ย้ายไปแท็บ Backtest; sl_offset_atr/be_offset_atr ยังมีใน DB (0=ใช้ pip เดิม)
];

// ── Trade Management Visualizer ─────────────────────────────────────────────
function TradeManagementDiagram({ form }: { form: Record<string, string> }) {
  const usePartial = Number(form['use_partial_tp'] ?? 1) > 0;
  const useBE   = Number(form['use_breakeven'] ?? 1) > 0;
  const useTrail = Number(form['enable_trailing'] ?? 1) > 0;
  const partialTrig = Number(form['partial_tp_trigger_pct'] ?? 50);
  const partialClose = Number(form['partial_tp_close_pct'] ?? 50);
  const beTrig  = Number(form['be_trigger_pct'] ?? 80);
  const beOff   = Number(form['be_offset_pips'] ?? 1);
  const trailTrig = Number(form['trail_trigger_pct'] ?? 50);
  const trailMode = Number(form['trail_mode'] ?? 0);
  const candleOff = Number(form['trail_candle_offset_pips'] ?? 50);
  const slOff   = Number(form['sl_offset_pips'] ?? 10);
  const rr      = Number(form['tp_ratio_rr'] ?? 3);

  // bar แสดง range จาก SL (-1R) ถึง TP (+rr R)
  // entry อยู่ที่ตำแหน่ง pct = 1/(1+rr) ของ bar
  const totalR  = 1 + rr;   // SL→TP = (1+rr) units
  const entryPct = (1 / totalR) * 100;  // % จากซ้าย

  // แปลง % ของ TP distance → % ของ bar ทั้งหมด (clamp เพื่อกัน NaN/overflow เมื่อ field ว่าง)
  const toBarPct = (tpPct: number) => {
    const raw = entryPct + (tpPct / 100) * rr / totalR * 100;
    return isNaN(raw) ? entryPct : Math.min(Math.max(raw, 0), 100);
  };

  const partialBarPct = toBarPct(partialTrig);
  const beBarPct      = toBarPct(beTrig);
  const trailBarPct   = toBarPct(trailTrig);
  // BE SL จะขยับไป entry + beOff pips — แสดงเป็น % ของ bar แบบ approximation relative
  // (แสดงว่า SL ใหม่อยู่ใกล้ entry มาก)

  // overlap: ถ้า partial == trail ให้แสดง combined
  const samePartialTrail = Math.abs(partialTrig - trailTrig) < 1;

  type Marker = { pct: number; color: string; label: string; sub: string; row: number };
  const markers: Marker[] = [];

  // แถว row: 0=ใต้ bar (Partial/Trail), 1=เหนือ bar (BE)
  if (usePartial && partialClose > 0) {
    markers.push({
      pct: partialBarPct, color: '#F59E0B',
      label: `Partial TP`,
      sub: `@${partialTrig}% → ปิด ${partialClose}%`,
      row: 0,
    });
  }
  if (useBE) {
    markers.push({
      pct: beBarPct, color: '#60A5FA',
      label: `Breakeven`,
      sub: `@${beTrig}% → SL +${beOff}pip เหนือทุน`,
      row: 1,
    });
  }
  const trailSub = trailMode === 1
    ? `@${trailTrig}% → SL ใต้/เหนือแท่งปิด ±${candleOff}pip`
    : `@${trailTrig}% → SL ตาม swing ±${slOff}pip`;
  if (useTrail && !(samePartialTrail && partialClose > 0)) {
    markers.push({
      pct: trailBarPct, color: '#A78BFA',
      label: trailMode === 1 ? 'Trail (Candle)' : 'Trail (Swing)',
      sub: trailSub,
      row: 0,
    });
  } else if (useTrail && samePartialTrail) {
    const pi = markers.findIndex((m) => m.label.startsWith('Partial'));
    if (pi >= 0) markers[pi].sub += ` / ${trailMode === 1 ? 'Trail Candle' : 'Trail Swing'}`;
  }

  // check overlap ของ markers บน bar
  const conflict = useBE && Math.abs(beTrig - partialTrig) < 10;

  return (
    <div className="mt-2 rounded-xl border border-[var(--hairline)] bg-[var(--color-surface-2)] p-4 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gold/80">
        แผนภาพการจัดการไม้ (ต่อ 1 ไม้)
      </p>

      {/* Bar */}
      <div className="relative h-6 mt-6">
        {/* track */}
        <div className="absolute inset-y-[10px] left-0 right-0 rounded-full bg-white/8" />
        {/* SL zone */}
        <div className="absolute inset-y-[10px] left-0 rounded-l-full bg-red-500/20"
          style={{ width: `${entryPct}%` }} />
        {/* profit zone */}
        <div className="absolute inset-y-[10px] rounded-r-full bg-emerald-500/15"
          style={{ left: `${entryPct}%`, right: 0 }} />

        {/* Entry tick */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/60"
          style={{ left: `${entryPct}%`, transform: 'translateX(-50%)' }} />

        {/* Marker ticks */}
        {markers.map((m) => (
          <div key={m.label}
            className="absolute top-0 bottom-0 w-0.5"
            style={{ left: `${m.pct}%`, backgroundColor: m.color, transform: 'translateX(-50%)' }}
          />
        ))}

        {/* SL label */}
        <div className="absolute bottom-full mb-1 text-[10px] text-red-400 font-medium"
          style={{ left: 0 }}>SL</div>
        {/* Entry label */}
        <div className="absolute bottom-full mb-1 text-[10px] text-white/70 font-medium"
          style={{ left: `${entryPct}%`, transform: 'translateX(-50%)' }}>Entry</div>
        {/* TP label */}
        <div className="absolute bottom-full mb-1 text-[10px] text-emerald-400 font-medium"
          style={{ right: 0 }}>TP</div>

        {/* Marker labels above bar (row=1) */}
        {markers.filter((m) => m.row === 1).map((m) => (
          <div key={m.label + '-top'}
            className="absolute bottom-full mb-1 text-[10px] font-medium whitespace-nowrap"
            style={{ left: `${m.pct}%`, transform: 'translateX(-50%)', color: m.color }}>
            ▼{m.pct > 85 ? '' : ''}
          </div>
        ))}
      </div>

      {/* Legend rows */}
      <div className="space-y-1.5 pt-1">
        {/* Entry label below bar */}
        <div className="flex items-start gap-2 text-xs">
          <span className="w-2 h-2 mt-0.5 rounded-full bg-white/60 shrink-0" />
          <span className="text-ink-muted">Entry — SL อยู่ที่ −1R ({rr > 0 ? `RR ${rr}:1` : '—'})</span>
        </div>

        {markers.map((m) => (
          <div key={m.label + '-leg'} className="flex items-start gap-2 text-xs">
            <span className="w-2 h-2 mt-0.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
            <span className="font-medium" style={{ color: m.color }}>{m.label}</span>
            <span className="text-ink-faint">{m.sub}</span>
          </div>
        ))}

        {/* BE SL ใหม่ */}
        {useBE && (
          <div className="flex items-start gap-2 text-xs mt-0.5">
            <span className="w-2 h-2 mt-0.5 rounded-full shrink-0 bg-blue-400/40 border border-blue-400/60" />
            <span className="text-ink-faint">
              BE SL = entry + {beOff} pip (ต่อให้ถูก SL ยังได้คืนทุน)
            </span>
          </div>
        )}

        {!useBE && !useTrail && (
          <p className="text-xs text-red-400/70">⚠ Breakeven & Trailing ปิดอยู่ — ไม้จะปิดที่ SL/TP เท่านั้น</p>
        )}

        {/* conflict warning */}
        {conflict && (
          <p className="text-xs text-yellow-400/80">
            ⚠ BE Trigger ({beTrig}%) ใกล้กับ Partial TP ({partialTrig}%) มาก — อาจเกิดพร้อมกันได้
          </p>
        )}
      </div>
    </div>
  );
}

const CONFIG_GROUPS: { id: string; label: string; color: string; accent: string; border: string; tab: string; tabActive: string }[] = [
  {
    id: 'risk', label: 'ความเสี่ยง',
    color: 'text-red-400', accent: 'bg-red-500/10',
    border: 'border-red-500/30',
    tab: 'border-transparent text-ink-muted hover:text-red-300',
    tabActive: 'border-red-400 text-red-300 bg-red-500/8',
  },
  {
    id: 'zone', label: 'โซน & แท่งเข้า',
    color: 'text-amber-400', accent: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    tab: 'border-transparent text-ink-muted hover:text-amber-300',
    tabActive: 'border-amber-400 text-amber-300 bg-amber-500/8',
  },
  {
    id: 'filter', label: 'ตัวกรองสัญญาณ',
    color: 'text-sky-400', accent: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    tab: 'border-transparent text-ink-muted hover:text-sky-300',
    tabActive: 'border-sky-400 text-sky-300 bg-sky-500/8',
  },
  {
    id: 'manage', label: 'จัดการไม้',
    color: 'text-violet-400', accent: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    tab: 'border-transparent text-ink-muted hover:text-violet-300',
    tabActive: 'border-violet-400 text-violet-300 bg-violet-500/8',
  },
];

interface StrategyViewProps {
  symbol: string;
}

// dot color per group for numeric field labels
const GROUP_DOT: Record<string, string> = {
  risk: 'bg-red-400',
  zone: 'bg-amber-400',
  filter: 'bg-sky-400',
  manage: 'bg-violet-400',
  ai: 'bg-emerald-400',
};

const StrategyView: React.FC<StrategyViewProps> = ({ symbol }) => {
  // instance นี้รัน engine ไหน (SMC หรือ Sniper) — อ่านจาก /api/version ครั้งเดียว
  // default 'smc' ไว้ก่อนจนกว่าจะรู้จริง เพื่อไม่เปลี่ยนพฤติกรรมของ instance SMC ที่มีอยู่แล้ว
  const [engine, setEngine] = useState<'smc' | 'sniper'>('smc');
  useEffect(() => {
    api.get<{ strategy_engine?: string }>('/api/version')
      .then((res) => { if (res.data.strategy_engine === 'sniper') setEngine('sniper'); })
      .catch(() => {});
  }, []);

  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [strategyId, setStrategyId] = useState(STRATEGIES[0].id);
  // เปิดหน้าด้วย logic ที่ instance นี้รันอยู่จริงเป็นค่าเริ่มต้น — ผู้ใช้ยังสลับ dropdown ดู/แก้
  // config ของอีก logic ได้เสมอ ไม่ผูกกับ engine ที่รันจริง (แค่ engine เดียวที่แก้แล้วมีผลทันที)
  useEffect(() => { setStrategyId(engine); }, [engine]);
  const [positions, setPositions] = useState<Position[]>([]);
  // TF ของ zone/entry ที่ปรับได้
  const [zoneTf, setZoneTf] = useState('M5');
  const [entryTf, setEntryTf] = useState('M1');
  // session ที่เลือกเทรด (เก็บเป็น set ของชื่อ) — ว่าง = ทุกเวลา
  const [sessions, setSessions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState(CONFIG_GROUPS[0].id);
  // จำว่าฟอร์มโหลด config ของ symbol ไหนไว้ — โหลดใหม่เมื่อสลับคู่ แต่ไม่ทับค่าที่กำลังแก้ระหว่าง poll คู่เดิม
  const loadedSymbolRef = useRef<string | null>(null);

  // โหลด config จาก DB โดยตรงแยกจาก zone poll — ทำให้ form แสดงค่าที่บันทึกไว้แม้ MT5 ยังไม่เชื่อมต่อ
  const applyConfig = (c: StrategyConfig) => {
    setForm(Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, String(c[f.key])])));
    setZoneTf(c.zone_timeframe);
    setEntryTf(c.entry_timeframe);
    setSessions(
      (c.trade_sessions || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
    );
    setSaved(false);
    loadedSymbolRef.current = symbol;
  };

  useEffect(() => {
    if (strategyId !== 'smc') return;
    loadedSymbolRef.current = null;
    api.get<StrategyConfig>('/api/strategy/config', { params: { symbol } })
      .then((res) => {
        setConfig(res.data);
        if (loadedSymbolRef.current !== symbol) applyConfig(res.data);
      })
      .catch(() => {});
  }, [symbol, strategyId]); // eslint-disable-line

  useEffect(() => {
    // zone/is_running/entry-preview เป็นสถานะ live ของ SMC จริง — มีความหมายเฉพาะตอน instance นี้
    // รัน engine=smc อยู่จริงเท่านั้น ดู config SMC จาก instance ที่รัน Sniper ใช้แค่ endpoint config ด้านบนพอ
    if (strategyId !== 'smc' || engine !== 'smc') return;
    let cancelled = false;

    const fetchZone = async () => {
      try {
        const res = await api.get<ZoneResponse>('/api/strategy/zone', {
          params: { symbol },
        });
        if (cancelled) return;
        setConfig(res.data.config);
        // โหลด config เข้าฟอร์มเมื่อเป็น symbol ใหม่ (สลับคู่)
        if (loadedSymbolRef.current !== symbol) {
          applyConfig(res.data.config);
        }
      } catch (err) {
        console.error('Failed to load strategy zone', err);
      }
    };

    fetchZone();
    const interval = setInterval(fetchZone, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol, strategyId, engine]); // eslint-disable-line

  useEffect(() => {
    if (strategyId !== 'smc') return;
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
  }, [symbol, strategyId]);

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
        CONFIG_FIELDS.map((f) => [f.key, Number(form[f.key])])
      );
      payload.zone_timeframe = zoneTf;
      payload.entry_timeframe = entryTf;
      payload.trade_sessions = sessions.join(',');
      const res = await api.post('/api/strategy/config', payload, {
        params: { symbol },
      });
      setConfig(res.data.config);
      applyConfig(res.data.config);
      setSaved(true);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'Unknown error';
      setSaveError(String(detail));
      console.error('Failed to save strategy config', err);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    if (!confirm('Reset ค่า config กลับเป็น Recommended Default?\n(ค่าที่ได้จาก backtest Apr–Jun 2025 — Exp/R ดีที่สุด)')) return;
    setResetting(true);
    setSaved(false);
    try {
      const newForm = { ...form };
      for (const [k, v] of Object.entries(RECOMMENDED_DEFAULTS)) {
        if (k !== 'zone_timeframe' && k !== 'entry_timeframe' && k !== 'trade_sessions') {
          newForm[k] = String(v);
        }
      }
      setForm(newForm);
      setZoneTf(String(RECOMMENDED_DEFAULTS.zone_timeframe ?? 'M5'));
      setEntryTf(String(RECOMMENDED_DEFAULTS.entry_timeframe ?? 'M5'));
      setSessions([]);
      const payload: Record<string, number | string> = Object.fromEntries(
        CONFIG_FIELDS.map((f) => [f.key, Number(newForm[f.key])])
      );
      payload.zone_timeframe = String(RECOMMENDED_DEFAULTS.zone_timeframe ?? 'M5');
      payload.entry_timeframe = String(RECOMMENDED_DEFAULTS.entry_timeframe ?? 'M5');
      payload.trade_sessions = '';
      const res = await api.post('/api/strategy/config', payload, { params: { symbol } });
      setConfig(res.data.config);
      setSaved(true);
    } catch (err) {
      console.error('Failed to reset config', err);
    } finally {
      setResetting(false);
    }
  };

  const strategyTitle = STRATEGIES.find((s) => s.id === strategyId)?.title ?? STRATEGIES[0].title;
  const activeGroup = CONFIG_GROUPS.find((g) => g.id === activeTab)!;

  if (strategyId === 'sniper') return <SniperConfigPanel symbol={symbol} />;

  return (
    <div className="ios-fade-in flex flex-col gap-3 h-full overflow-hidden">

      {/* ── Header row ── */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <h1 className="lux-h1">{strategyTitle}</h1>
        <select
          value={strategyId}
          onChange={(e) => setStrategyId(e.target.value)}
          className="h-8 lux-input px-2 text-sm"
        >
          {STRATEGIES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* ── Open positions ── */}
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

      {/* ── Strategy Config card ── */}
      {config && (
        <div className="lux-card flex flex-col min-h-0 flex-1">

          {/* Top bar: title + TF pickers */}
          <div className="flex items-center justify-between flex-wrap gap-2 px-4 pt-4 pb-3 border-b border-[var(--hairline)] shrink-0">
            <p className="lux-title">Strategy Configuration</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="lux-label">Zone TF</label>
                <select value={zoneTf} onChange={(e) => { setSaved(false); setZoneTf(e.target.value); }} className="h-7 lux-input px-2 text-sm">
                  {CONFIG_TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="lux-label">Entry TF</label>
                <select value={entryTf} onChange={(e) => { setSaved(false); setEntryTf(e.target.value); }} className="h-7 lux-input px-2 text-sm">
                  {CONFIG_TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Tab bar — iOS segmented control */}
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

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

            {/* Numeric fields */}
            {(() => {
              const numerics = CONFIG_FIELDS.filter((f) => f.group === activeTab && !f.toggle && !f.hideWhen?.(form));
              if (numerics.length === 0) return null;
              return (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {numerics.map((f) => {
                    const disabled = f.disabledWhen?.(form) ?? false;
                    return (
                      <div key={f.key} className={`flex flex-col gap-1 transition-opacity ${disabled ? 'opacity-35 pointer-events-none' : ''}`}>
                        <label className="flex items-center gap-1.5 lux-label">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${GROUP_DOT[activeTab]}`} />
                          {f.label}
                        </label>
                        <input
                          type="number"
                          step={f.step ?? '1'}
                          value={form[f.key] ?? ''}
                          disabled={disabled}
                          onChange={(e) => { setSaved(false); setForm((prev) => ({ ...prev, [f.key]: e.target.value })); }}
                          className={`lux-input px-2 py-1.5 text-sm ${disabled ? 'cursor-not-allowed' : ''}`}
                        />
                        {f.desc && <p className="text-[11px] text-ink-faint leading-tight">{f.desc}</p>}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Toggle chips */}
            {(() => {
              const toggles = CONFIG_FIELDS.filter((f) => f.group === activeTab && f.toggle);
              if (toggles.length === 0) return null;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {toggles.map((f) => {
                    const on = Number(form[f.key]) > 0;
                    return (
                      <div key={f.key} className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 transition-colors ${
                        on ? `${activeGroup.accent} ${activeGroup.border}` : 'bg-[var(--color-surface-2)] border-[var(--hairline)]'
                      }`}>
                        <button
                          type="button"
                          onClick={() => { setSaved(false); setForm((prev) => ({ ...prev, [f.key]: on ? '0' : '1' })); }}
                          className="inline-flex items-center gap-2 text-sm font-medium w-full"
                        >
                          <span className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${on ? 'bg-green-500/70' : 'bg-white/15'}`}>
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? 'left-4' : 'left-0.5'}`} />
                          </span>
                          <span className={on ? activeGroup.color : 'text-ink-muted'}>{f.label}</span>
                        </button>
                        {f.desc && <p className="text-[11px] text-ink-faint leading-tight pl-10">{f.desc}</p>}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Trade diagram — only in manage tab */}
            {activeTab === 'manage' && <TradeManagementDiagram form={form} />}

            {/* Session picker — only in risk tab */}
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
                          on
                            ? 'bg-red-500/15 border-red-500/40 text-red-300'
                            : 'bg-[var(--color-surface-2)] border-[var(--hairline)] text-ink-muted'
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

          {/* Footer: Save / Reset */}
          <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-t border-[var(--hairline)] shrink-0">
            <button onClick={handleSaveConfig} disabled={saving} className="px-6 py-2 lux-btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Config'}
            </button>
            <button
              onClick={handleResetDefault}
              disabled={resetting}
              className="ios-pressable flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
              title="Reset เป็นค่า Recommended จาก backtest Apr–Jun 2025"
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

export default StrategyView;
