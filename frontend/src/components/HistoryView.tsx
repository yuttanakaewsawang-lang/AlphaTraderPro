import React, { useEffect, useState } from 'react';
import api from '../api';

interface TradeRecord {
  id: number;
  time: string;
  symbol: string;
  type: string;
  lot: number;
  price: number;
  sl: number | null;
  tp: number | null;
  profit: number | null;
  ticket: number;
  source: string;
  status: 'open' | 'closed' | 'unknown';
}

interface HistorySummary {
  total_profit: number;
  realized: number;
  floating: number;
  wins: number;
  losses: number;
  count: number;
  days: number;
}

interface HistoryResponse {
  trades: TradeRecord[];
  summary: HistorySummary;
}

const DAY_OPTIONS = [1, 7, 14, 21, 30, 60, 90];

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
    case 'MT5':
      return 'MT5';
    default:
      return '-';
  }
};

// สี source: AI = ฟ้า, Manual = ทอง, SMC (Zone/FVG) = ส้ม
const sourceColor = (source: string) => {
  switch (source) {
    case 'AI':
      return 'text-[#5B8DEF]';
    case 'MANUAL':
      return 'text-gold';
    case 'ZONE':
    case 'FVG':
    case 'OB':
      return 'text-light-orange';
    default:
      return 'text-ink-faint';
  }
};

// 3 สถานะ: กำไร=เขียว, ขาดทุน=แดง, ศูนย์=เทากลาง (เพื่อให้แดง/เขียวสื่อความหมายจริง)
const pnlColor = (v: number) => (v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-ink-muted');

// Pattern = เงื่อนไขจุดเข้าของไม้ SMC (ZONE/FVG/OB) แยกสีให้เห็นชัด; AI/Manual = ไม่ใช่ pattern
const PATTERN_STYLE: Record<string, string> = {
  ZONE: 'bg-[#5B8DEF]/15 text-[#5B8DEF]',
  FVG: 'bg-[#A855F7]/15 text-[#C084FC]',
  OB: 'bg-[#D9933B]/15 text-light-orange',
};

interface EquityPoint {
  date: string;
  daily: number;
  cumulative: number;
}

// กราฟเส้น equity สะสมแบบ SVG เรียบ ๆ (ไม่พึ่ง lib) — เขียวถ้าจบบวก แดงถ้าจบลบ
const EquityCurve: React.FC<{ points: EquityPoint[] }> = ({ points }) => {
  if (points.length < 2) {
    return <p className="text-ink-muted text-sm">ข้อมูลไม่พอวาดกราฟ (ต้องมีอย่างน้อย 2 วันที่มีไม้ปิด)</p>;
  }
  const W = 720;
  const H = 180;
  const pad = 8;
  const values = points.map((p) => p.cumulative);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / range) * (H - 2 * pad);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.cumulative).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const stroke = last >= 0 ? '#30D158' : '#FF453A';
  const zeroY = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }} preserveAspectRatio="none">
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="var(--hairline)" strokeWidth="1" strokeDasharray="4 4" />
      <path d={`${line} L${x(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`} fill={stroke} opacity="0.08" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
};

const HistoryView: React.FC = () => {
  const [history, setHistory] = useState<TradeRecord[]>([]);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [days, setDays] = useState(7);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await api.get<HistoryResponse>('/api/history', { params: { days } });
        setHistory(res.data.trades);
        setSummary(res.data.summary);
      } catch (err) {
        console.error('Failed to load history', err);
      }
      try {
        const eq = await api.get<{ points: EquityPoint[] }>('/api/history/equity', { params: { days } });
        setEquity(eq.data.points);
      } catch (err) {
        console.error('Failed to load equity curve', err);
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [days]);

  const cards = summary
    ? [
        { label: 'PnL รวม', value: `$${summary.total_profit.toFixed(2)}`, color: pnlColor(summary.total_profit) },
        { label: 'ปิดแล้ว (Realized)', value: `$${summary.realized.toFixed(2)}`, color: pnlColor(summary.realized) },
        { label: 'กำไรลอย (Floating)', value: `$${summary.floating.toFixed(2)}`, color: pnlColor(summary.floating) },
        { label: 'ชนะ / แพ้', value: `${summary.wins} / ${summary.losses}`, color: 'text-ink' },
        { label: 'จำนวนไม้', value: `${summary.count}`, color: 'text-ink' },
      ]
    : [];

  return (
    <div className="ios-fade-in flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="lux-h1">Trade History</h1>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="lux-input px-4 py-2 text-sm"
        >
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>ย้อนหลัง {d} วัน</option>
          ))}
        </select>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="lux-card p-4">
              <p className="lux-label mb-2">{c.label}</p>
              <p className={`text-lg font-semibold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="lux-card p-4">
        <p className="lux-label mb-3">Equity Curve (PnL สะสม · {days} วัน)</p>
        <EquityCurve points={equity} />
      </div>

      <div className="lux-panel p-6 overflow-auto">
        {history.length === 0 ? (
          <p className="text-ink-muted">ไม่มีประวัติในช่วง {days} วันที่ผ่านมา</p>
        ) : (
          <table className="lux-table text-sm">
            <thead>
              <tr>
                <th className="py-2">Date/Time</th>
                <th>Symbol</th>
                <th>Type</th>
                <th>Pattern</th>
                <th>Lot</th>
                <th>Price</th>
                <th>SL</th>
                <th>TP</th>
                <th>Profit</th>
                <th>Ticket</th>
                <th>Entry</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => {
                const profit = r.profit ?? 0;
                return (
                  <tr key={r.id} className="text-ink">
                    <td className="py-2 text-ink-muted tabular-nums">{r.time}</td>
                    <td className="font-medium text-ink whitespace-nowrap">{r.symbol}</td>
                    <td>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          r.type === 'BUY' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                        }`}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td>
                      {PATTERN_STYLE[r.source] ? (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${PATTERN_STYLE[r.source]}`}>
                          {r.source}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="tabular-nums">{r.lot}</td>
                    <td className="tabular-nums">{r.price}</td>
                    {/* SL แดงเมื่อขาดทุน, TP เขียวเมื่อกำไร — อีกช่อง (รวมกรณี 0) เป็นกลาง */}
                    <td className={`tabular-nums ${profit < 0 ? 'text-red-400' : 'text-ink-muted'}`}>{(r.sl ?? 0).toFixed(2)}</td>
                    <td className={`tabular-nums ${profit > 0 ? 'text-green-400' : 'text-ink-muted'}`}>{(r.tp ?? 0).toFixed(2)}</td>
                    <td className={`font-semibold tabular-nums ${pnlColor(profit)}`}>
                      {profit > 0 ? '+' : ''}{profit.toFixed(2)}
                      {r.status === 'open' && (
                        <span className="ml-1 text-[10px] font-normal text-ink-faint uppercase tracking-wider">ลอย</span>
                      )}
                    </td>
                    <td className="text-ink-faint tabular-nums">{r.ticket}</td>
                    <td className={`whitespace-nowrap font-medium ${sourceColor(r.source)}`}>{sourceLabel(r.source)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default HistoryView;
