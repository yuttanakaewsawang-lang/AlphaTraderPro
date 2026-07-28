import React, { useEffect, useState } from 'react';
import { LogOut, Layers, MessageSquare, Loader2, Check, X, Send, ShieldCheck } from 'lucide-react';
import api from '../api';
import LineContact from './LineContact';

interface SettingsViewProps {
  onLogout: () => void;
  onChangeStrategy: () => void;
}

const ENGINE_LABELS: Record<string, string> = {
  smc: 'SMC — Smart Money Concept',
  sniper: 'SNIPER — N-bar Breakout',
  swing: 'SWING — Trend Pullback',
  reversal: 'REVERSAL — RSI Extreme',
  grid: 'GRID — Martingale Basket',
  combo: 'COMBO — SMC + Sniper (รัน 2 logic พร้อมกัน)',
};
const ENGINE_COLOR: Record<string, string> = {
  smc: '#0A84FF', sniper: '#30D158', swing: '#40C8E0', reversal: '#FF9F0A', grid: '#BF5AF2',
  combo: '#30D158',
};

type MsgKind = 'ok' | 'err' | null;

const SettingsView: React.FC<SettingsViewProps> = ({ onLogout, onChangeStrategy }) => {
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgKind, setMsgKind] = useState<MsgKind>(null);
  const [engine, setEngine] = useState('');
  const [engineLocked, setEngineLocked] = useState(false);
  const [account, setAccount] = useState('');

  useEffect(() => {
    api.get('/api/settings')
      .then((res) => { if (res.data.discord_webhook_url) setDiscordWebhook(res.data.discord_webhook_url); })
      .catch((err) => console.error('Failed to load settings', err));
    api.get('/api/engine')
      .then((res) => { setEngine(res.data.engine); setEngineLocked(!!res.data.locked); })
      .catch(() => {});
    api.get('/api/version')
      .then((res) => setAccount(res.data.account ?? ''))
      .catch(() => {});
  }, []);

  const flash = (text: string, kind: MsgKind) => { setMsg(text); setMsgKind(kind); };

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      await api.post('/api/settings/discord', { webhook_url: discordWebhook });
      flash('บันทึกแล้ว', 'ok');
    } catch {
      flash('บันทึกไม่สำเร็จ', 'err');
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setMsg('');
    try {
      const res = await api.post('/api/settings/discord/test');
      if (res.data.success) flash('ส่งข้อความทดสอบสำเร็จ — เช็ก Discord ได้เลย', 'ok');
      else flash(`ส่งไม่สำเร็จ: ${res.data.error || 'ตรวจสอบ URL'}`, 'err');
    } catch {
      flash('ส่งไม่สำเร็จ ตรวจสอบ URL', 'err');
    } finally { setTesting(false); }
  };

  const eColor = ENGINE_COLOR[engine] || '#0A84FF';
  const linked = discordWebhook.trim().length > 0;

  return (
    <div className="ios-fade-in flex flex-col gap-3 h-full">
      <h1 className="lux-h1">Settings</h1>

      {/* ── Discord ─────────────────────────────── */}
      <div className="lux-card p-6 max-w-[560px] space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 ios-icon-tile w-9 h-9" style={{ background: 'rgba(88,101,242,0.16)', color: '#8B93F7' }}>
            <MessageSquare size={16} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="lux-title" style={{ color: 'rgba(235,235,245,0.6)' }}>Discord Notifications</h2>
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                style={linked
                  ? { color: '#30D158', background: 'rgba(48,209,88,0.14)' }
                  : { color: 'rgba(235,235,245,0.5)', background: 'rgba(255,255,255,0.06)' }}
              >
                {linked ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม'}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'rgba(235,235,245,0.38)' }}>
              แจ้งเตือนเปิด/ปิดไม้ + สรุปพอร์ตรายวัน
              {account && <> · ผูกกับบัญชี <span className="tabular-nums font-semibold" style={{ color: '#0A84FF' }}>{account}</span> เท่านั้น</>}
            </p>
          </div>
        </div>

        <input
          type="text"
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full h-11 lux-input px-4 text-sm"
          value={discordWebhook}
          onChange={(e) => { setDiscordWebhook(e.target.value); setMsg(''); }}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={handleSave} disabled={saving}
            className="ios-pressable h-10 px-6 lux-btn-primary text-sm flex items-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={14} strokeWidth={2.6} className="animate-spin" /> : null}
            {saving ? 'กำลังบันทึก' : 'บันทึก'}
          </button>
          <button type="button" onClick={handleTest} disabled={testing || !linked}
            className="ios-pressable h-10 px-5 lux-btn-ghost text-sm flex items-center gap-2 disabled:opacity-45"
            title={linked ? 'ส่งข้อความทดสอบไป Discord' : 'ใส่ webhook URL ก่อน'}>
            {testing ? <Loader2 size={14} strokeWidth={2.4} className="animate-spin" /> : <Send size={14} strokeWidth={2.2} />}
            ทดสอบ
          </button>
          {msg && (
            <span
              role="status" aria-live="polite"
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: msgKind === 'ok' ? '#30D158' : msgKind === 'err' ? '#FF6961' : 'rgba(235,235,245,0.55)' }}
            >
              {msgKind === 'ok' ? <Check size={13} strokeWidth={2.6} /> : msgKind === 'err' ? <X size={13} strokeWidth={2.6} /> : null}
              {msg}
            </span>
          )}
        </div>
      </div>

      {/* ── Strategy ────────────────────────────── */}
      <div className="lux-card p-6 max-w-[560px] space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 ios-icon-tile w-9 h-9" style={{ background: `${eColor}22`, color: eColor }}>
            <Layers size={16} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="lux-title" style={{ color: 'rgba(235,235,245,0.6)' }}>Strategy</h2>
            <p className="text-xs mt-1" style={{ color: 'rgba(235,235,245,0.38)' }}>
              กลยุทธ์ที่ใช้อยู่: <span style={{ color: eColor, fontWeight: 600 }}>{ENGINE_LABELS[engine] || engine || '—'}</span>
              {engineLocked && ' (ล็อกโดย instance นี้ — สลับไม่ได้)'}
            </p>
          </div>
        </div>
        {!engineLocked && (
          <button
            type="button"
            onClick={onChangeStrategy}
            className="ios-pressable h-10 px-6 lux-btn-ghost text-sm flex items-center gap-2"
            style={{ color: eColor }}
          >
            <Layers size={14} strokeWidth={2.2} />
            เปลี่ยนกลยุทธ์
          </button>
        )}
      </div>

      <div className="max-w-[560px]">
        <LineContact />
      </div>

      {/* ── Account ─────────────────────────────── */}
      <div className="lux-card p-6 max-w-[560px] space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 ios-icon-tile w-9 h-9" style={{ background: 'rgba(255,69,58,0.14)', color: '#FF453A' }}>
            <ShieldCheck size={16} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="lux-title" style={{ color: 'rgba(235,235,245,0.6)' }}>Account</h2>
            <p className="text-xs mt-1" style={{ color: 'rgba(235,235,245,0.38)' }}>
              {account ? <>บัญชีที่ล็อกอินอยู่: <span className="tabular-nums font-semibold" style={{ color: '#FFFFFF' }}>{account}</span> · </> : null}
              ออกจากระบบและกลับไปหน้า Login
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="ios-pressable h-10 px-6 lux-btn-ghost text-sm flex items-center gap-2"
          style={{ color: '#FF453A' }}
        >
          <LogOut size={14} strokeWidth={2.2} />
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
};

export default SettingsView;
