// source: เงื่อนไขที่ทำให้เกิด entry นี้
// ZONE/FVG = SMC Strategy, AI = AI Strategy, MANUAL = เปิดเองจากปุ่ม, UNKNOWN = ไม้เก่าก่อนมีคอลัมน์นี้
export interface LedgerTrade {
  position_id: number;
  time: number;
  type: 'BUY' | 'SELL';
  volume: number;
  price: number | null;
  exit_price: number;
  profit: number;
  rr: number | null;
  source: 'ZONE' | 'FVG' | 'OB' | 'AI' | 'MANUAL' | 'UNKNOWN';
}

export interface LedgerDateGroup {
  date: string;
  count: number;
  pnl: number;
}

export interface LedgerSummary {
  net_pnl: number;
  total_trades: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
  profit_factor: number | null;
  expectancy: number;
  avg_rr: number | null;
  gross_profit: number;
  gross_loss: number;
  avg_win: number;
  avg_loss: number;
  best_trade: number;
  worst_trade: number;
  max_win_streak: number;
  max_loss_streak: number;
  buy_count: number;
  buy_pnl: number;
  sell_count: number;
  sell_pnl: number;
  total_lot: number;
}

export interface LedgerResponse {
  summary: LedgerSummary;
  dates: LedgerDateGroup[];
  trades: LedgerTrade[];
}
