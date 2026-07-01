import React, { useEffect, useState } from 'react';
import api from '../api';
import LineContact from './LineContact';

interface SettingsViewProps {
  onLogout: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ onLogout }) => {
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/api/settings')
      .then((res) => {
        if (res.data.discord_webhook_url) setDiscordWebhook(res.data.discord_webhook_url);
      })
      .catch((err) => console.error('Failed to load settings', err));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await api.post('/api/settings/discord', { webhook_url: discordWebhook });
      setMessage('บันทึกแล้ว');
    } catch {
      setMessage('บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setMessage('');
    try {
      const res = await api.post('/api/settings/discord/test');
      setMessage(res.data.success ? 'ส่งข้อความทดสอบสำเร็จ' : `ส่งไม่สำเร็จ: ${res.data.error || 'ตรวจสอบ URL'}`);
    } catch {
      setMessage('ส่งไม่สำเร็จ ตรวจสอบ URL');
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <h1 className="lux-h1">Settings</h1>

      <div className="lux-card p-6 max-w-[560px] space-y-3">
        <div>
          <h2 className="lux-title">Discord Notifications</h2>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            แจ้งเตือนเปิด/ปิดไม้ + สรุปพอร์ตรายวัน ผ่าน Discord webhook
          </p>
        </div>
        <input
          type="text"
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full h-11 lux-input px-4 text-sm"
          value={discordWebhook}
          onChange={(e) => setDiscordWebhook(e.target.value)}
        />
        <div className="flex gap-2">
          <button type="button" onClick={handleSave} disabled={saving} className="h-10 px-6 lux-btn-primary text-sm">
            {saving ? 'SAVING...' : 'SAVE'}
          </button>
          <button type="button" onClick={handleTest} className="h-10 px-6 lux-btn-ghost text-sm">TEST</button>
          {message && <span className="self-center text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{message}</span>}
        </div>
      </div>

      <div className="max-w-[560px]">
        <LineContact />
      </div>

      <div className="lux-card p-6 max-w-[560px] space-y-3">
        <div>
          <h2 className="lux-title">Account</h2>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>ออกจากระบบและกลับไปหน้า Login</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="h-10 px-6 lux-btn-ghost text-sm"
          style={{ color: '#FF5252' }}
        >
          LOGOUT
        </button>
      </div>
    </div>
  );
};

export default SettingsView;
