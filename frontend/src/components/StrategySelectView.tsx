import React, { useEffect, useState } from 'react';
import { Crosshair, ScanSearch, AlertTriangle, ChevronRight, Waves, ArrowDownUp, LayoutGrid } from 'lucide-react';
import api from '../api';

interface StrategySelectViewProps {
  onSelected: (engine: string) => void;
}

interface EngineStatus {
  engine: string;
  locked: boolean;
  running: string[];
}

// SMC (กลยุทธ์หลัก) ขึ้นใบแรกตามที่ user ขอ ที่เหลือเรียงตามภาพ EA Strategies Overview
// available=false คือยังไม่มี engine จริง (เลือกไม่ได้ รอพัฒนา)
const CARDS = [
  {
    id: 'smc',
    order: 'EA STRATEGY 1',
    name: 'SMC',
    thai: 'Smart Money Concept (สมาร์ทมันนี่)',
    icon: ScanSearch,
    color: '#0A84FF',
    tagline: 'Institutional Footprint — Order Blocks & FVG',
    features: ['โซน SBR/RBS + Retest + แท่งยืนยัน', 'Order Blocks & Fair Value Gaps', 'Liquidity Sweep filter'],
    note: 'กลยุทธ์หลัก — ผ่านการรัน live จริงแล้ว',
    available: true,
  },
  {
    id: 'sniper',
    order: 'EA STRATEGY 2',
    name: 'SNIPER',
    thai: 'สไนเปอร์',
    icon: Crosshair,
    color: '#30D158',
    tagline: 'High Precision Entry — Wait for the Perfect Setup',
    features: ['N-bar Breakout entry', 'Measured-move TP', 'Trend filter (HH/HL)'],
    note: 'กลยุทธ์ใหม่ — แนะนำทดสอบบัญชี demo ก่อน',
    available: true,
  },
  {
    id: 'swing',
    order: 'EA STRATEGY 3',
    name: 'SWING TRADE',
    thai: 'สวิงเทรด',
    icon: Waves,
    color: '#40C8E0',
    tagline: 'Catching the Waves — Intermediate-Term Trends',
    features: ['เทรนด์ TF ใหญ่ (HH/HL) + Pullback แตะ EMA20', 'SL หลัง swing · TP 3× ระยะ SL', 'Min-lot Risk Guard กันทุนเล็ก'],
    note: 'แนะนำทุน $1,000+ (M30) — ทดสอบ demo ก่อน',
    available: true,
  },
  {
    id: 'reversal',
    order: 'EA STRATEGY 4',
    name: 'REVERSAL',
    thai: 'การกลับตัว',
    icon: ArrowDownUp,
    color: '#FF9F0A',
    tagline: 'Trend Change Dynamics — Pivot Point Identification',
    features: ['จุดสุดขั้ว N แท่ง (pivot) + RSI 30/70', 'แท่งยืนยันกลับตัว + Trend Filter', '⚠ OOS 2025 เสมอทุน ไม่ใช่กำไร — demo เท่านั้น'],
    note: 'Re-tune แล้ว OOS 2025 พลิกจาก -13R เป็น +0.5R (เสมอทุน) — ใช้บัญชี demo เท่านั้น',
    available: true,
  },
  {
    id: 'grid',
    order: 'EA STRATEGY 5',
    name: 'GRID MARTINGALE',
    thai: 'กริด มาร์ติงเกล',
    icon: LayoutGrid,
    color: '#BF5AF2',
    tagline: 'Market Averaging — Grid & Martingale Logic',
    features: ['ถัวเฉลี่ยราคาแบบกริด (ตาม EMA50)', 'เพิ่ม lot ตามระยะราคา + Basket TP/Stop', '⚠ backtest 2026 ติดลบ — เหมาะ sideways'],
    note: '⚠ ความเสี่ยงสูง — ใช้บัญชี demo เท่านั้น',
    available: true,
  },
];

const StrategySelectView: React.FC<StrategySelectViewProps> = ({ onSelected }) => {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    api.get<EngineStatus>('/api/engine')
      .then((res) => {
        // instance ที่ล็อก engine ผ่าน APOLLO_STRATEGY — ไม่มีอะไรให้เลือก ข้ามหน้านี้เลย
        if (res.data.locked) {
          onSelected(res.data.engine);
          return;
        }
        setStatus(res.data);
      })
      .catch(() => setStatus({ engine: 'smc', locked: false, running: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = async (engine: string) => {
    if (submitting) return;
    setError('');
    setSubmitting(engine);
    try {
      const res = await api.post('/api/engine', { engine });
      if (res.data.success) onSelected(res.data.engine);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'สลับกลยุทธ์ไม่สำเร็จ');
      setSubmitting(null);
    }
  };

  if (!status) return null;

  return (
    <div className="ios-fade-in flex flex-col items-center justify-center min-h-screen bg-glow px-4 py-8">
      <div className="mb-8 text-center">
        <img src="/logo.png" alt="Logo" width={110} height={110} className="mx-auto mb-3 drop-shadow-lg" />
        <div className="text-xl font-bold tracking-wide" style={{ color: '#1B75FD' }}>เลือกกลยุทธ์</div>
        <div className="text-xs tracking-widest mt-1" style={{ color: 'rgba(235,235,245,0.38)' }}>
          EA STRATEGIES — เลือกกลยุทธ์ที่จะใช้กับบัญชีนี้
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4 w-full max-w-[1360px] px-2">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const isCurrent = status.engine === card.id;
          const isRunning = isCurrent && status.running.length > 0;
          const busy = submitting === card.id;
          const isHovered = hovered === card.id;
          const disabled = !card.available || !!submitting;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => card.available && choose(card.id)}
              onMouseEnter={() => setHovered(card.id)}
              onMouseLeave={() => setHovered(null)}
              disabled={disabled}
              className={`ios-pressable lux-card relative flex flex-col p-4 min-h-[440px] ${card.available ? '' : 'cursor-not-allowed'} ${submitting && card.available ? 'opacity-60' : ''}`}
              style={{
                borderColor: isHovered ? card.color : isCurrent ? `${card.color}66` : undefined,
                boxShadow: isHovered
                  ? `0 0 34px -6px ${card.color}88, 0 8px 24px -10px rgba(0,0,0,0.6)`
                  : isCurrent ? `0 0 24px -8px ${card.color}55` : undefined,
                transform: isHovered ? 'translateY(-4px)' : undefined,
                opacity: card.available ? undefined : 0.55,
              }}
            >
              <div className="flex items-center justify-center">
                <span className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-md whitespace-nowrap"
                  style={{ color: card.color, background: `${card.color}1a`, border: `1px solid ${card.color}40` }}>
                  {card.order}
                </span>
              </div>

              <div className="h-6 mt-2 flex items-center justify-center">
                {isRunning ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ color: '#30D158', background: 'rgba(48,209,88,0.12)' }}>
                    ● กำลังรัน
                  </span>
                ) : isCurrent ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ color: 'rgba(235,235,245,0.55)', background: 'rgba(255,255,255,0.06)' }}>
                    ใช้ล่าสุด
                  </span>
                ) : !card.available ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ color: '#FFD60A', background: 'rgba(255,214,10,0.10)' }}>
                    เร็วๆ นี้
                  </span>
                ) : null}
              </div>

              <div className="ios-icon-tile w-16 h-16 mx-auto mt-3"
                style={{ background: `${card.color}1f`, border: `1px solid ${card.color}45` }}>
                <Icon size={30} strokeWidth={2} style={{ color: card.color }} />
              </div>

              <div className="text-center text-base leading-tight font-extrabold tracking-wide mt-3" style={{ color: '#FFFFFF' }}>
                {card.name}
              </div>
              <div className="text-center text-[11px] mt-1" style={{ color: 'rgba(235,235,245,0.45)' }}>{card.thai}</div>

              <div className="text-center text-[11px] font-semibold mt-3" style={{ color: card.color }}>{card.tagline}</div>

              <ul className="mt-3 space-y-1.5 flex-1 text-left">
                {card.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[11px]" style={{ color: 'rgba(235,235,245,0.62)' }}>
                    <ChevronRight size={12} strokeWidth={2.4} className="shrink-0 mt-0.5" style={{ color: `${card.color}aa` }} />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-3 pt-2.5 text-center text-[10px] border-t" style={{ color: 'rgba(235,235,245,0.38)', borderColor: 'rgba(255,255,255,0.08)' }}>
                {card.note}
              </div>

              {card.available ? (
                <div className="mt-3 h-9 flex items-center justify-center text-xs login-btn-primary"
                  style={card.id !== 'smc' ? {
                    background: `linear-gradient(135deg, ${card.color} 0%, ${card.color}88 100%)`,
                    borderColor: `${card.color}59`,
                    boxShadow: `0 6px 18px -6px ${card.color}73`,
                  } : undefined}>
                  {busy ? '...' : isRunning ? 'เข้าใช้งานต่อ' : 'เลือกกลยุทธ์นี้'}
                </div>
              ) : (
                <div className="mt-3 h-9 flex items-center justify-center text-xs rounded-[14px] font-bold"
                  style={{ color: 'rgba(235,235,245,0.35)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  ยังไม่เปิดให้ใช้งาน
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl max-w-xl text-center"
          style={{ color: '#FF453A', background: 'rgba(255,69,58,0.10)', border: '1px solid rgba(255,69,58,0.25)' }}>
          <AlertTriangle size={13} strokeWidth={2.3} className="shrink-0" />
          {error}
        </div>
      )}

      {status.running.length > 0 && (
        <p className="mt-4 text-[11px] text-center max-w-md" style={{ color: 'rgba(235,235,245,0.38)' }}>
          บอทกำลังรันอยู่ด้วยกลยุทธ์เดิม — ถ้าต้องการสลับกลยุทธ์ ให้กด Stop บอทในหน้า Strategy ก่อน
        </p>
      )}
    </div>
  );
};

export default StrategySelectView;
