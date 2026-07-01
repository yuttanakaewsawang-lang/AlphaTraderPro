import React, { useEffect, useState } from 'react';
import api from './api';
import ActivateView from './components/ActivateView';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import StrategyView from './components/StrategyView';
import AIView from './components/AIView';
import HistoryView from './components/HistoryView';
import LedgerView from './components/LedgerView';
import StatsView from './components/StatsView';
import CalendarView from './components/CalendarView';
import SettingsView from './components/SettingsView';
import LiveChartView from './components/LiveChartView';
import BacktestReplayView from './components/BacktestReplayView';

const App: React.FC = () => {
  const [licensed, setLicensed] = useState<boolean | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [account, setAccount] = useState<any>(null);
  const [symbol, setSymbol] = useState('XAUUSD.');
  const [symbols, setSymbols] = useState<string[]>(['XAUUSD.']);
  const licensedRef = React.useRef<boolean | null>(null);

  useEffect(() => { licensedRef.current = licensed; }, [licensed]);

  useEffect(() => {
    let cancelled = false;
    const fetchWithRetry = async (retries = 6, delay = 1000): Promise<boolean | null> => {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await api.get('/api/license');
          return res.data.valid as boolean;
        } catch {
          if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
        }
      }
      return null;
    };
    fetchWithRetry().then((valid) => {
      if (cancelled) return;
      if (valid === null) return;
      setLicensed(valid);
    });
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/api/license');
        if (!res.data.valid && licensedRef.current === true) {
          setLoggedIn(false);
          setLicensed(false);
        }
      } catch {}
    }, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    const fetchAccount = async () => {
      try {
        const res = await api.get('/api/account');
        if (res.data.success) setAccount(res.data);
      } catch {}
    };
    fetchAccount();
    const interval = setInterval(fetchAccount, 5000);
    return () => clearInterval(interval);
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    const fetchSymbols = async () => {
      try {
        const res = await api.get<string[]>('/api/symbols');
        if (res.data && res.data.length > 0) {
          setSymbols(res.data);
          if (!res.data.includes('XAUUSD.')) setSymbol(res.data[0]);
        }
      } catch {}
    };
    fetchSymbols();
  }, [loggedIn]);

  if (licensed === null) return null;
  if (!licensed) return <ActivateView onActivated={() => setLicensed(true)} />;
  if (!loggedIn) return <Login onLoginSuccess={() => setLoggedIn(true)} />;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex flex-1 bg-glow overflow-hidden">
        <Sidebar
          account={account}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          symbol={symbol}
          symbols={symbols}
          setSymbol={setSymbol}
          onLicenseExpired={() => { setLoggedIn(false); setLicensed(false); }}
        />
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'dashboard' && <DashboardView symbol={symbol} />}
          {activeTab === 'strategy' && <StrategyView symbol={symbol} />}
          {activeTab === 'ai' && <AIView symbol={symbol} />}
          {activeTab === 'livechart' && <LiveChartView symbol={symbol} />}
          {activeTab === 'replay' && <BacktestReplayView symbol={symbol} />}
          {activeTab === 'calendar' && <CalendarView />}
          {activeTab === 'history' && <HistoryView />}
          {activeTab === 'ledger' && <LedgerView symbol={symbol} />}
          {activeTab === 'stats' && <StatsView />}
          {activeTab === 'settings' && <SettingsView onLogout={() => setLoggedIn(false)} />}
        </div>
      </div>
    </div>
  );
};

export default App;
