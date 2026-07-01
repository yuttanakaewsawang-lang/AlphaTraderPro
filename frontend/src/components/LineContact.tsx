import React from 'react';

const LineContact: React.FC = () => (
  <div className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--hairline)] bg-white/[0.02]">
    <p className="text-ink-muted text-xs uppercase tracking-widest">ติดต่อผู้ดูแลระบบ</p>
    <img
      src="https://qr-official.line.me/gs/M_574ndzhl_GW.png?oat_content=qr"
      alt="LINE QR Code"
      className="w-28 h-28 rounded-lg"
      draggable={false}
    />
    <p className="text-ink-faint text-[11px]">สแกน QR หรือค้นหา LINE ID</p>
  </div>
);

export default LineContact;
