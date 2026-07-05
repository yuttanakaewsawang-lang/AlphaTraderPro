import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  History, Settings, TrendingUp, BarChart2, Receipt, LayoutDashboard,
  CalendarDays, CandlestickChart, Play, Zap, Wallet, LineChart, Activity,
  AlertTriangle, RefreshCw, ChevronRight, CheckCircle2,
} from 'lucide-react';
import api from '../api';
import type { ZoneResponse } from '../types/strategy';

const LicenseCountdown: React.FC<{ expiry: string; onExpired: () => void }> = ({ expiry, onExpired }) => {
  const [remaining, setRemaining] = useState('');
  const [color, setColor] = useState('#30D158');
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiredFired = useRef(false);

  useEffect(() => {
    expiredFired.current = false;
    if (expiry === 'ไม่จำกัด') { setRemaining('∞ Unlimited'); setColor('#30D158'); return; }
    const tick = () => {
      const ms = new Date(expiry).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining('หมดอายุแล้ว');
        setColor('#FF453A');
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
      setColor(d <= 7 ? '#FF453A' : d <= 30 ? '#FFD60A' : '#30D158');
    };
    tick();
    ref.current = setInterval(tick, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [expiry]);

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <span className="text-[10px] uppercase tracking-wider lux-label">License</span>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>{remaining}</span>
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
  { id: 'dashboard',  label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'strategy',   label: 'Strategy',        icon: TrendingUp },
  { id: 'livechart',  label: 'Live Chart',      icon: CandlestickChart },
  { id: 'replay',     label: 'Backtest Replay', icon: Play },
  { id: 'calendar',   label: 'Calendar',        icon: CalendarDays },
  { id: 'history',    label: 'History',         icon: History },
  { id: 'ledger',     label: 'Trade Ledger',    icon: Receipt },
  { id: 'stats',      label: 'Statistics',      icon: BarChart2 },
  { id: 'settings',   label: 'Settings',        icon: Settings },
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

  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState({ top: 0, height: 0, ready: false });

  useLayoutEffect(() => {
    const el = itemRefs.current[activeTab];
    if (el) setPill({ top: el.offsetTop, height: el.offsetHeight, ready: true });
  }, [activeTab]);

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
      await api.post('/api/update/apply');
      alert('กำลังติดตั้ง — แอปจะปิดและเปิดใหม่เองอัตโนมัติ');
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
    <div id="sidebar" className="ios-glass w-[264px] h-screen flex flex-col shrink-0 border-r"
      style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <div className="flex-1 overflow-y-auto scrollbar-none">

        {/* ── Header: Brand + Symbol ── */}
        <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="ios-icon-tile w-8 h-8 shrink-0"
                style={{ background: 'linear-gradient(135deg, #0A84FF, #0060DF)', boxShadow: '0 4px 12px -3px rgba(10,132,255,0.55)' }}>
                <Zap size={16} color="#fff" strokeWidth={2.4} fill="#fff" />
              </div>
              <div className="leading-tight">
                <p className="font-semibold text-[13.5px] tracking-tight" style={{ color: '#FFFFFF' }}>Apollo Auto Trade</p>
                <p className="text-[10px]" style={{ color: 'rgba(235,235,245,0.38)' }}>Trading Assistant</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={isRunning
                ? { background: 'rgba(48,209,88,0.14)', color: '#30D158', border: '1px solid rgba(48,209,88,0.25)' }
                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(235,235,245,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'agent-pulse' : ''}`} style={{ background: isRunning ? '#30D158' : 'rgba(235,235,245,0.35)' }} />
              {isRunning ? 'LIVE' : 'OFF'}
            </span>
          </div>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full h-9 lux-input px-3 text-sm font-semibold tabular-nums"
          >
            {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* ── Account Panel ── */}
        <div className="px-4 py-4 border-b space-y-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-1.5 mb-1" style={{ color: 'rgba(235,235,245,0.35)' }}>
            <span className="text-[10px] uppercase tracking-wider truncate">{account?.broker || '---'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="lux-inset px-3 py-2.5">
              <div className="ios-icon-tile w-6 h-6 mb-1.5" style={{ background: 'rgba(10,132,255,0.16)' }}>
                <Wallet size={12} color="#0A84FF" strokeWidth={2.3} />
              </div>
              <p className="text-[9px] uppercase tracking-wider mb-0.5 lux-label">Balance</p>
              <p className="font-semibold text-sm tabular-nums" style={{ color: '#FFFFFF' }}>
                ${account?.balance?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </p>
            </div>
            <div className="lux-inset px-3 py-2.5">
              <div className="ios-icon-tile w-6 h-6 mb-1.5" style={{ background: 'rgba(191,90,242,0.16)' }}>
                <LineChart size={12} color="#BF5AF2" strokeWidth={2.3} />
              </div>
              <p className="text-[9px] uppercase tracking-wider mb-0.5 lux-label">Equity</p>
              <p className="font-semibold text-sm tabular-nums" style={{ color: '#FFFFFF' }}>
                ${account?.equity?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-2">
              {profitPos
                ? <TrendingUp size={13} color="#30D158" strokeWidth={2.4} />
                : <TrendingUp size={13} color="#FF453A" strokeWidth={2.4} style={{ transform: 'scaleY(-1)' }} />}
              <div>
                <p className="text-[9px] uppercase tracking-wider mb-0.5 lux-label">P&L</p>
                <p className="font-semibold text-sm tabular-nums"
                  style={{ color: profitPos ? '#30D158' : '#FF453A' }}>
                  {profitPos ? '+' : ''}${account?.profit_total?.toFixed(2) || '0.00'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-right">
              <div>
                <p className="text-[9px] uppercase tracking-wider mb-0.5 lux-label">Trades</p>
                <p className="font-semibold text-sm tabular-nums" style={{ color: '#FFFFFF' }}>{account?.trades_total || '0'}</p>
              </div>
              <Activity size={13} color="rgba(235,235,245,0.35)" strokeWidth={2.3} />
            </div>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav ref={navRef} className="relative py-3 px-2 space-y-0.5">
          {pill.ready && (
            <span
              className="absolute left-2 right-2 rounded-xl pointer-events-none"
              style={{
                top: pill.top,
                height: pill.height,
                background: 'rgba(10,132,255,0.16)',
                border: '1px solid rgba(10,132,255,0.30)',
                transition: 'top 0.35s var(--ease-ios), height 0.35s var(--ease-ios)',
              }}
            />
          )}
          {menuItems.map((item) => {
            const active = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                ref={(el) => { itemRefs.current[item.id] = el; }}
                onClick={() => setActiveTab(item.id)}
                className="ios-pressable relative z-10 w-full flex items-center gap-3 px-3 py-2 text-sm rounded-xl"
                style={{ color: active ? '#FFFFFF' : 'rgba(235,235,245,0.45)', fontWeight: active ? 600 : 500 }}
              >
                <Icon size={17} strokeWidth={2.2} color={active ? '#0A84FF' : 'rgba(235,235,245,0.38)'} />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Bottom: Auto Trade + Status ── */}
      <div className="p-4 border-t shrink-0 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        {running.mt5_connected === false && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.25)' }}>
            <AlertTriangle size={13} color="#FF453A" strokeWidth={2.3} className="shrink-0" />
            <span className="text-[11px] font-medium" style={{ color: '#FF453A' }}>MT5 ขาดการเชื่อมต่อ</span>
          </div>
        )}
        {running.algo_trading === false && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,214,10,0.12)', border: '1px solid rgba(255,214,10,0.25)' }}>
            <AlertTriangle size={13} color="#FFD60A" strokeWidth={2.3} className="shrink-0" />
            <span className="text-[11px] font-medium" style={{ color: '#FFD60A' }}>Algo Trading ปิดอยู่ — เปิด AutoTrading ใน MT5</span>
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
                  className="ios-pressable group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                  style={{ background: 'rgba(48,209,88,0.12)', border: '1px solid rgba(48,209,88,0.28)', color: '#F0F4FF' }}>
                  <span className="w-1.5 h-1.5 rounded-full agent-pulse" style={{ background: '#30D158' }} />
                  <span className="tabular-nums">{s}</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#FF453A' }}>✕</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={toggleAutoTrade}
          disabled={toggling}
          className={`w-full h-11 text-sm tracking-wide disabled:opacity-50 ${
            isRunning ? 'lux-btn-danger' : 'lux-btn-primary'
          }`}
          style={{ transitionTimingFunction: 'var(--ease-ios)' }}
        >
          {isRunning ? 'STOP AUTO TRADE' : 'START AUTO TRADE'}
        </button>

        {licenseExpiry && <LicenseCountdown expiry={licenseExpiry} onExpired={onLicenseExpired ?? (() => {})} />}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] tabular-nums" style={{ color: 'rgba(235,235,245,0.32)' }}>
            v{update?.current ?? '—'}
          </span>
          {update?.has_update ? (
            <div className="flex flex-col items-end gap-0.5">
              <button onClick={applyUpdate} disabled={updating}
                className="ios-pressable text-[11px] font-medium disabled:opacity-50 flex items-center gap-1"
                style={{ color: '#FFD60A' }}>
                <span className="w-1.5 h-1.5 rounded-full agent-pulse" style={{ background: '#FFD60A' }} />
                {updating ? 'กำลังติดตั้ง…' : `อัปเดต v${update.latest}`}
              </button>
              {update.notes && (
                <span className="text-[9px] text-right max-w-[120px] leading-tight" style={{ color: 'rgba(235,235,245,0.32)' }}>
                  {update.notes}
                </span>
              )}
            </div>
          ) : (
            <button onClick={checkUpdate} disabled={checking || updating}
              className="ios-pressable text-[11px] disabled:opacity-40 flex items-center gap-1"
              style={{ color: 'rgba(235,235,245,0.45)' }}>
              <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />
              {checking ? 'กำลังเช็ค…' : 'ตรวจสอบอัปเดต'}
            </button>
          )}
        </div>
        {updateStatus === 'latest' && (
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#30D158' }}>
            <CheckCircle2 size={11} strokeWidth={2.3} /> เวอร์ชันล่าสุดแล้ว
          </div>
        )}
        {updateStatus === 'available' && (
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#FFD60A' }}>
            <span className="w-1.5 h-1.5 rounded-full agent-pulse" style={{ background: '#FFD60A' }} />
            มีเวอร์ชันใหม่ v{update?.latest}
            <ChevronRight size={11} />
          </div>
        )}
        {updateStatus === 'error' && (
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#FF453A' }}>
            <AlertTriangle size={11} strokeWidth={2.3} /> เช็คไม่ได้ — ตรวจสอบการเชื่อมต่อ
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
