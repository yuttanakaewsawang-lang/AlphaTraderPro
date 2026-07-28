import React, { useEffect, useRef, useState } from 'react';

/**
 * นับตัวเลขไหลจากค่าเดิม → ค่าใหม่ด้วย rAF (ease-out cubic)
 * ถูกขัดจังหวะกลางทางได้ — ค่าใหม่วิ่งต่อจากตำแหน่งปัจจุบัน ไม่กระตุก
 * (เดิมนิยามซ้ำใน BacktestReplayView.tsx — ย้ายมาที่นี่ให้ Dashboard ใช้ร่วม)
 */
export const useCountUp = (target: number, ms = 320) => {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * eased;
      fromRef.current = v;
      setVal(v);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else { fromRef.current = target; setVal(target); }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, ms]);
  return val;
};

export const AnimatedNum: React.FC<{
  value: number; decimals?: number; prefix?: string; suffix?: string; signed?: boolean; className?: string;
}> = ({ value, decimals = 2, prefix = '', suffix = '', signed = false, className = '' }) => {
  const v = useCountUp(value);
  const sign = signed && v > 0 ? '+' : v < 0 ? '−' : '';
  const body = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span className={`tabular-nums ${className}`}>{sign}{prefix}{body}{suffix}</span>;
};
