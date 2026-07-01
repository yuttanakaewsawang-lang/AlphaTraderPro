import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = window.location.origin;

interface LoginProps {
  onLoginSuccess: () => void;
}

interface SavedAccount {
  login: string;
  password: string;
  server: string;
  terminal_path: string;
}

const NEW_ACCOUNT = '__new__';

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [terminalPath, setTerminalPath] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [knownServers, setKnownServers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');
  const [detectedTerminals, setDetectedTerminals] = useState<string[]>([]);
  const [showTerminalDropdown, setShowTerminalDropdown] = useState(false);
  const [detectingTerminals, setDetectingTerminals] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [addingNew, setAddingNew] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE}/api/version`).then(r => setVersion(r.data.version)).catch(() => {});
    axios.get(`${API_BASE}/api/settings`)
      .then((res) => {
        if (Array.isArray(res.data.known_servers)) setKnownServers(res.data.known_servers);
        if (res.data.terminal_path) setTerminalPath(res.data.terminal_path);
        if (res.data.remember) {
          setLogin(res.data.login);
          setPassword(res.data.password);
          setServer(res.data.server);
          setRemember(true);
        }
      })
      .catch((err) => console.error('Failed to load settings', err));
    axios.get(`${API_BASE}/api/accounts`)
      .then((res) => {
        const accounts: SavedAccount[] = res.data.accounts || [];
        setSavedAccounts(accounts);
        // มีหลายบัญชี + ยังไม่ได้ auto-fill จาก remembered settings → เลือกบัญชีล่าสุดให้อัตโนมัติ
        if (accounts.length > 0 && !login) {
          const first = accounts[0];
          setLogin(first.login);
          setPassword(first.password);
          setServer(first.server);
          if (first.terminal_path) setTerminalPath(first.terminal_path);
          setRemember(true);
        }
      })
      .catch((err) => console.error('Failed to load saved accounts', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectAccount = (value: string) => {
    if (value === NEW_ACCOUNT) {
      setAddingNew(true);
      setLogin(''); setPassword(''); setServer(''); setTerminalPath(''); setRemember(false);
      return;
    }
    const acc = savedAccounts.find(a => a.login === value);
    if (acc) {
      setLogin(acc.login);
      setPassword(acc.password);
      setServer(acc.server);
      if (acc.terminal_path) setTerminalPath(acc.terminal_path);
      setRemember(true);
    }
  };

  const detectTerminals = async () => {
    setDetectingTerminals(true);
    try {
      const res = await axios.get(`${API_BASE}/api/mt5/terminals`);
      const terms: string[] = res.data.terminals || [];
      setDetectedTerminals(terms);
      if (terms.length === 1) {
        setTerminalPath(terms[0]);
      } else if (terms.length > 1) {
        setShowTerminalDropdown(true);
      }
    } catch (e) {
      console.error('detect terminals error', e);
    } finally {
      setDetectingTerminals(false);
    }
  };

  const browseMT5 = async () => {
    try {
      const api = (window as any).pywebview?.api;
      if (api) {
        const path = await api.browse_file();
        if (path) setTerminalPath(path);
      }
    } catch (e) {
      console.error('browse_file error', e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalPath) {
      setError('กรุณาเลือก MT5 Terminal Path ก่อน login (กด 🔍 หรือ ...)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(`${API_BASE}/api/login`, { login, password, server, remember, terminal_path: terminalPath });
      if (response.data.success) onLoginSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login Failed. Check MT5 Connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-glow px-4">
      <div className="mb-8 text-center">
        <img src="/logo.png" alt="Logo" width={72} height={72} className="mx-auto mb-4 drop-shadow-lg" />
        <div className="text-xl font-bold tracking-wide" style={{ color: '#F0F4FF' }}>Alpha Trader Pro</div>
        <div className="text-xs tracking-widest mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>TRADING TERMINAL</div>
      </div>

      <div className="w-full max-w-sm lux-card p-6 shadow-2xl">
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5 lux-label">Account Number</label>
            {savedAccounts.length > 1 && !addingNew ? (
              <select
                value={login}
                onChange={(e) => handleSelectAccount(e.target.value)}
                className="w-full h-10 lux-input px-3 text-sm"
              >
                {savedAccounts.map(a => (
                  <option key={a.login} value={a.login}>{a.login} · {a.server}</option>
                ))}
                <option value={NEW_ACCOUNT}>+ เพิ่มบัญชีใหม่</option>
              </select>
            ) : (
              <div className="flex gap-1.5">
                <input
                  type="text" value={login} onChange={(e) => setLogin(e.target.value)}
                  autoFocus required
                  className="flex-1 h-10 lux-input px-3 text-sm"
                />
                {savedAccounts.length > 0 && (
                  <button type="button"
                    onClick={() => {
                      setAddingNew(false);
                      if (savedAccounts.length === 1) handleSelectAccount(savedAccounts[0].login);
                    }}
                    title="เลือกจากบัญชีที่บันทึกไว้"
                    className="h-10 px-3 text-sm lux-btn-ghost shrink-0">
                    📋
                  </button>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 lux-label">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} required
                className="w-full h-10 lux-input px-3 text-sm pr-12"
              />
              <button type="button" onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: '#82B1FF' }}>
                {showPassword ? 'hide' : 'show'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 lux-label">Broker Server</label>
            <input
              type="text" list="known-servers" value={server}
              onChange={(e) => setServer(e.target.value)} required
              className="w-full h-10 lux-input px-3 text-sm"
            />
            {knownServers.length > 0 && (
              <datalist id="known-servers">
                {knownServers.map(s => <option key={s} value={s} />)}
              </datalist>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5 lux-label">
              MT5 Terminal Path <span style={{ color: '#FF5252' }}>*</span>
            </label>
            <div className="flex gap-1.5">
              <div
                className="flex-1 h-10 lux-input px-3 text-sm flex items-center truncate cursor-default select-none"
                style={{ color: terminalPath ? '#00E676' : 'rgba(255,255,255,0.28)' }}
                title={terminalPath || 'ยังไม่ได้เลือก terminal'}
              >
                {terminalPath || 'ยังไม่ได้เลือก — กด 🔍 หรือ ...'}
              </div>
              <button type="button" onClick={detectTerminals} disabled={detectingTerminals}
                title="ค้นหา MT5 terminal ที่รันอยู่"
                className="h-10 px-3 text-sm lux-btn-ghost shrink-0 disabled:opacity-60">
                {detectingTerminals ? '…' : '🔍'}
              </button>
              <button type="button" onClick={browseMT5}
                title="เลือกไฟล์ terminal64.exe"
                className="h-10 px-3 text-sm lux-btn-ghost shrink-0">
                ...
              </button>
            </div>
            {showTerminalDropdown && detectedTerminals.length > 1 && (
              <div className="mt-1.5 lux-card overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] border-b lux-label"
                  style={{ borderColor: 'rgba(255,215,64,0.20)', color: '#FFD740' }}>
                  พบ {detectedTerminals.length} terminal — เลือก 1 ตัว
                </div>
                {detectedTerminals.map((t, i) => (
                  <button key={i} type="button"
                    onClick={() => { setTerminalPath(t); setShowTerminalDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-white/[0.06] truncate"
                    style={{ color: '#F0F4FF' }}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            {detectedTerminals.length === 0 && !detectingTerminals && !terminalPath && (
              <p className="mt-1 text-[11px]" style={{ color: '#FF5252' }}>ต้องเลือก terminal ก่อน login</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none lux-label">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                className="w-3 h-3" style={{ accentColor: '#82B1FF' }} />
              Remember Me
            </label>
            <button type="submit" disabled={loading}
              className="h-9 px-6 text-sm lux-btn-primary disabled:opacity-60">
              {loading ? '...' : 'LOGIN'}
            </button>
          </div>
          {error && (
            <div className="text-xs text-center px-3 py-2 rounded-lg"
              style={{ color: '#FF5252', background: 'rgba(255,82,82,0.10)', border: '1px solid rgba(255,82,82,0.25)' }}>
              {error}
            </div>
          )}
        </form>
      </div>

      <div className="mt-4 text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>v{version || '—'}</div>
      <div className="mt-1.5 text-xs text-center max-w-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.25)' }}>
        ⚠ คำเตือน: การเทรด CFD มีความเสี่ยงสูงมากที่จะสูญเสียเงินลงทุนทั้งหมดอย่างรวดเร็ว
      </div>
    </div>
  );
};

export default Login;
