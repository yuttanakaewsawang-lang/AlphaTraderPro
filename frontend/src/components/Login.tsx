import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Eye, EyeOff, Search, FolderOpen, AlertTriangle,
  ChevronRight, Plus, ArrowLeft, ShieldCheck, Loader2, HardDrive, Trash2,
} from 'lucide-react';

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

// สีประจำบัญชี (avatar) — เลือกจาก iOS accent palette ด้วย hash ของเลขบัญชี ให้แต่ละบัญชีสีคงที่/ต่างกัน
const AVATAR_COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#40C8E0', '#FF375F', '#5E5CE6'];
const avatarColor = (login: string) => {
  let h = 0;
  for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const brokerName = (server: string) => (server || '').split(/[-\s._]/)[0] || 'MT5';
const brokerInitials = (server: string) => {
  const n = brokerName(server);
  return (n.length >= 2 ? n.slice(0, 2) : n).toUpperCase();
};
const basename = (p: string) => (p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [terminalPath, setTerminalPath] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [knownServers, setKnownServers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggingInAccount, setLoggingInAccount] = useState('');   // เลขบัญชีการ์ดที่กำลัง one-tap login (โชว์ spinner)
  const [deletingAccount, setDeletingAccount] = useState('');     // เลขบัญชีที่กำลังลบออกจากรายการ (โชว์ spinner)
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');
  const [detectedTerminals, setDetectedTerminals] = useState<string[]>([]);
  const [showTerminalDropdown, setShowTerminalDropdown] = useState(false);
  const [detectingTerminals, setDetectingTerminals] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [mode, setMode] = useState<'picker' | 'form'>('form');   // ตั้งเป็น picker เมื่อโหลดเจอบัญชีที่บันทึกไว้

  useEffect(() => {
    axios.get(`${API_BASE}/api/version`).then(r => setVersion(r.data.version)).catch(() => {});
    axios.get(`${API_BASE}/api/settings`)
      .then((res) => {
        if (Array.isArray(res.data.known_servers)) setKnownServers(res.data.known_servers);
        if (res.data.terminal_path) setTerminalPath(res.data.terminal_path);
      })
      .catch((err) => console.error('Failed to load settings', err));
    axios.get(`${API_BASE}/api/accounts`)
      .then((res) => {
        const accounts: SavedAccount[] = res.data.accounts || [];
        setSavedAccounts(accounts);
        if (accounts.length > 0) {
          setMode('picker');   // มีบัญชีที่บันทึกไว้ → เปิดหน้าเลือกบัญชีเป็นค่าเริ่มต้น
        }
      })
      .catch((err) => console.error('Failed to load saved accounts', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detectTerminals = async () => {
    setDetectingTerminals(true);
    try {
      const res = await axios.get(`${API_BASE}/api/mt5/terminals`);
      const terms: string[] = res.data.terminals || [];
      setDetectedTerminals(terms);
      if (terms.length === 1) setTerminalPath(terms[0]);
      else if (terms.length > 1) setShowTerminalDropdown(true);
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

  // เข้าสู่ระบบด้วย credential ที่ระบุตรงๆ (ไม่พึ่ง state ที่ set แบบ async) — ใช้ทั้งฟอร์มและ one-tap การ์ด
  const doLogin = async (creds: { login: string; password: string; server: string; terminal_path: string; remember: boolean }) => {
    if (!creds.terminal_path) {
      setError('กรุณาเลือก MT5 Terminal Path ก่อน login (กดปุ่มค้นหา 🔍 หรือ ...)');
      return;
    }
    setError('');
    try {
      const response = await axios.post(`${API_BASE}/api/login`, creds);
      if (response.data.success) onLoginSuccess();
    } catch (err: any) {
      throw err;
    }
  };

  const handleFormLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await doLogin({ login, password, server, terminal_path: terminalPath, remember });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login Failed. Check MT5 Connection.');
    } finally {
      setLoading(false);
    }
  };

  // one-tap จากการ์ดบัญชี — ถ้าล้มเหลว เด้งไปฟอร์มที่กรอกค่าบัญชีนั้นไว้แล้วให้แก้
  const handleCardLogin = async (acc: SavedAccount) => {
    setLoggingInAccount(acc.login);
    try {
      await doLogin({ login: acc.login, password: acc.password, server: acc.server, terminal_path: acc.terminal_path, remember: true });
    } catch (err: any) {
      setLogin(acc.login); setPassword(acc.password); setServer(acc.server);
      if (acc.terminal_path) setTerminalPath(acc.terminal_path);
      setRemember(true);
      setError(err.response?.data?.detail || 'เข้าสู่ระบบไม่สำเร็จ — ตรวจรหัสผ่าน / terminal แล้วลองใหม่');
      setMode('form');
    } finally {
      setLoggingInAccount('');
    }
  };

  // ลบบัญชีออกจากรายการที่บันทึกไว้ (ลบเฉพาะ credential ที่จำไว้ — ไม่กระทบ config/ประวัติการเทรดที่แยกตามบัญชี)
  const handleDeleteAccount = async (acc: SavedAccount) => {
    if (!window.confirm(`ลบบัญชี ${acc.login} (${acc.server}) ออกจากรายการ?\n\nจะลบเฉพาะเลขบัญชี/รหัสที่จำไว้ ไม่กระทบ config กลยุทธ์หรือประวัติการเทรดของบัญชีนี้`)) return;
    setError('');
    setDeletingAccount(acc.login);
    try {
      await axios.delete(`${API_BASE}/api/accounts/${encodeURIComponent(acc.login)}`);
      setSavedAccounts((prev) => {
        const next = prev.filter((a) => a.login !== acc.login);
        if (next.length === 0) setMode('form');   // ไม่เหลือบัญชีแล้ว → กลับไปฟอร์มกรอกใหม่
        return next;
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'ลบบัญชีไม่สำเร็จ');
    } finally {
      setDeletingAccount('');
    }
  };

  const goAddNew = () => {
    setLogin(''); setPassword(''); setServer(''); setRemember(true);
    setError(''); setMode('form');
  };

  const Header = (
    <div className="mb-7 text-center">
      <img src="/logo.png" alt="Logo" width={112} height={112} className="mx-auto mb-3 drop-shadow-lg" draggable={false} />
      <div className="text-lg font-bold tracking-wide" style={{ color: '#1B75FD' }}>Apollo Auto Trade</div>
      <div className="text-[10px] tracking-[0.22em] mt-1" style={{ color: 'rgba(235,235,245,0.34)' }}>TRADING TERMINAL</div>
    </div>
  );

  const ErrorBanner = error ? (
    <div
      role="alert" aria-live="polite"
      className="flex items-start gap-2 text-xs px-3 py-2.5 rounded-xl"
      style={{ color: '#FF6961', background: 'rgba(255,69,58,0.10)', border: '1px solid rgba(255,69,58,0.25)' }}
    >
      <AlertTriangle size={14} strokeWidth={2.3} className="shrink-0 mt-px" />
      <span className="leading-snug">{error}</span>
    </div>
  ) : null;

  return (
    <div className="ios-fade-in flex flex-col items-center justify-center min-h-screen bg-glow px-4 py-8">
      {Header}

      {mode === 'picker' ? (
        /* ============ หน้าเลือกบัญชี ============ */
        <div className="w-full max-w-sm">
          <div className="flex items-baseline justify-between mb-3 px-1">
            <h1 className="text-[15px] font-bold text-white tracking-tight" style={{ textWrap: 'balance' } as React.CSSProperties}>เลือกบัญชี</h1>
            <span className="text-[10.5px]" style={{ color: 'rgba(235,235,245,0.34)' }}>{savedAccounts.length} บัญชี</span>
          </div>

          <div className="space-y-2.5">
            {savedAccounts.map((acc, i) => {
              const busy = loggingInAccount === acc.login;
              const deleting = deletingAccount === acc.login;
              const anyBusy = !!loggingInAccount || !!deletingAccount;
              const color = avatarColor(acc.login);
              return (
                <div
                  key={acc.login}
                  className="ios-card-in relative w-full"
                  style={{ animationDelay: `${i * 55}ms`, opacity: anyBusy && !busy && !deleting ? 0.55 : 1 }}
                >
                  {/* การ์ด login (กดเข้าสู่ระบบ) — กว้างเต็มกรอบเหมือนเดิม */}
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => handleCardLogin(acc)}
                    aria-label={`เข้าสู่ระบบบัญชี ${acc.login} โบรก ${acc.server}`}
                    className="account-card w-full text-left lux-card p-3.5 flex items-center gap-3.5 disabled:pointer-events-none"
                    style={{ ['--acc' as string]: color } as React.CSSProperties}
                  >
                    {/* avatar */}
                    <div
                      className="shrink-0 ios-icon-tile w-11 h-11 text-[13px] font-extrabold tracking-tight"
                      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
                    >
                      {brokerInitials(acc.server)}
                    </div>

                    {/* main */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-white tabular-nums truncate">{acc.login}</span>
                        {i === 0 && (
                          <span
                            className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                            style={{ color: '#30D158', background: 'rgba(48,209,88,0.14)' }}
                          >
                            ล่าสุด
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] truncate" style={{ color: 'rgba(235,235,245,0.5)' }}>{acc.server}</div>
                      {acc.terminal_path && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] truncate" style={{ color: 'rgba(235,235,245,0.32)' }}>
                          <HardDrive size={10} strokeWidth={2} className="shrink-0" />
                          <span className="truncate">{basename(acc.terminal_path)}</span>
                        </div>
                      )}
                    </div>

                    {/* action (login) */}
                    <div className="shrink-0 pr-0.5" style={{ color: busy ? '#0A84FF' : 'rgba(235,235,245,0.35)' }}>
                      {busy ? <Loader2 size={18} strokeWidth={2.4} className="animate-spin" /> : <ChevronRight size={18} strokeWidth={2.4} />}
                    </div>
                  </button>

                  {/* ปุ่มลบบัญชี — วางข้างการ์ด (นอกกรอบทางขวา) */}
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => handleDeleteAccount(acc)}
                    aria-label={`ลบบัญชี ${acc.login} ออกจากรายการ`}
                    title="ลบบัญชีนี้ออกจากรายการ"
                    className="account-del ios-pressable absolute top-1/2 -translate-y-1/2 left-full ml-2 w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                    style={{ color: '#FF6961', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.18)' }}
                  >
                    {deleting ? <Loader2 size={16} strokeWidth={2.4} className="animate-spin" /> : <Trash2 size={16} strokeWidth={2.2} />}
                  </button>
                </div>
              );
            })}

            {/* เพิ่มบัญชีใหม่ */}
            <button
              type="button"
              onClick={goAddNew}
              disabled={!!loggingInAccount}
              className="account-card ios-card-in w-full text-left p-3.5 flex items-center gap-3.5 rounded-2xl disabled:pointer-events-none"
              style={{
                animationDelay: `${savedAccounts.length * 55}ms`,
                border: '1px dashed rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.02)',
              }}
            >
              <div className="shrink-0 ios-icon-tile w-11 h-11" style={{ background: 'rgba(10,132,255,0.12)', color: '#0A84FF' }}>
                <Plus size={20} strokeWidth={2.4} />
              </div>
              <span className="text-[13.5px] font-semibold" style={{ color: 'rgba(235,235,245,0.72)' }}>เพิ่มบัญชีใหม่</span>
            </button>
          </div>

          {ErrorBanner && <div className="mt-3">{ErrorBanner}</div>}

          <div className="mt-3.5 flex items-center gap-2 justify-center text-[10.5px]" style={{ color: 'rgba(48,209,88,0.7)' }}>
            <ShieldCheck size={12} strokeWidth={2.2} />
            <span>แต่ละบัญชีแยก config และลิงก์ Discord กันอิสระ</span>
          </div>
        </div>
      ) : (
        /* ============ ฟอร์มกรอกบัญชี ============ */
        <div className="w-full max-w-sm lux-card p-6 shadow-2xl ios-fade-in">
          {savedAccounts.length > 0 && (
            <button
              type="button"
              onClick={() => { setError(''); setMode('picker'); }}
              className="ios-pressable flex items-center gap-1.5 text-[12px] font-semibold mb-4 -mt-1"
              style={{ color: '#0A84FF' }}
            >
              <ArrowLeft size={14} strokeWidth={2.4} /> กลับไปเลือกบัญชี
            </button>
          )}

          <form onSubmit={handleFormLogin} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5 lux-label">Account Number</label>
              <input
                type="text" value={login} onChange={(e) => setLogin(e.target.value)}
                autoFocus required inputMode="numeric"
                className="w-full h-10 lux-input px-3 text-sm tabular-nums"
              />
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
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="ios-pressable absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: '#0A84FF' }}>
                  {showPassword ? <EyeOff size={15} strokeWidth={2.2} /> : <Eye size={15} strokeWidth={2.2} />}
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
                MT5 Terminal Path <span style={{ color: '#FF453A' }}>*</span>
              </label>
              <div className="flex gap-1.5">
                <div
                  className="flex-1 h-10 lux-input px-3 text-sm flex items-center truncate cursor-default select-none"
                  style={{
                    color: terminalPath ? '#1B75FD' : 'rgba(235,235,245,0.30)',
                    background: 'rgba(27,117,253,0.08)',
                    borderColor: 'rgba(27,117,253,0.35)',
                  }}
                  title={terminalPath || 'ยังไม่ได้เลือก terminal'}
                >
                  {terminalPath || 'ยังไม่ได้เลือก — กดปุ่มค้นหา'}
                </div>
                <button type="button" onClick={detectTerminals} disabled={detectingTerminals}
                  title="ค้นหา MT5 terminal ที่รันอยู่" aria-label="ค้นหา MT5 terminal ที่รันอยู่"
                  className="ios-pressable h-10 px-3 text-sm lux-btn-ghost shrink-0 disabled:opacity-60 flex items-center justify-center">
                  <Search size={15} strokeWidth={2.2} className={detectingTerminals ? 'animate-spin' : ''} />
                </button>
                <button type="button" onClick={browseMT5}
                  title="เลือกไฟล์ terminal64.exe" aria-label="เลือกไฟล์ terminal64.exe"
                  className="ios-pressable h-10 px-3 text-sm lux-btn-ghost shrink-0 flex items-center justify-center">
                  <FolderOpen size={15} strokeWidth={2.2} />
                </button>
              </div>
              {showTerminalDropdown && detectedTerminals.length > 1 && (
                <div className="mt-1.5 lux-card overflow-hidden">
                  <div className="px-3 py-1.5 text-[11px] border-b lux-label"
                    style={{ borderColor: 'rgba(255,214,10,0.20)', color: '#FFD60A' }}>
                    พบ {detectedTerminals.length} terminal — เลือก 1 ตัว
                  </div>
                  {detectedTerminals.map((t, i) => (
                    <button key={i} type="button"
                      onClick={() => { setTerminalPath(t); setShowTerminalDropdown(false); }}
                      className="ios-pressable w-full text-left px-3 py-2 text-xs hover:bg-white/[0.06] truncate"
                      style={{ color: '#FFFFFF' }}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              {detectedTerminals.length === 0 && !detectingTerminals && !terminalPath && (
                <p className="mt-1 text-[11px]" style={{ color: '#FF453A' }}>ต้องเลือก terminal ก่อน login</p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none lux-label">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5" style={{ accentColor: '#0A84FF' }} />
                จดจำบัญชีนี้
              </label>
              <button type="submit" disabled={loading}
                className="ios-pressable h-9 px-6 text-sm login-btn-primary disabled:opacity-60 flex items-center gap-2">
                {loading ? <Loader2 size={15} strokeWidth={2.6} className="animate-spin" /> : null}
                {loading ? 'กำลังเข้าสู่ระบบ' : 'LOGIN'}
              </button>
            </div>

            {ErrorBanner}
          </form>
        </div>
      )}

      <div className="mt-5 text-[10px] font-semibold" style={{ color: 'rgba(27,117,253,0.55)' }}>v{version || '—'}</div>
      <p
        className="mt-1.5 text-xs text-center max-w-xs leading-relaxed mx-auto"
        style={{ color: '#FF453A', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
      >
        <AlertTriangle size={11} strokeWidth={2.2} className="inline-block align-text-bottom mr-1" />
        คำเตือน: การเทรด CFD มีความเสี่ยงสูงมากที่จะสูญเสียเงินลงทุนทั้งหมดอย่างรวดเร็ว
      </p>
    </div>
  );
};

export default Login;
