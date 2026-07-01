import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import api from '../api';
import { ZoneBandPrimitive } from '../lib/zoneBandPrimitive';
import { OrderBlockPrimitive, type OrderBlockData } from '../lib/orderBlockPrimitive';
import type { ActiveZone, CandleRecord, OrderBlock, StructureResponse } from '../types/strategy';

export interface EntryPreview {
  type: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp: number;
}

export interface EntryMarker {
  time: number; // epoch seconds (broker time, ตรงกับแคนเดิล)
  type: 'BUY' | 'SELL';
  price: number;
  lot?: number;
  result?: 'WIN' | 'LOSS' | 'BE' | null;
  pnl?: number | null;
  raw_time?: string;
}

interface SMCChartProps {
  symbol: string;
  timeframe?: string;
  zone: ActiveZone | null;
  candleCount?: number;
  preview?: EntryPreview | null;
  markers?: EntryMarker[];
  retestLevel?: number | null;
  shiftHours?: number;       // เลื่อนเวลาแสดงผลบนแกน X (เช่น เป็นเวลาไทย)
  showOverlays?: boolean;    // false = ซ่อน Order Block เหลือแค่โซน + retest
}

const WIN_COLOR = '#2ECC71';
const LOSS_COLOR = '#E74C3C';
const OPEN_MARK_COLOR = '#95A5A6';
const RETEST_COLOR = '#F1C40F';
const pad2 = (n: number) => String(n).padStart(2, '0');

const SBR_COLOR = 'rgba(231, 76, 60, 0.18)'; // red - sell zone (SBR)
const RBS_COLOR = 'rgba(46, 204, 113, 0.18)'; // green - buy zone (RBS)

const BULLISH_COLOR = '#2ECC71';
const BEARISH_COLOR = '#E74C3C';
const BULLISH_OB_FILL = 'rgba(46, 204, 113, 0.12)';
const BEARISH_OB_FILL = 'rgba(231, 76, 60, 0.12)';
// OB ที่ยังไม่ถูกแตะ (fresh) = ขอบสว่าง+หนา+มีป้าย; OB เก่า (mitigated) = ขอบจาง
const OB_FRESH_BULL = 'rgba(46, 204, 113, 0.95)';
const OB_FRESH_BEAR = 'rgba(231, 76, 60, 0.95)';
const OB_OLD_BULL = 'rgba(46, 204, 113, 0.30)';
const OB_OLD_BEAR = 'rgba(231, 76, 60, 0.30)';

// FVG สีม่วง/amber แยกจาก OB ชัดเจน
const FVG_BULL_FILL = 'rgba(167, 139, 250, 0.10)';   // violet
const FVG_BEAR_FILL = 'rgba(245, 158, 11, 0.10)';    // amber
const FVG_BULL_BORDER = 'rgba(167, 139, 250, 0.80)';
const FVG_BEAR_BORDER = 'rgba(245, 158, 11, 0.80)';

// Order Block ที่ยังไม่ mitigate ทั้งหมด + mitigated ล่าสุดอีกไม่กี่โซน (กันกราฟรก)
const MAX_MITIGATED_ORDER_BLOCKS = 2;
const OB_MAX_DISTANCE = 0.02;  // ซ่อน OB ที่ห่างราคาปัจจุบันเกิน 2%

// คืนรายการโซนที่ยัง unmitigated ทั้งหมด + mitigated ล่าสุดไม่เกิน maxMitigated โซน (กันกราฟรก)
function pickZones(zones: OrderBlock[], maxMitigated: number): OrderBlock[] {
  const unmitigated = zones.filter((z) => !z.mitigated);
  const mitigated = zones.filter((z) => z.mitigated).slice(-maxMitigated);
  return [...mitigated, ...unmitigated];
}

const TIMEFRAME_SECONDS: Record<string, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  H1: 3600,
};

interface LiveCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const SMCChart: React.FC<SMCChartProps> = ({ symbol, timeframe = 'M5', zone, candleCount = 700, preview = null, markers, retestLevel = null, shiftHours = 0, showOverlays = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const retestLineRef = useRef<IPriceLine | null>(null);
  const positionBoxRef = useRef<OrderBlockPrimitive | null>(null);
  const markersDataRef = useRef<EntryMarker[]>([]);
  const shiftRef = useRef(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; m: EntryMarker } | null>(null);

  // formatter แกนเวลา: เลื่อนตาม shiftHours แล้วอ่านเป็น UTC parts (ได้ wallclock ที่เลื่อนแล้ว)
  const fmtFull = (t: Time) => {
    const dt = new Date((Number(t) + shiftRef.current * 3600) * 1000);
    return `${pad2(dt.getUTCDate())}/${pad2(dt.getUTCMonth() + 1)} ${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}`;
  };
  const fmtTick = (t: Time) => {
    const dt = new Date((Number(t) + shiftRef.current * 3600) * 1000);
    const h = dt.getUTCHours();
    return h === 0 ? `${pad2(dt.getUTCDate())}/${pad2(dt.getUTCMonth() + 1)}` : `${pad2(h)}:${pad2(dt.getUTCMinutes())}`;
  };
  const zonePrimitiveRef = useRef<ZoneBandPrimitive | null>(null);
  const orderBlockPrimitiveRef = useRef<OrderBlockPrimitive | null>(null);
  const fvgPrimitiveRef = useRef<OrderBlockPrimitive | null>(null);
  const lastCandleRef = useRef<LiveCandle | null>(null);

  // Create the chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#121212' },
        textColor: '#cccccc',
      },
      grid: {
        vertLines: { color: '#222222' },
        horzLines: { color: '#222222' },
      },
      timeScale: { timeVisible: true, secondsVisible: false, tickMarkFormatter: fmtTick, rightOffset: 12 },
      localization: { timeFormatter: fmtFull },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#2ECC71',
      downColor: '#E74C3C',
      borderVisible: false,
      wickUpColor: '#2ECC71',
      wickDownColor: '#E74C3C',
    });

    const zonePrimitive = new ZoneBandPrimitive();
    candleSeries.attachPrimitive(zonePrimitive);

    const orderBlockPrimitive = new OrderBlockPrimitive();
    candleSeries.attachPrimitive(orderBlockPrimitive);

    const fvgPrimitive = new OrderBlockPrimitive();
    candleSeries.attachPrimitive(fvgPrimitive);

    // กล่อง RR (Entry→TP เขียว / Entry→SL แดง) — วาดทับท้ายสุดให้เห็นชัด
    const positionBox = new OrderBlockPrimitive();
    candleSeries.attachPrimitive(positionBox);

    markersRef.current = createSeriesMarkers(candleSeries, []);

    // tooltip เมื่อ hover ใกล้จุดที่เคยเข้าไม้
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.time === undefined) { setTooltip(null); return; }
      const t = Number(param.time);
      let best: EntryMarker | null = null;
      let bestDiff = Infinity;
      for (const m of markersDataRef.current) {
        const diff = Math.abs(m.time - t);
        if (diff < bestDiff) { bestDiff = diff; best = m; }
      }
      const tol = (TIMEFRAME_SECONDS[timeframe] ?? 300) * 1.5;
      if (best && bestDiff <= tol) setTooltip({ x: param.point.x, y: param.point.y, m: best });
      else setTooltip(null);
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    positionBoxRef.current = positionBox;
    zonePrimitiveRef.current = zonePrimitive;
    orderBlockPrimitiveRef.current = orderBlockPrimitive;
    fvgPrimitiveRef.current = fvgPrimitive;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      markersRef.current = null;
      priceLinesRef.current = [];
      retestLineRef.current = null;
      positionBoxRef.current = null;
      zonePrimitiveRef.current = null;
      orderBlockPrimitiveRef.current = null;
      fvgPrimitiveRef.current = null;
    };
  }, []);

  // Poll candle data
  useEffect(() => {
    let cancelled = false;

    const fetchCandles = async () => {
      try {
        const res = await api.get<CandleRecord[]>('/api/candles', {
          params: { symbol, timeframe, count: candleCount },
        });
        if (cancelled) return;
        const data = res.data;

        candleSeriesRef.current?.setData(
          data.map((d) => ({
            time: d.time as UTCTimestamp,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          }))
        );

        const lastBar = data[data.length - 1];
        lastCandleRef.current = lastBar
          ? {
              time: lastBar.time,
              open: lastBar.open,
              high: lastBar.high,
              low: lastBar.low,
              close: lastBar.close,
            }
          : null;
      } catch (err) {
        console.error('Failed to load candles', err);
      }
    };

    fetchCandles();
    const interval = setInterval(fetchCandles, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol, timeframe, candleCount]);

  // Poll market structure (BOS/CHoCH + Order Block) for the SMC overlay
  useEffect(() => {
    let cancelled = false;

    const fetchStructure = async () => {
      if (!showOverlays) {
        orderBlockPrimitiveRef.current?.setBlocks([]);
        fvgPrimitiveRef.current?.setBlocks([]);
        return;
      }
      try {
        const res = await api.get<StructureResponse>('/api/structure', {
          params: { symbol, timeframe, count: 400 },
        });
        if (cancelled) return;
        const price = lastCandleRef.current?.close ?? 0;

        // Order Blocks
        const blocks: OrderBlockData[] = pickZones(res.data.order_blocks, MAX_MITIGATED_ORDER_BLOCKS)
          .filter((ob) => {
            if (!price) return true;
            const mid = (ob.top + ob.bottom) / 2;
            return Math.abs(mid - price) / price <= OB_MAX_DISTANCE;
          })
          .map((ob) => {
            const bull = ob.direction === 'bullish';
            const fresh = !ob.mitigated;
            return {
              startTime: ob.start_time, endTime: ob.end_time, top: ob.top, bottom: ob.bottom,
              fillColor: bull ? BULLISH_OB_FILL : BEARISH_OB_FILL,
              borderColor: fresh ? (bull ? OB_FRESH_BULL : OB_FRESH_BEAR) : (bull ? OB_OLD_BULL : OB_OLD_BEAR),
              lineWidth: fresh ? 2 : 1,
              label: fresh ? 'OB' : undefined,
            };
          });
        orderBlockPrimitiveRef.current?.setBlocks(blocks);

        // FVG — แสดงเฉพาะ unmitigated ที่ใกล้ราคา
        const fvgBlocks: OrderBlockData[] = (res.data.fvgs ?? [])
          .filter((fvg) => {
            if (fvg.mitigated) return false;
            if (!price) return true;
            const mid = (fvg.top + fvg.bottom) / 2;
            return Math.abs(mid - price) / price <= OB_MAX_DISTANCE;
          })
          .map((fvg) => {
            const bull = fvg.direction === 'bullish';
            return {
              startTime: fvg.start_time, endTime: fvg.end_time, top: fvg.top, bottom: fvg.bottom,
              fillColor: bull ? FVG_BULL_FILL : FVG_BEAR_FILL,
              borderColor: bull ? FVG_BULL_BORDER : FVG_BEAR_BORDER,
              lineWidth: 1,
              label: 'FVG',
            };
          });
        fvgPrimitiveRef.current?.setBlocks(fvgBlocks);
      } catch (err) {
        console.error('Failed to load market structure', err);
      }
    };

    fetchStructure();
    const interval = setInterval(fetchStructure, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol, timeframe, showOverlays]);

  // Live price ticks via websocket - update the in-progress candle in real time
  useEffect(() => {
    const tfSeconds = TIMEFRAME_SECONDS[timeframe] ?? 300;
    const wsUrl = (api.defaults.baseURL as string).replace(/^http/, 'ws') + `/ws/prices/${symbol}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        const last = lastCandleRef.current;
        if (!last) return;

        const tick = JSON.parse(event.data);
        const price = (tick.bid + tick.ask) / 2;
        const bucket = Math.floor(tick.time / tfSeconds) * tfSeconds;

        let updated: LiveCandle;
        if (bucket > last.time) {
          updated = { time: bucket, open: price, high: price, low: price, close: price };
        } else if (bucket === last.time) {
          updated = {
            ...last,
            close: price,
            high: Math.max(last.high, price),
            low: Math.min(last.low, price),
          };
        } else {
          return;
        }

        lastCandleRef.current = updated;
        candleSeriesRef.current?.update({
          time: updated.time as UTCTimestamp,
          open: updated.open,
          high: updated.high,
          low: updated.low,
          close: updated.close,
        });
      };

      ws.onclose = () => {
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [symbol, timeframe]);

  // Update the zone overlay whenever the zone state changes
  useEffect(() => {
    if (!zonePrimitiveRef.current) return;

    if (zone && (zone.zone_type === 0 || zone.zone_type === 1)) {
      zonePrimitiveRef.current.setZone({
        high: zone.high_limit,
        low: zone.low_limit,
        color: zone.zone_type === 0 ? SBR_COLOR : RBS_COLOR,
      });
    } else {
      zonePrimitiveRef.current.setZone(null);
    }
  }, [zone]);

  // ปรับ shift เวลาแสดงผล + รีเฟรชแกนเวลา
  useEffect(() => {
    shiftRef.current = shiftHours;
    // re-apply localization เพื่อบังคับวาดแกนเวลาใหม่ (fmtTick/fmtFull อ่าน shiftRef แบบ dynamic)
    chartRef.current?.applyOptions({ localization: { timeFormatter: fmtFull } });
  }, [shiftHours]);

  // มาร์คจุดที่เคยเข้าไม้ — สี: WIN เขียว / LOSS แดง / ยังเปิด เทา; ลูกศรบอกทิศ
  useEffect(() => {
    if (!markersRef.current) return;
    markersDataRef.current = markers ?? [];
    const data: SeriesMarker<Time>[] = (markers ?? [])
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((m) => {
        const color = m.result === 'WIN' ? WIN_COLOR : m.result === 'LOSS' ? LOSS_COLOR : OPEN_MARK_COLOR;
        return {
          time: m.time as UTCTimestamp,
          position: m.type === 'BUY' ? 'belowBar' : 'aboveBar',
          color,
          shape: m.type === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: m.result ? `${m.type} ${m.result}` : m.type,
        };
      });
    markersRef.current.setMarkers(data);
  }, [markers]);

  // เส้น Entry / SL / TP + กล่อง RR ของจุดที่กำลังรอเข้า
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    priceLinesRef.current.forEach((pl) => series.removePriceLine(pl));
    priceLinesRef.current = [];
    if (preview) {
      const add = (price: number, color: string, title: string) =>
        priceLinesRef.current.push(
          series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title })
        );
      add(preview.entry, '#3498DB', 'Entry');
      add(preview.sl, BEARISH_COLOR, 'SL');
      add(preview.tp, BULLISH_COLOR, 'TP');
    }

    // กล่อง RR: Entry→TP (เขียว, กำไร) และ Entry→SL (แดง, ขาดทุน) วาดในช่วงแท่งล่าสุด
    if (preview && positionBoxRef.current && lastCandleRef.current) {
      const tf = TIMEFRAME_SECONDS[timeframe] ?? 300;
      const end = lastCandleRef.current.time;
      const start = end - 25 * tf;
      positionBoxRef.current.setBlocks([
        { startTime: start, endTime: end, top: Math.max(preview.entry, preview.tp), bottom: Math.min(preview.entry, preview.tp), fillColor: 'rgba(46, 204, 113, 0.10)', borderColor: 'rgba(46, 204, 113, 0.4)' },
        { startTime: start, endTime: end, top: Math.max(preview.entry, preview.sl), bottom: Math.min(preview.entry, preview.sl), fillColor: 'rgba(231, 76, 60, 0.10)', borderColor: 'rgba(231, 76, 60, 0.4)' },
      ]);
    } else {
      positionBoxRef.current?.setBlocks([]);
    }
  }, [preview, timeframe]);

  // เส้น retest level (จุดเหลืองที่ราคาต้องกลับมาแตะ) — โชว์เฉพาะตอนยังไม่ retest
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    if (retestLineRef.current) { series.removePriceLine(retestLineRef.current); retestLineRef.current = null; }
    if (retestLevel != null) {
      retestLineRef.current = series.createPriceLine({
        price: retestLevel, color: RETEST_COLOR, lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: 'Retest',
      });
    }
  }, [retestLevel]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none rounded-md border border-[var(--hairline)] bg-[#0C0C0E]/95 px-2.5 py-1.5 text-[11px] leading-tight shadow-lg"
          style={{ left: Math.min(tooltip.x + 12, 9999), top: tooltip.y + 12 }}
        >
          <div className={`font-semibold ${tooltip.m.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
            {tooltip.m.type}{tooltip.m.result ? ` · ${tooltip.m.result}` : ''}
          </div>
          <div className="text-ink-muted tabular-nums">ราคา {tooltip.m.price}{tooltip.m.lot != null ? ` · ${tooltip.m.lot} lot` : ''}</div>
          {tooltip.m.pnl != null && (
            <div className={`tabular-nums ${tooltip.m.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {tooltip.m.pnl >= 0 ? '+' : ''}{tooltip.m.pnl}
            </div>
          )}
          {tooltip.m.raw_time && <div className="text-ink-faint">{tooltip.m.raw_time}</div>}
        </div>
      )}
    </div>
  );
};

export default SMCChart;
