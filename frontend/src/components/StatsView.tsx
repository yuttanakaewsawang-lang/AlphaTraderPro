import React, { useEffect, useState } from 'react';
import api from '../api';

interface AccountInfo {
  success: boolean;
  balance: number;
  equity: number;
  margin: number;
  profit_total: number;
  trades_total: number;
  broker: string;
  account: number;
}

const StatsView: React.FC = () => {
  const [account, setAccount] = useState<AccountInfo | null>(null);

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const res = await api.get<AccountInfo>('/api/account');
        if (res.data.success) setAccount(res.data);
      } catch (err) {
        console.error('Failed to load account info', err);
      }
    };
    fetchAccount();
    const interval = setInterval(fetchAccount, 5000);
    return () => clearInterval(interval);
  }, []);

  const stats = [
    { label: 'Account', value: account?.account ?? '--' },
    { label: 'Broker', value: account?.broker ?? '--' },
    { label: 'Balance', value: `$${account?.balance?.toLocaleString() ?? '0.00'}` },
    { label: 'Equity', value: `$${account?.equity?.toLocaleString() ?? '0.00'}` },
    { label: 'Margin', value: `$${account?.margin?.toLocaleString() ?? '0.00'}` },
    { label: 'Total Trades', value: account?.trades_total ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="lux-h1">Statistics</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="lux-card p-6">
            <p className="lux-label mb-2">{s.label}</p>
            <p className="text-ink text-xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="lux-card-accent p-6 pl-7">
        <p className="lux-label mb-2">Total Profit</p>
        <p
          className={`text-3xl font-semibold tabular-nums ${
            (account?.profit_total ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
          }`}
        >
          ${(account?.profit_total ?? 0).toFixed(2)}
        </p>
      </div>
    </div>
  );
};

export default StatsView;
