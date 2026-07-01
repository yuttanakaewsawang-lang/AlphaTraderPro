export interface CandleRecord {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Mirrors SMCStrategy.active_zone in Strategy.py
// zone_type: -1 = none, 0 = SBR (sell zone), 1 = RBS (buy zone)
export interface ActiveZone {
  high_limit: number;
  low_limit: number;
  zone_type: -1 | 0 | 1;
  is_broken: boolean;
  is_retested: boolean;
  broken_time: string | null;
}

export interface StrategyConfig {
  zone_timeframe: string;
  entry_timeframe: string;
  risk_percent: number;
  min_candle_points: number;
  max_candle_points: number;
  tp_ratio_rr: number;
  buffer_points: number;
  max_daily_loss_percent: number;
  max_trades_per_day: number;
  use_trend_filter: number;
  trend_filter_mode: number;
  max_spread_points: number;
  zone_expiry_bars: number;
  partial_tp_trigger_pct: number;
  partial_tp_close_pct: number;
  zone_atr_mult: number;
  min_candle_atr: number;
  max_candle_atr: number;
  buffer_atr: number;
  sl_offset_atr: number;
  be_offset_atr: number;
  enable_ob_entry: number;
  enable_fvg_entry: number;
  require_engulfing: number;
  require_retest: number;
  spread_points: number;
  commission_per_lot: number;
  use_partial_tp: number;
  use_breakeven: number;
  be_trigger_pct: number;
  be_offset_pips: number;
  enable_trailing: number;
  sl_offset_pips: number;
  enable_rule_filter: number;
  max_portfolio_drawdown_pct: number;
  news_filter_minutes: number;
  trade_sessions: string;
  trail_trigger_pct: number;
  trail_mode: number;
  trail_candle_offset_pips: number;
  retrain_interval_days: number;
  min_sl_atr: number;
  max_ob_zone_atr: number;
  use_swing_sl: number;
}

// Partial config sent to POST /api/strategy/config (รวม zone_timeframe/entry_timeframe ที่ปรับได้แล้ว)
export type StrategyConfigUpdate = Partial<StrategyConfig>;

// ไม้ล่าสุดของ symbol นี้จาก trade_history (SMCStrategy + AIStrategy บันทึกผ่าน save_trade() ร่วมกัน)
// source: ZONE/FVG = SMC Strategy, AI = AI Strategy, MANUAL = เปิดเองจากปุ่ม, UNKNOWN = ไม้เก่าก่อนมีคอลัมน์นี้
export interface LastEntry {
  time: string;
  type: 'BUY' | 'SELL';
  price: number;
  source: 'ZONE' | 'FVG' | 'OB' | 'AI' | 'MANUAL' | 'UNKNOWN';
}

export interface DailyLossStatus {
  halted: boolean;
  reason: string | null;
  realized_pnl: number;
  loss_limit: number;
  trades_today: number;
  max_trades: number | null;
}

export interface EntryPreview {
  type: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp: number;
  profit?: number;
  volume?: number;
}

export interface ZoneResponse {
  zone: ActiveZone;
  zone_timeframe: string;
  is_running: boolean;
  last_message: string;
  last_entry: LastEntry | null;
  config: StrategyConfig;
  pending?: EntryPreview | null;
  daily_loss?: DailyLossStatus;
  broker_offset?: number | null;
}

export interface LiveDecision {
  time: string;
  symbol: string;
  stage: string;
  reason: string;
}

export interface BacktestTrade {
  time: string;
  type: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp: number;
  result: 'TP' | 'SL' | 'TRAIL';
  r: number;
  profit: number;
  pattern: 'ZONE' | 'FVG' | 'OB';
  review?: 'APPROVE' | 'REJECT';
}

export interface BacktestReview {
  approved: number;
  rejected: number;
  has_prior: boolean;
  filtered_trades: number;
  filtered_wins: number;
  filtered_losses: number;
  filtered_win_rate: number;
  filtered_total_r: number;
  filtered_total_profit: number;
}

export interface BacktestResult {
  success: boolean;
  error?: string;
  symbol: string;
  times_thai?: boolean;
  month: string;
  config: Record<string, number>;
  from: string;
  to: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_r: number;
  expectancy_r: number;
  total_profit: number;
  max_drawdown: number;
  max_drawdown_r: number;
  max_drawdown_pct: number;
  currency: string;
  use_real_ticks: boolean;
  ambiguous_exits: number;
  tick_resolved_exits: number;
  review: BacktestReview | null;
  trades: BacktestTrade[];
}

export interface AIDecision {
  time: string;
  symbol: string;
  decision: 'BUY' | 'SELL' | 'HOLD';
  reason: string;
  price: number;
  sl: number;
  tp: number;
  lot: number;
  ticket: number | null;
  result: 'WIN' | 'LOSS' | null;
  profit: number;
}

export interface AIStats {
  total_decisions: number;
  trades_placed: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_profit: number;
}

export interface AIStatus {
  is_running: boolean;
  last_message: string;
  last_decision: 'BUY' | 'SELL' | 'HOLD' | null;
  last_reason: string | null;
  last_time: string | null;
  model: string;
}

export interface AILogResponse {
  decisions: AIDecision[];
  stats: AIStats;
}

// แต่ละแถวคือผลตรวจทาน (APPROVE/REJECT) ของ AI Review Agent ต่อสัญญาณที่ SMC หาได้ 1 ครั้ง
export interface AIReviewEntry {
  time: string;
  symbol: string;
  signal_type: 'BUY' | 'SELL';
  zone_type: 0 | 1;
  trend_bias: -1 | 0 | 1;
  entry_price: number;
  sl: number;
  tp: number;
  backtest_win_rate: number | null;
  live_win_rate: number | null;
  combined_win_rate: number | null;
  sample_size: number;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
  pattern: 'ZONE' | 'FVG' | 'OB';
  score: number | null;
  final_score: number | null;
}

// สรุปจำนวนสัญญาณที่ AI Review Agent ตรวจสอบ - rejected รวม auto-reject จาก Final Score < 40
// estimated_r_saved: ประมาณค่า R ที่อาจช่วยเซฟไว้ จากค่าเฉลี่ย |R| ของไม้ backtest ที่ผลเป็น SL
// ของ pattern เดียวกัน คูณจำนวนที่ reject (null ถ้าไม่มีข้อมูล backtest ให้อ้างอิง)
export interface AIReviewStats {
  total_reviews: number;
  approved: number;
  rejected: number;
  estimated_r_saved: number | null;
}

export interface AIReviewLogResponse {
  reviews: AIReviewEntry[];
  stats: AIReviewStats;
}

// Market structure (BOS/CHoCH + Order Block) สำหรับวาดทับบนกราฟ
export interface SwingPoint {
  time: number;
  price: number;
  type: 'high' | 'low';
}

export interface StructureEvent {
  type: 'BOS' | 'CHoCH';
  direction: 'bullish' | 'bearish';
  origin_time: number;
  origin_price: number;
  break_time: number;
  break_price: number;
}

export interface OrderBlock {
  direction: 'bullish' | 'bearish';
  start_time: number;
  end_time: number;
  top: number;
  bottom: number;
  mitigated: boolean;
}

// Equal High/Low (EQH/EQL) - คู่ swing ที่ราคาใกล้เคียงกัน บ่งบอกโซน liquidity pool
export interface EqualLevel {
  type: 'EQH' | 'EQL';
  price: number;
  start_time: number;
  end_time: number;
}

// แบ่งโซน Premium (ครึ่งบน) / Discount (ครึ่งล่าง) จาก swing high-low ล่าสุด
export interface PremiumDiscountZone {
  high: number;
  low: number;
  equilibrium: number;
  start_time: number;
  end_time: number;
}

export interface StructureResponse {
  swings: SwingPoint[];
  events: StructureEvent[];
  order_blocks: OrderBlock[];
  fvgs: OrderBlock[];
  equal_levels: EqualLevel[];
  premium_discount: PremiumDiscountZone | null;
  breaker_blocks: OrderBlock[];
}
