import React, { useEffect, useState } from 'react';
import api from '../api';
import type { BacktestResult, StrategyConfig } from '../types/strategy';

const MONTH_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
})();

interface CompareRow {
  month: string;
  total_trades?: number;
  wins?: number;
  losses?: number;
  win_rate?: number;
  total_r?: number;
  expectancy_r?: number;
  total_profit?: number;
  error?: string;
}

interface CompareResponse {
  success: boolean;
  error?: string;
  rows: CompareRow[];
  aggregate: {
    months: number;
    total_trades: number;
    wins: number;
    losses: number;
    win_rate: number;
    total_r: number;
    total_profit: number;
  } | null;
  currency: string;
}

interface BacktestViewProps {
  symbol: string;
}

const BacktestView: React.FC<BacktestViewProps> = ({ symbol }) => {
  const [month, setMonth] = useState(MONTH_OPTIONS[0].value);
  const [useRealTicks, setUseRealTicks] = useState(false);
  const [simulateReview, setSimulateReview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');
  // โหมดเทียบหลายเดือน
  const [compareMonths, setCompareMonths] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  // ต้นทุน backtest (ย้ายมาจากแท็บ Strategy) — เก็บใน strategy config ต่อคู่เงิน
  const [spread, setSpread] = useState('0');
  const [commission, setCommission] = useState('0');

  // โหลดต้นทุนปัจจุบันของคู่เงินนี้เข้าฟอร์ม
  useEffect(() => {
    api
      .get<StrategyConfig>('/api/strategy/config', { params: { symbol } })
      .then((res) => {
        setSpread(String(res.data.spread_points));
        setCommission(String(res.data.commission_per_lot));
      })
      .catch((err) => console.error('Failed to load backtest costs', err));
  }, [symbol]);

  // บันทึกต้นทุนลง config ก่อนรัน (backtest อ่านค่าจาก strategy config)
  const saveCosts = () =>
    api.post(
      '/api/strategy/config',
      { spread_points: Number(spread), commission_per_lot: Number(commission) },
      { params: { symbol } }
    );

  const runBacktest = async () => {
    setLoading(true);
    setError('');
    try {
      await saveCosts();
      const res = await api.get<BacktestResult>('/api/backtest', {
        params: { symbol, month, use_real_ticks: useRealTicks, simulate_review: simulateReview },
      });
      if (res.data.success) {
        setResult(res.data);
      } else {
        setResult(null);
        setError(res.data.error || 'Backtest failed');
      }
    } catch (err: any) {
      setResult(null);
      setError(err.response?.data?.detail || 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

const runCompare = async () => {
    if (compareMonths.length === 0) return;
    setComparing(true);
    setCompare(null);
    try {
      await saveCosts();
      const months = [...compareMonths].sort().join(',');
      const res = await api.get<CompareResponse>('/api/backtest/compare', {
        params: { symbol, months, use_real_ticks: useRealTicks },
      });
      setCompare(res.data);
    } catch (err) {
      console.error('Compare failed', err);
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <h1 className="lux-h1 shrink-0">Strategy Backtest</h1>

      <div className="lux-card p-4 shrink-0 flex items-center gap-4">
        <label className="lux-label">Month</label>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 lux-input px-2 text-sm"
        >
          {MONTH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={useRealTicks}
            onChange={(e) => setUseRealTicks(e.target.checked)}
            className="w-4 h-4 accent-[#D9933B]"
          />
          Every Tick (Real Ticks)
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={simulateReview}
            onChange={(e) => setSimulateReview(e.target.checked)}
            className="w-4 h-4 accent-[#D9933B]"
          />
          Simulate AI Review
        </label>
        <div className="flex items-center gap-2">
          <label className="lux-label">Spread (pts)</label>
          <input
            type="number"
            value={spread}
            onChange={(e) => setSpread(e.target.value)}
            className="w-20 h-9 lux-input px-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="lux-label">Commission/Lot</label>
          <input
            type="number"
            step="0.1"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            className="w-20 h-9 lux-input px-2 text-sm"
          />
        </div>
        <button
          onClick={runBacktest}
          disabled={loading}
          className="px-6 py-2 lux-btn-primary disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Backtest'}
        </button>
        <span className="text-xs text-ink-faint">
          Replays the SMC zone-break/retest entry logic on {symbol} using the saved Strategy Configuration.
        </span>
      </div>

      {error && (
        <div className="lux-card border-red-500/40 p-3 text-red-400 text-sm shrink-0">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="lux-card p-4 shrink-0">
            <p className="text-xs text-ink-faint mb-1">
              Period: {result.from.replace('T', ' ')} &rarr; {result.to.replace('T', ' ')}
            </p>
            <p className="text-xs text-ink-faint mb-3">
              Mode: {result.use_real_ticks ? 'Every Tick (Real Ticks)' : 'Bar Range (Pessimistic)'}
              {result.ambiguous_exits > 0 && (
                <>
                  {' '}&middot; {result.ambiguous_exits} ambiguous bar{result.ambiguous_exits === 1 ? '' : 's'}
                  {result.use_real_ticks && (
                    <>, {result.tick_resolved_exits} resolved via real ticks</>
                  )}
                </>
              )}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-4 text-center">
              <div>
                <p className="lux-label">Total Trades</p>
                <p className="text-ink text-2xl font-semibold tabular-nums">{result.total_trades}</p>
              </div>
              <div>
                <p className="lux-label">Wins / Losses</p>
                <p className="text-2xl font-semibold tabular-nums">
                  <span className="text-green-400">{result.wins}</span>
                  <span className="text-ink"> / </span>
                  <span className="text-red-400">{result.losses}</span>
                </p>
              </div>
              <div>
                <p className="lux-label">Win Rate</p>
                <p className="text-ink text-2xl font-semibold tabular-nums">{result.win_rate}%</p>
              </div>
              <div>
                <p className="lux-label">Total R</p>
                <p className={`text-2xl font-semibold tabular-nums ${result.total_r >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {result.total_r > 0 ? '+' : ''}{result.total_r}R
                </p>
              </div>
              <div>
                <p className="lux-label">Expectancy</p>
                <p className={`text-2xl font-semibold tabular-nums ${result.expectancy_r >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {result.expectancy_r > 0 ? '+' : ''}{result.expectancy_r}R
                </p>
              </div>
              <div>
                <p className="lux-label">Profit / Loss</p>
                <p className={`text-2xl font-semibold tabular-nums ${result.total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {result.total_profit > 0 ? '+' : ''}{result.total_profit.toFixed(2)} {result.currency}
                </p>
              </div>
              <div>
                <p className="lux-label">Max DD</p>
                <p className="text-2xl font-semibold tabular-nums text-red-400">
                  -{result.max_drawdown.toFixed(2)}
                  <span className="text-sm text-ink-faint"> ({result.max_drawdown_pct}%)</span>
                </p>
                <p className="text-[11px] text-ink-faint tabular-nums">-{result.max_drawdown_r}R</p>
              </div>
            </div>
          </div>

          {result.review && (
            <div className="lux-card p-4 shrink-0">
              <p className="lux-title mb-3">AI Review Dry-run (จำลอง · ไม่กระทบสถิติจริง)</p>
              {!result.review.has_prior && (
                <p className="text-xs text-light-orange mb-3">
                  ⚠️ ยังไม่มีสถิติ prior จากเดือนอื่น — รัน backtest เดือนอื่นก่อนเพื่อสะสมข้อมูล แล้วตัวกรองจะเริ่มทำงาน
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                <div>
                  <p className="lux-label">Approve / Reject</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    <span className="text-green-400">{result.review.approved}</span>
                    <span className="text-ink"> / </span>
                    <span className="text-red-400">{result.review.rejected}</span>
                  </p>
                </div>
                <div>
                  <p className="lux-label">Win Rate (กรองแล้ว)</p>
                  <p className="text-2xl font-semibold tabular-nums text-ink">
                    {result.review.filtered_win_rate}%
                    <span className="text-sm text-ink-faint"> จาก {result.win_rate}%</span>
                  </p>
                </div>
                <div>
                  <p className="lux-label">Total R (กรองแล้ว)</p>
                  <p className={`text-2xl font-semibold tabular-nums ${result.review.filtered_total_r >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {result.review.filtered_total_r > 0 ? '+' : ''}{result.review.filtered_total_r}R
                    <span className="text-sm text-ink-faint"> จาก {result.total_r}R</span>
                  </p>
                </div>
                <div>
                  <p className="lux-label">Profit (กรองแล้ว)</p>
                  <p className={`text-2xl font-semibold tabular-nums ${result.review.filtered_total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {result.review.filtered_total_profit > 0 ? '+' : ''}{result.review.filtered_total_profit.toFixed(2)}
                    <span className="text-sm text-ink-faint"> {result.currency}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="lux-panel p-4 flex-1 min-h-0 overflow-auto">
            <p className="lux-title mb-3">
              Trade Log ({result.trades.length})
            </p>
            {result.trades.length === 0 ? (
              <p className="text-ink-muted text-sm">No trades generated for this period/config.</p>
            ) : (
              <table className="lux-table text-xs">
                <thead>
                  <tr>
                    <th className="py-1 pr-3">{result.times_thai ? 'Time (ไทย)' : 'Time'}</th>
                    <th className="pr-3">Type</th>
                    <th className="pr-3">Pattern</th>
                    <th className="pr-3">Entry</th>
                    <th className="pr-3">SL</th>
                    <th className="pr-3">TP</th>
                    <th className="pr-3">Result</th>
                    <th className="pr-3">R</th>
                    <th className="pr-3">Profit</th>
                    {result.review && <th>Review</th>}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.slice().reverse().map((t, i) => (
                    <tr key={i} className="text-ink">
                      <td className="py-1 pr-3">{t.time.replace('T', ' ')}</td>
                      <td className={`pr-3 ${t.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{t.type}</td>
                      <td className="pr-3 text-light-orange">{t.pattern}</td>
                      <td className="pr-3">{t.entry}</td>
                      <td className="pr-3">{t.sl}</td>
                      <td className="pr-3">{t.tp}</td>
                      <td className={`pr-3 ${t.r > 0 ? 'text-green-400' : 'text-red-400'}`}>{t.result}</td>
                      <td className={`pr-3 ${t.r >= 0 ? 'text-green-400' : 'text-red-400'}`}>{t.r > 0 ? '+' : ''}{t.r}</td>
                      <td className={`pr-3 ${t.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{t.profit > 0 ? '+' : ''}{t.profit.toFixed(2)}</td>
                      {result.review && (
                        <td className={t.review === 'REJECT' ? 'text-red-400' : 'text-green-400'}>
                          {t.review ?? '-'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* โหมดเทียบหลายเดือน: เลือกเดือนหลายเดือน แล้วดูสรุปในตารางเดียว หา config ที่ robust */}
      <div className="lux-card p-4 shrink-0 space-y-3">
        <p className="lux-title">เทียบหลายเดือน (Multi-Month Compare)</p>
        <div className="flex flex-wrap gap-2">
          {MONTH_OPTIONS.map((opt) => {
            const on = compareMonths.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setCompareMonths((prev) =>
                    on ? prev.filter((m) => m !== opt.value) : [...prev, opt.value]
                  )
                }
                className={`px-3 py-1 rounded-lg border text-xs transition-colors ${
                  on
                    ? 'bg-[var(--gold)]/15 border-[var(--gold)]/50 text-ink'
                    : 'bg-[var(--color-surface-2)] border-[var(--hairline)] text-ink-muted'
                }`}
              >
                {opt.value}
              </button>
            );
          })}
        </div>
        <button
          onClick={runCompare}
          disabled={comparing || compareMonths.length === 0}
          className="px-6 py-2 lux-btn-primary disabled:opacity-50"
        >
          {comparing ? 'Comparing...' : `Compare ${compareMonths.length} เดือน`}
        </button>

        {compare?.rows && (
          <div className="overflow-auto">
            <table className="lux-table text-xs">
              <thead>
                <tr>
                  <th className="py-1 pr-3">Month</th>
                  <th className="pr-3">Trades</th>
                  <th className="pr-3">W / L</th>
                  <th className="pr-3">Win%</th>
                  <th className="pr-3">Total R</th>
                  <th className="pr-3">Exp R</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {compare.rows.map((r) => (
                  <tr key={r.month} className="text-ink">
                    <td className="py-1 pr-3 tabular-nums">{r.month}</td>
                    {r.error ? (
                      <td colSpan={6} className="text-ink-faint">{r.error}</td>
                    ) : (
                      <>
                        <td className="pr-3 tabular-nums">{r.total_trades}</td>
                        <td className="pr-3 tabular-nums">
                          <span className="text-green-400">{r.wins}</span>
                          <span className="text-ink"> / </span>
                          <span className="text-red-400">{r.losses}</span>
                        </td>
                        <td className="pr-3 tabular-nums">{r.win_rate}%</td>
                        <td className={`pr-3 tabular-nums ${(r.total_r ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {(r.total_r ?? 0) > 0 ? '+' : ''}{r.total_r}R
                        </td>
                        <td className={`pr-3 tabular-nums ${(r.expectancy_r ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {(r.expectancy_r ?? 0) > 0 ? '+' : ''}{r.expectancy_r}R
                        </td>
                        <td className={`tabular-nums ${(r.total_profit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {(r.total_profit ?? 0) > 0 ? '+' : ''}{(r.total_profit ?? 0).toFixed(2)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {compare.aggregate && (
                  <tr className="text-ink font-semibold border-t border-[var(--hairline)]">
                    <td className="py-1 pr-3">รวม {compare.aggregate.months} เดือน</td>
                    <td className="pr-3 tabular-nums">{compare.aggregate.total_trades}</td>
                    <td className="pr-3 tabular-nums">
                      <span className="text-green-400">{compare.aggregate.wins}</span>
                      <span className="text-ink"> / </span>
                      <span className="text-red-400">{compare.aggregate.losses}</span>
                    </td>
                    <td className="pr-3 tabular-nums">{compare.aggregate.win_rate}%</td>
                    <td className={`pr-3 tabular-nums ${compare.aggregate.total_r >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {compare.aggregate.total_r > 0 ? '+' : ''}{compare.aggregate.total_r}R
                    </td>
                    <td className="pr-3">—</td>
                    <td className={`tabular-nums ${compare.aggregate.total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {compare.aggregate.total_profit > 0 ? '+' : ''}{compare.aggregate.total_profit.toFixed(2)} {compare.currency}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default BacktestView;
