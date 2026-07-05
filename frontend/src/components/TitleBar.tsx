import React, { useState, useEffect } from 'react';

declare global {
  interface Window {
    pywebview?: { api: { minimize(): void; maximize(): void; restore(): void; close(): void } };
  }
}

const isPyWebView = () => !!window.pywebview;

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [instance, setInstance] = useState('');

  useEffect(() => {
    fetch('/api/version')
      .then((r) => r.json())
      .then((d) => setInstance(d.instance ?? ''))
      .catch(() => {});
  }, []);

  if (!isPyWebView()) return null;

  return (
    <div
      className="flex items-center h-10 px-3 select-none shrink-0"
      style={{
        background: 'rgba(11,11,13,0.98)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        // ให้ทั้งแถบ drag ได้ ยกเว้นปุ่ม (override ด้วย no-drag)
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Logo + ชื่อ — no-drag เพื่อไม่บัง text selection */}
      <img
        src="/logo.png" alt="logo"
        className="w-7 h-7 object-contain mr-2 rounded-md"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        draggable={false}
      />
      <span
        className="text-sm font-semibold text-white/80 tracking-wide"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        Apollo Auto Trade
      </span>
      {instance && (
        <span
          className="ml-2 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#0A84FF]/20 text-[#0A84FF] tracking-wide"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {instance}
        </span>
      )}

      {/* spacer — drag ได้ */}
      <div className="flex-1 h-full" />

      {/* Window controls — no-drag */}
      <div
        className="flex items-center gap-1 ml-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Minimize */}
        <button
          onClick={() => window.pywebview!.api.minimize()}
          className="ios-pressable w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
          title="Minimize"
        >
          <svg width="12" height="2" viewBox="0 0 12 2" fill="currentColor">
            <rect width="12" height="2" rx="1"/>
          </svg>
        </button>

        {/* Maximize / Restore */}
        <button
          onClick={() => {
            if (isMaximized) { window.pywebview!.api.restore(); setIsMaximized(false); }
            else { window.pywebview!.api.maximize(); setIsMaximized(true); }
          }}
          className="ios-pressable w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="0" width="8" height="8" rx="1"/>
              <path d="M0 3v6a2 2 0 002 2h6"/>
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="1"/>
            </svg>
          )}
        </button>

        {/* Close */}
        <button
          onClick={() => window.pywebview!.api.close()}
          className="ios-pressable w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#FF453A] text-white/60 hover:text-white"
          title="Close"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="1" y1="1" x2="10" y2="10"/>
            <line x1="10" y1="1" x2="1" y2="10"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
