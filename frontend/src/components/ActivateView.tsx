import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, Copy } from 'lucide-react';
import LineContact from './LineContact';

const API_BASE = window.location.origin;

interface Props {
  onActivated: () => void;
}

const ActivateView: React.FC<Props> = ({ onActivated }) => {
  const [machineId, setMachineId] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE}/api/license`).then((res) => {
      setMachineId(res.data.machine_id || '');
    }).catch(() => {});
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(machineId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE}/api/license/activate`, { key });
      if (res.data.success) {
        onActivated();
      } else {
        setError(res.data.message || 'Activate ไม่สำเร็จ');
      }
    } catch {
      setError('ไม่สามารถเชื่อมต่อ server ได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ios-fade-in h-screen bg-glow flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[400px] flex flex-col items-center gap-5">
        <img src="/logo.png" alt="Logo" className="w-20 h-20 object-contain" />
        <div className="text-center">
          <h1 className="text-gradient-gold text-xl font-semibold tracking-tight">Apollo Auto Trade</h1>
          <p className="text-ink-muted text-sm mt-1">กรุณา Activate License ก่อนใช้งาน</p>
        </div>

        <div className="w-full lux-panel p-5 space-y-4">
          {/* Machine ID */}
          <div>
            <label className="text-ink-muted text-xs mb-1 block">Machine ID (ส่งให้ผู้ดูแลระบบ)</label>
            <div className="flex gap-2">
              <div className="flex-1 h-10 lux-input px-3 flex items-center font-mono text-sm text-white/80 select-all">
                {machineId || '...'}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="ios-pressable px-3 h-10 login-btn-primary text-sm shrink-0 flex items-center gap-1.5"
              >
                {copied ? <><Check size={14} strokeWidth={2.4} /> Copied</> : <><Copy size={14} strokeWidth={2.2} /> Copy</>}
              </button>
            </div>
          </div>

          {/* License Key input */}
          <form onSubmit={handleActivate} className="space-y-3">
            <div>
              <label className="text-ink-muted text-xs mb-1 block">License Key</label>
              <input
                type="text"
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XX"
                className="w-full h-10 lux-input px-3 font-mono text-sm"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="ios-pressable w-full h-11 login-btn-primary text-sm tracking-wide"
            >
              {loading ? 'กำลังตรวจสอบ...' : 'ACTIVATE'}
            </button>
            {error && <p className="text-red-400 text-center text-sm">{error}</p>}
          </form>
        </div>

        <LineContact />

        <p className="cfd-warning text-xs text-center mt-4 max-w-sm leading-relaxed font-semibold">
          ⚠ คำเตือน: การเทรด CFD มีความเสี่ยงสูงมากที่จะสูญเสียเงินลงทุนทั้งหมดอย่างรวดเร็ว ควรศึกษาข้อมูลก่อนทุกครั้งก่อนลงทุน
        </p>
      </div>
    </div>
  );
};

export default ActivateView;
