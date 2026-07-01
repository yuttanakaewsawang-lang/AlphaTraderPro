import React, { useEffect, useState } from 'react';
import api from '../api';
import type { LedgerResponse } from '../types/ledger';

const formatMoney = (value: number) => `$${value.toFixed(2)}`;

const pnlColor = (value: number) => (value >= 0 ? 'text-green-400' : 'text-red-400');

const sourceLabel = (source: string) => {
  switch (source) {
    case 'ZONE':
      return 'SMC Zone';
    case 'FVG':
      return 'SMC FVG';
    case 'OB':
      return 'SMC OB';
    case 'AI':
      return 'AI';
    case 'MANUAL':
      return 'Manual';
    default:
      return '-';
  }
};

interface LedgerViewProps {
  symbol: string;
}

const LedgerView: React.FC<LedgerViewProps> = ({ symbol }) => {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState('all');

  useEffect(() => {
    const fetchLedger = async () => {
      try {
        const res = await api.get<LedgerResponse>('/api/ledger', {
          params: { symbol, date: selectedDate },
        });
        setData(res.data);
      } catch (err) {
        console.error('Failed to load trade ledger', err);
      }
    };
    fetchLedger();
    const interval = setInterval(fetchLedger, 15000);
    return () => clearInterval(interval);
  }, [selectedDate, symbol]);

  const summary = data?.summary;

  const cards = summary
    ? [
        { label: 'PnL สุทธิ', value: formatMoney(summary.net_pnl), color: pnlColor(summary.net_pnl) },
        { label: 'ชนะ/แพ้/เสมอ', value: `${summary.wins}/${summary.losses}/${summary.draws}` },
        { label: 'Winrate', value: `${summary.winrate.toFixed(2)}%` },
        { label: 'Profit Factor', value: summary.profit_factor !== null ? summary.profit_factor.toFixed(2) : '-' },
        { label: 'คาดหวัง/ไม้', value: formatMoney(summary.expectancy), color: pnlColor(summary.expectancy) },
        { label: 'R:R เฉลี่ย', value: summary.avg_rr !== null ? summary.avg_rr.toFixed(2) : '-' },
        { label: 'กำไรรวมฝั่งชนะ', value: formatMoney(summary.gross_profit), color: 'text-green-400' },
        { label: 'ขาดทุนรวมฝั่งแพ้', value: formatMoney(summary.gross_loss), color: 'text-red-400' },
        { label: 'เฉลี่ยไม้ชนะ', value: formatMoney(summary.avg_win), color: 'text-green-400' },
        { label: 'เฉลี่ยไม้แพ้', value: formatMoney(summary.avg_loss), color: 'text-red-400' },
        { label: 'ไม้ดีสุด', value: formatMoney(summary.best_trade), color: pnlColor(summary.best_trade) },
        { label: 'ไม้แย่สุด', value: formatMoney(summary.worst_trade), color: pnlColor(summary.worst_trade) },
        { label: 'ชนะติดกันสูงสุด', value: `${summary.max_win_streak} ไม้` },
        { label: 'แพ้ติดกันสูงสุด', value: `${summary.max_loss_streak} ไม้` },
        {
          label: 'BUY',
          value: `${summary.buy_count} ไม้ · ${formatMoney(summary.buy_pnl)}`,
          color: pnlColor(summary.buy_pnl),
        },
        {
          label: 'SELL',
          value: `${summary.sell_count} ไม้ · ${formatMoney(summary.sell_pnl)}`,
          color: pnlColor(summary.sell_pnl),
        },
        { label: 'Lot รวม', value: summary.total_lot.toFixed(2) },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="lux-h1">Trade Ledger</h1>
          <p className="text-ink-muted text-sm">ประวัติการเทรดทั้งหมด</p>
        </div>
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="lux-input px-4 py-2 text-sm"
        >
          <option value="all">ทุกวัน</option>
          {data?.dates.map((d) => (
            <option key={d.date} value={d.date}>
              {d.date} · {d.count} ไม้ · {d.pnl.toFixed(2)}$
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="lux-card p-4">
            <p className="lux-label mb-2">{c.label}</p>
            <p className={`text-lg font-semibold tabular-nums ${c.color ?? 'text-ink'}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="lux-panel p-6 overflow-auto">
        <h2 className="lux-title mb-4">ประวัติ</h2>
        {!data || data.trades.length === 0 ? (
          <p className="text-ink-muted">No trade history.</p>
        ) : (
          <table className="lux-table text-sm">
            <thead>
              <tr>
                <th className="py-2">เวลา</th>
                <th>ประเภท</th>
                <th>ปริมาณ</th>
                <th>เข้า</th>
                <th>ออก</th>
                <th>กำไร/ขาดทุน</th>
                <th>R:R</th>
                <th>เงื่อนไข Entry</th>
              </tr>
            </thead>
            <tbody>
              {data.trades.map((t) => (
                <tr key={t.position_id} className="text-ink">
                  <td className="py-2">{new Date(t.time * 1000).toLocaleString()}</td>
                  <td className={t.type === 'BUY' ? 'text-green-400' : 'text-red-400'}>{t.type}</td>
                  <td>{t.volume}</td>
                  <td>{t.price !== null ? t.price.toFixed(2) : '-'}</td>
                  <td>{t.exit_price.toFixed(2)}</td>
                  <td className={pnlColor(t.profit)}>{formatMoney(t.profit)}</td>
                  <td>{t.rr !== null ? t.rr.toFixed(2) : '-'}</td>
                  <td className="whitespace-nowrap">{sourceLabel(t.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LedgerView;
