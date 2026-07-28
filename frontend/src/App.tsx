import React, { useEffect, useState } from 'react';
import api from './api';
import ActivateView from './components/ActivateView';
import Login from './components/Login';
import StrategySelectView from './components/StrategySelectView';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import SniperDashboardView from './components/SniperDashboardView';
import SwingDashboardView from './components/SwingDashboardView';
import ReversalDashboardView from './components/ReversalDashboardView';
import GridDashboardView from './components/GridDashboardView';
import StrategyView from './components/StrategyView';
import HistoryView from './components/HistoryView';
import CalendarView from './components/CalendarView';
import SettingsView from './components/SettingsView';
import LiveChartView from './components/LiveChartView';
import BacktestReplayView from './components/BacktestReplayView';

const App: React.FC = () => {
  const [licensed, setLicensed] = useState<boolean | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [strategyChosen, setStrategyChosen] = useState(false);
  // engine ที่ผู้ใช้เลือกจากหน้าเลือกกลยุทธ์ — ใช้เลือกหน้า Dashboard (SMC/Sniper คนละ component)
  const [engine, setEngine] = useState('smc');
  // โหมด combo รัน 2 logic พร้อมกัน — หน้า Dashboard/Live Chart/Replay ดูได้ทีละตัว เลือกจากแถบด้านบน
  const [comboView, setComboView] = useState<'smc' | 'sniper'>('smc');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [account, setAccount] = useState<any>(null);
  const [symbol, setSymbol] = useState('XAUUSD.');
  const [symbols, setSymbols] = useState<string[]>(['XAUUSD.']);
  const licensedRef = React.useRef<boolean | null>(null);
  // engine ที่ใช้เลือก component ของหน้าที่ผูกกับกลยุทธ์ — combo ต้อง map เป็น logic ตัวที่กำลังดูอยู่
  // (ไม่มี combo_backtest / combo dashboard แยก — ทั้งสอง logic ใช้หน้าเดิมของตัวเอง)
  const effEngine = engine === 'combo' ? comboView : engine;

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
          setStrategyChosen(false);
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
  if (!strategyChosen) return <StrategySelectView onSelected={(eng) => { setEngine(eng); setStrategyChosen(true); }} />;

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
          onLicenseExpired={() => { setLoggedIn(false); setStrategyChosen(false); setLicensed(false); }}
        />
        <div key={activeTab} className="ios-fade-in flex-1 overflow-auto p-4 relative">
          {/* โหมด combo: ทั้งสอง logic รันอยู่จริงพร้อมกัน — ลอยชิดขวาบรรทัดเดียวกับหัวข้อของแต่ละหน้า
              (แทนที่จะกินพื้นที่เป็นแถวแยกด้านบน ซึ่งเคยดันเนื้อหาจนต้องเลื่อน) */}
          {engine === 'combo' && ['dashboard', 'livechart', 'strategy'].includes(activeTab) && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              <span className="hidden lg:inline text-[11px]" style={{ color: 'rgba(235,235,245,0.45)' }}>COMBO — ดูข้อมูลของ:</span>
              <div className="inline-flex rounded-[10px] p-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {(['smc', 'sniper'] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setComboView(e)}
                    aria-pressed={comboView === e}
                    className="ios-pressable px-3 py-1 text-[11px] font-bold rounded-[8px]"
                    style={comboView === e
                      ? { background: e === 'smc' ? '#0A84FF' : '#30D158', color: '#fff' }
                      : { color: 'rgba(235,235,245,0.55)' }}
                  >
                    {e === 'smc' ? 'SMC' : 'SNIPER'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'dashboard' && (
            effEngine === 'sniper' ? <SniperDashboardView symbol={symbol} comboMode={engine === 'combo'} />
            : effEngine === 'swing' ? <SwingDashboardView symbol={symbol} />
            : effEngine === 'reversal' ? <ReversalDashboardView symbol={symbol} />
            : effEngine === 'grid' ? <GridDashboardView symbol={symbol} />
            : <DashboardView symbol={symbol} comboMode={engine === 'combo'} />
          )}
          {activeTab === 'strategy' && <StrategyView symbol={symbol} viewEngine={engine === 'combo' ? comboView : undefined} />}
          {activeTab === 'livechart' && <LiveChartView symbol={symbol} engine={effEngine} comboMode={engine === 'combo'} />}
          {activeTab === 'replay' && <BacktestReplayView symbol={symbol} engine={engine === 'combo' ? 'combo' : effEngine} />}
          {activeTab === 'calendar' && <CalendarView />}
          {activeTab === 'history' && <HistoryView />}
          {activeTab === 'settings' && (
            <SettingsView
              onLogout={() => { setLoggedIn(false); setStrategyChosen(false); }}
              onChangeStrategy={() => { setStrategyChosen(false); setActiveTab('dashboard'); }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
