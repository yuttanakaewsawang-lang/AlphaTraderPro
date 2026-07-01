import React, { useEffect, useState } from 'react';
import api from '../api';
import type { AIReviewLogResponse } from '../types/strategy';

const signalColor = (s: string | null) => {
  if (s === 'BUY') return 'text-green-400';
  if (s === 'SELL') return 'text-red-400';
  return 'text-ink-faint';
};

const zoneLabel = (zoneType: 0 | 1) => (zoneType === 1 ? 'RBS (Buy)' : 'SBR (Sell)');

const biasLabel = (bias: -1 | 0 | 1) => {
  if (bias === 1) return 'Bullish';
  if (bias === -1) return 'Bearish';
  return 'Neutral';
};

const winRateColor = (rate: number | null) => {
  if (rate === null) return 'text-ink-faint';
  if (rate >= 50) return 'text-green-400';
  return 'text-red-400';
};

const scoreColor = (score: number | null) => {
  if (score === null) return 'text-ink-faint';
  if (score >= 70) return 'text-green-400';
  if (score >= 50) return 'text-yellow-500';
  return 'text-red-400';
};

interface AIViewProps {
  symbol: string;
}

const AIView: React.FC<AIViewProps> = ({ symbol }) => {
  const [reviewLog, setReviewLog] = useState<AIReviewLogResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await api.get<AIReviewLogResponse>('/api/ai/review-log', { params: { limit: 50 } });
        if (!cancelled) setReviewLog(res.data);
      } catch (err) {
        console.error('Failed to load AI review data', err);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);

  const reviews = reviewLog?.reviews ?? [];
  const reviewStats = reviewLog?.stats;

  return (
    <div className="flex flex-col gap-3 h-full">
      <h1 className="lux-h1 shrink-0">Rule Filter Log</h1>

      {/* สรุปผลตรวจทาน */}
      <div className="lux-card p-4 shrink-0">
        <p className="lux-title mb-3">สรุปการกรองสัญญาณ</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="lux-label">ตรวจทานทั้งหมด</p>
            <p className="text-ink text-2xl font-semibold tabular-nums">{reviewStats?.total_reviews ?? 0}</p>
          </div>
          <div>
            <p className="lux-label">อนุมัติ (Approved)</p>
            <p className="text-green-400 text-2xl font-semibold tabular-nums">{reviewStats?.approved ?? 0}</p>
          </div>
          <div>
            <p className="lux-label">ปฏิเสธ (Rejected)</p>
            <p className="text-red-400 text-2xl font-semibold tabular-nums">{reviewStats?.rejected ?? 0}</p>
          </div>
          <div>
            <p className="lux-label">ประมาณ Loss ที่เซฟ</p>
            <p className="text-light-orange text-2xl font-semibold tabular-nums">
              {reviewStats?.estimated_r_saved !== null && reviewStats?.estimated_r_saved !== undefined
                ? `~${reviewStats.estimated_r_saved}R`
                : '-'}
            </p>
          </div>
        </div>
        <p className="text-ink-faint text-xs mt-3">
          Rule Filter ตรวจสอบสัญญาณก่อนเปิดออเดอร์ทุกครั้ง: EMA50 H1 (ห้ามเทรดสวนเทรนด์) + RSI M15 (หลีกเลี่ยง overbought/oversold) + Expectancy จากสถิติ backtest+live &mdash; ทำงานอัตโนมัติเมื่อเปิด SMC Strategy
        </p>
      </div>

      {/* ตารางบันทึกการตรวจทาน */}
      <div className="lux-panel p-4 flex-1 min-h-0 overflow-auto">
        <p className="lux-title mb-3">Signal Filter Log ({reviews.length})</p>
        {reviews.length === 0 ? (
          <p className="text-ink-muted text-sm">
            ยังไม่มีข้อมูล — จะแสดงผลหลังจากเปิด SMC Strategy แล้วระบบเจอสัญญาณ ZONE/OB/FVG
          </p>
        ) : (
          <table className="lux-table text-xs">
            <thead>
              <tr>
                <th className="py-1 pr-3">Time</th>
                <th className="pr-3">Symbol</th>
                <th className="pr-3">Signal</th>
                <th className="pr-3">Pattern</th>
                <th className="pr-3">Zone</th>
                <th className="pr-3">Bias</th>
                <th className="pr-3">Entry</th>
                <th className="pr-3">SL</th>
                <th className="pr-3">TP</th>
                <th className="pr-3">Backtest</th>
                <th className="pr-3">Live</th>
                <th className="pr-3">Combined</th>
                <th className="pr-3">N</th>
                <th className="pr-3">Decision</th>
                <th className="pr-3">Expectancy</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r, i) => (
                <tr key={i} className="text-ink align-top">
                  <td className="py-1 pr-3 whitespace-nowrap text-ink-muted">{r.time}</td>
                  <td className="pr-3 whitespace-nowrap font-medium text-ink">{r.symbol}</td>
                  <td className={`pr-3 font-bold ${signalColor(r.signal_type)}`}>{r.signal_type}</td>
                  <td className="pr-3 whitespace-nowrap text-light-orange">{r.pattern}</td>
                  <td className="pr-3 whitespace-nowrap">{zoneLabel(r.zone_type)}</td>
                  <td className="pr-3 whitespace-nowrap">{biasLabel(r.trend_bias)}</td>
                  <td className="pr-3 tabular-nums">{r.entry_price ?? '-'}</td>
                  <td className="pr-3 tabular-nums">{r.sl ?? '-'}</td>
                  <td className="pr-3 tabular-nums">{r.tp ?? '-'}</td>
                  <td className={`pr-3 tabular-nums ${winRateColor(r.backtest_win_rate)}`}>
                    {r.backtest_win_rate !== null ? `${r.backtest_win_rate}%` : '-'}
                  </td>
                  <td className={`pr-3 tabular-nums ${winRateColor(r.live_win_rate)}`}>
                    {r.live_win_rate !== null ? `${r.live_win_rate}%` : '-'}
                  </td>
                  <td className={`pr-3 font-bold tabular-nums ${winRateColor(r.combined_win_rate)}`}>
                    {r.combined_win_rate !== null ? `${r.combined_win_rate}%` : '-'}
                  </td>
                  <td className="pr-3 tabular-nums">{r.sample_size}</td>
                  <td className={`pr-3 font-bold ${r.decision === 'APPROVE' ? 'text-green-400' : 'text-red-400'}`}>
                    {r.decision}
                  </td>
                  <td className={`pr-3 font-bold tabular-nums ${scoreColor(r.final_score)}`}>
                    {r.final_score !== null ? `${r.final_score}%` : '-'}
                  </td>
                  <td className="max-w-[400px]">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AIView;
