import React, { useEffect, useState, useRef } from 'react';
import { History, Settings, TrendingUp, BarChart2, Receipt, Bot, LayoutDashboard, CalendarDays, CandlestickChart, Play } from 'lucide-react';
import api from '../api';
import type { ZoneResponse } from '../types/strategy';

const LicenseCountdown: React.FC<{ expiry: string; onExpired: () => void }> = ({ expiry, onExpired }) => {
  const [remaining, setRemaining] = useState('');
  const [color, setColor] = useState('#26A69A');
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiredFired = useRef(false);

  useEffect(() => {
    expiredFired.current = false;
    if (expiry === 'ไม่จำกัด') { setRemaining('∞ Unlimited'); setColor('#26A69A'); return; }
    const tick = () => {
      const ms = new Date(expiry).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining('หมดอายุแล้ว');
        setColor('#EF5350');
        if (!expiredFired.current) { expiredFired.current = true; onExpired(); }
        return;
      }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setRemaining(d > 0
        ? `${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
        : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
      setColor(d <= 7 ? '#EF5350' : d <= 30 ? '#FFD740' : '#26A69A');
    };
    tick();
    ref.current = setInterval(tick, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [expiry]);

  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
      <span className="text-[10px] uppercase tracking-widest lux-label">License</span>
      <span className="text-[11px] font-medium tabular-nums" style={{ color }}>{remaining}</span>
    </div>
  );
};

interface SidebarProps {
  account: any;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  symbol: string;
  symbols: string[];
  setSymbol: (symbol: string) => void;
  onLicenseExpired?: () => void;
}

const menuItems = [
  { id: 'dashboard',  label: 'Dashboard',       icon: <LayoutDashboard size={18} /> },
  { id: 'strategy',   label: 'Strategy',        icon: <TrendingUp size={18} /> },
  { id: 'ai',         label: 'Rule Filter',     icon: <Bot size={18} /> },
  { id: 'livechart',  label: 'Live Chart',      icon: <CandlestickChart size={18} /> },
  { id: 'replay',     label: 'Backtest Replay', icon: <Play size={18} /> },
  { id: 'calendar',   label: 'Calendar',        icon: <CalendarDays size={18} /> },
  { id: 'history',    label: 'History',         icon: <History size={18} /> },
  { id: 'ledger',     label: 'Trade Ledger',    icon: <Receipt size={18} /> },
  { id: 'stats',      label: 'Statistics',      icon: <BarChart2 size={18} /> },
  { id: 'settings',   label: 'Settings',        icon: <Settings size={18} /> },
];

const Sidebar: React.FC<SidebarProps> = ({
  account, activeTab, setActiveTab, symbol, symbols, setSymbol, onLicenseExpired,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [running, setRunning] = useState<{ smc: string[]; mt5_connected?: boolean; algo_trading?: boolean }>({ smc: [] });
  const [licenseExpiry, setLicenseExpiry] = useState<string>('');
  const [update, setUpdate] = useState<{
    configured: boolean; current: string; latest?: string; has_update?: boolean; url?: string; notes?: string; error?: string;
  } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'latest' | 'available' | 'error'>('idle');

  const checkUpdate = async () => {
    setChecking(true);
    setUpdateStatus('idle');
    try {
      const res = await api.get('/api/update/check');
      setUpdate(res.data);
      if (res.data.error) setUpdateStatus('error');
      else if (res.data.has_update) setUpdateStatus('available');
      else setUpdateStatus('latest');
    } catch {
      setUpdateStatus('error');
    } finally {
      setChecking(false);
    }
  };

  const applyUpdate = async () => {
    if (!confirm('ดาวน์โหลดและติดตั้งเวอร์ชันใหม่?')) return;
    setUpdating(true);
    try {
      const res = await api.post('/api/update/apply');
      if (res.data.patch_only) {
        alert('ติดตั้งสำเร็จ — กด OK เพื่อ reload');
        window.location.reload();
      } else {
        alert('กำลังติดตั้ง — แอปจะปิดและเปิดใหม่เองอัตโนมัติ');
      }
    } catch (err: any) {
      if (!err.response) return;
      alert(err.response?.data?.detail || 'อัปเดตไม่สำเร็จ');
      setUpdating(false);
    }
  };

  useEffect(() => {
    checkUpdate();
    api.get('/api/license').then((res) => {
      if (res.data.valid) setLicenseExpiry(res.data.expiry || '');
    }).catch(() => {});
    const updateInterval = setInterval(checkUpdate, 30 * 60 * 1000);
    return () => clearInterval(updateInterval);
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.get<ZoneResponse>('/api/strategy/zone', { params: { symbol } });
        setIsRunning(res.data.is_running);
      } catch { /* ignore */ }
    };
    fetchStatus();
  }, [symbol]);

  useEffect(() => {
    const fetchRunning = async () => {
      try {
        const res = await api.get<{ smc: string[]; mt5_connected?: boolean; algo_trading?: boolean }>('/api/strategy/running');
        setRunning(res.data);
      } catch { /* ignore */ }
    };
    fetchRunning();
    const interval = setInterval(fetchRunning, 5000);
    return () => clearInterval(interval);
  }, []);

  const stopSymbol = async (sym: string) => {
    try {
      await api.post('/api/strategy/stop', null, { params: { symbol: sym } });
      setRunning((prev) => ({ ...prev, smc: prev.smc.filter((s) => s !== sym) }));
      if (sym === symbol) setIsRunning(false);
    } catch { /* ignore */ }
  };

  const toggleAutoTrade = async () => {
    setToggling(true);
    try {
      const endpoint = isRunning ? '/api/strategy/stop' : '/api/strategy/start';
      const res = await api.post(endpoint, null, { params: { symbol } });
      if (res.data.success) {
        setIsRunning(!isRunning);
        setRunning((prev) => ({
          ...prev,
          smc: isRunning ? prev.smc.filter((s) => s !== symbol) : [...new Set([...prev.smc, symbol])],
        }));
      }
    } catch { /* ignore */ } finally {
      setToggling(false);
    }
  };

  const profitPos = (account?.profit_total ?? 0) >= 0;

  return (
    <div id="sidebar" className="w-[260px] h-screen flex flex-col shrink-0 border-r"
      style={{
        background: '#161B27',
        borderColor: 'rgba(255,255,255,0.07)',
      }}>
      <div className="flex-1 overflow-y-auto scrollbar-none">

        {/* ── Header: Brand + Symbol ── */}
        <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-gradient-gold font-bold text-base tracking-tight">Alpha Trader Pro</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={isRunning
                ? { background: 'rgba(38,166,154,0.12)', color: '#26A69A', border: '1px solid rgba(38,166,154,0.22)' }
                : { background: 'rgba(255,255,255,0.05)', color: 'rgba(232,234,240,0.30)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {isRunning ? '● LIVE' : '○ OFF'}
            </span>
          </div>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full h-8 lux-input px-2 text-sm font-semibold tabular-nums"
          >
            {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* ── Account Panel ── */}
        <div className="px-4 py-4 border-b space-y-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-1.5" style={{ color: 'rgba(232,234,240,0.30)' }}>
            <Settings size={11} />
            <span className="text-[10px] uppercase tracking-widest truncate">{account?.broker || '---'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[9px] uppercase tracking-widest mb-0.5 lux-label">Balance</p>
              <p className="font-semibold text-sm tabular-nums" style={{ color: '#E8EAF0' }}>
                ${account?.balance?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </p>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[9px] uppercase tracking-widest mb-0.5 lux-label">Equity</p>
              <p className="text-gradient-gold font-semibold text-sm tabular-nums">
                ${account?.equity?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-[9px] uppercase tracking-widest mb-0.5 lux-label">P&L</p>
              <p className="font-semibold text-sm tabular-nums"
                style={{ color: profitPos ? '#26A69A' : '#EF5350' }}>
                {profitPos ? '+' : ''}${account?.profit_total?.toFixed(2) || '0.00'}
              </p>
            </div>
            <div className="h-6 w-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest mb-0.5 lux-label">Trades</p>
              <p className="font-semibold text-sm tabular-nums" style={{ color: '#E8EAF0' }}>{account?.trades_total || '0'}</p>
            </div>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav className="py-3 px-2 space-y-0.5">
          {menuItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className="relative w-full flex items-center gap-3 px-3 py-2 text-sm transition-all rounded-xl"
                style={active ? {
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: '#E8EAF0',
                  fontWeight: 500,
                } : {
                  border: '1px solid transparent',
                  color: 'rgba(232,234,240,0.40)',
                }}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full"
                    style={{ background: '#26A69A' }} />
                )}
                <span style={{ color: active ? '#E8EAF0' : 'rgba(232,234,240,0.32)' }}>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Bottom: Auto Trade + Status ── */}
      <div className="p-4 border-t shrink-0 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        {running.mt5_connected === false && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,82,82,0.10)', border: '1px solid rgba(255,82,82,0.25)' }}>
            <span className="w-1.5 h-1.5 rounded-full agent-pulse" style={{ background: '#EF5350' }} />
            <span className="text-[11px] font-medium" style={{ color: '#EF5350' }}>MT5 ขาดการเชื่อมต่อ</span>
          </div>
        )}
        {running.algo_trading === false && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,215,64,0.10)', border: '1px solid rgba(255,215,64,0.25)' }}>
            <span className="w-1.5 h-1.5 rounded-full agent-pulse" style={{ background: '#FFD740' }} />
            <span className="text-[11px] font-medium" style={{ color: '#FFD740' }}>Algo Trading ปิดอยู่ — เปิด AutoTrading ใน MT5</span>
          </div>
        )}
        {running.smc.length > 0 && (
          <div className="space-y-1.5">
            <p className="lux-label">กำลังรัน</p>
            <div className="flex flex-wrap gap-1.5">
              {running.smc.map((s) => (
                <button
                  key={`smc-${s}`}
                  onClick={() => stopSymbol(s)}
                  title="คลิกเพื่อหยุด"
                  className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors text-[11px] font-medium"
                  style={{ background: 'rgba(38,166,154,0.10)', border: '1px solid rgba(0,230,118,0.25)', color: '#F0F4FF' }}>
                  <span className="w-1.5 h-1.5 rounded-full agent-pulse" style={{ background: '#26A69A' }} />
                  <span className="tabular-nums">{s}</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#EF5350' }}>✕</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={toggleAutoTrade}
          disabled={toggling}
          className={`w-full h-11 text-sm tracking-wide active:scale-[0.98] disabled:opacity-50 ${
            isRunning ? 'lux-btn-danger' : 'lux-btn-primary'
          }`}
        >
          {isRunning ? 'STOP AUTO TRADE' : 'START AUTO TRADE'}
        </button>

        {licenseExpiry && <LicenseCountdown expiry={licenseExpiry} onExpired={onLicenseExpired ?? (() => {})} />}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] tabular-nums" style={{ color: 'rgba(255,255,255,0.28)' }}>
            v{update?.current ?? '—'}
          </span>
          {update?.has_update ? (
            <div className="flex flex-col items-end gap-0.5">
              <button onClick={applyUpdate} disabled={updating}
                className="text-[11px] font-medium disabled:opacity-50 flex items-center gap-1"
                style={{ color: '#FFD740' }}>
                <span className="w-1.5 h-1.5 rounded-full agent-pulse" style={{ background: '#FFD740' }} />
                {updating ? 'กำลังติดตั้ง…' : `อัปเดต v${update.latest}`}
              </button>
              {update.notes && (
                <span className="text-[9px] text-right max-w-[120px] leading-tight" style={{ color: 'rgba(255,255,255,0.28)' }}>
                  {update.notes}
                </span>
              )}
            </div>
          ) : (
            <button onClick={checkUpdate} disabled={checking || updating}
              className="text-[11px] disabled:opacity-40"
              style={{ color: 'rgba(255,255,255,0.40)' }}>
              {checking ? 'กำลังเช็ค…' : 'ตรวจสอบอัปเดต'}
            </button>
          )}
        </div>
        {updateStatus === 'latest' && (
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#26A69A' }}>✓ เวอร์ชันล่าสุดแล้ว</div>
        )}
        {updateStatus === 'available' && (
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#FFD740' }}>
            <span className="w-1.5 h-1.5 rounded-full agent-pulse" style={{ background: '#FFD740' }} />
            มีเวอร์ชันใหม่ v{update?.latest}
          </div>
        )}
        {updateStatus === 'error' && (
          <div className="text-[10px]" style={{ color: '#EF5350' }}>⚠ เช็คไม่ได้ — ตรวจสอบการเชื่อมต่อ</div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
