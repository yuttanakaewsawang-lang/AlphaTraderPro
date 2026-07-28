import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitivePaneViewZOrder,
  ISeriesApi,
  SeriesType,
  Time,
  IChartApiBase,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

// ไม้ที่ "เปิดอยู่" — วาดเป็นกล่อง position สไตล์ TradingView (โซนกำไร/ขาดทุน + เส้นราคา)
export interface OpenPosition {
  entryTime: Time;   // เวลาแท่งที่เข้าไม้ (ขอบซ้ายของกล่อง)
  rightTime: Time;   // ขอบขวาของกล่อง — ยืดตามแท่งปัจจุบันระหว่าง replay
  entry: number;
  sl: number;
  tp: number;
  type: 'BUY' | 'SELL';
}

// ไม้ที่ "ปิดแล้ว" — จุดเข้า/ออกที่ราคาจริงเป๊ะ ค้างไว้เป็นรอยเทรด
export interface ClosedMark {
  entryTime: Time;
  entryPrice: number;
  exitTime: Time;
  exitPrice: number;
  type: 'BUY' | 'SELL';
  win: boolean;
}

const G = '48, 209, 88';   // iOS green
const R = '255, 69, 58';   // iOS red

function hline(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// สามเหลี่ยมทิศทาง (จุดเข้าไม้ที่ปิดแล้ว) — ชี้ขึ้น = BUY, ชี้ลง = SELL
function dirTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, up: boolean, color: string): void {
  ctx.beginPath();
  if (up) {
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx - s, cy + s);
    ctx.lineTo(cx + s, cy + s);
  } else {
    ctx.moveTo(cx, cy + s);
    ctx.lineTo(cx - s, cy - s);
    ctx.lineTo(cx + s, cy - s);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.28);
  ctx.stroke();
}

// ข้าวหลามตัด (จุดออกไม้ที่ปิดแล้ว)
function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s, cy);
  ctx.lineTo(cx, cy + s);
  ctx.lineTo(cx - s, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.28);
  ctx.stroke();
}

// ลูกศรชี้ขวา — ปลายแตะขอบซ้ายของกล่องที่ระดับราคา entry เป๊ะ
function entryArrow(ctx: CanvasRenderingContext2D, tipX: number, y: number, s: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(tipX, y);
  ctx.lineTo(tipX - s * 1.8, y - s);
  ctx.lineTo(tipX - s * 1.8, y + s);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = Math.max(1, s * 0.22);
  ctx.stroke();
}

// ป้ายราคาเล็ก — ปลายขวาชิดขอบขวาของกล่อง (อยู่ในกล่อง)
function priceTag(
  ctx: CanvasRenderingContext2D, xRight: number, y: number, text: string,
  bg: string, fg: string, hpr: number, vpr: number,
): void {
  const fontPx = 10 * vpr;
  ctx.font = `600 ${fontPx}px -apple-system, 'SF Pro Text', system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const padX = 5 * hpr;
  const padY = 3 * vpr;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  const h = fontPx + padY * 2;
  const x = xRight - w;
  roundRect(ctx, x, y - h / 2, w, h, 3 * vpr);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.fillText(text, x + padX, y);
}

class TradePaneRenderer implements IPrimitivePaneRenderer {
  private _source: TradePositionPrimitive;
  constructor(source: TradePositionPrimitive) { this._source = source; }

  draw(target: CanvasRenderingTarget2D): void {
    const series = this._source.series;
    const chart = this._source.chart;
    if (!series || !chart) return;
    const ts = chart.timeScale();
    const digits = this._source.digits;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hpr = scope.horizontalPixelRatio;
      const vpr = scope.verticalPixelRatio;

      // ── รอยเทรดที่ปิดแล้ว: จุดเข้า/ออกที่ราคาจริงเป๊ะ + เส้นเชื่อมจาง ──────
      for (const m of this._source.closed) {
        const x1 = ts.timeToCoordinate(m.entryTime);
        const yE = series.priceToCoordinate(m.entryPrice);
        if (x1 === null || yE === null) continue;
        const ex = x1 * hpr, ey = yE * vpr;
        const x2 = ts.timeToCoordinate(m.exitTime);
        const yX = series.priceToCoordinate(m.exitPrice);
        if (x2 !== null && yX !== null) {
          const xx = x2 * hpr, xy = yX * vpr;
          ctx.strokeStyle = `rgba(${m.win ? G : R}, 0.32)`;
          ctx.lineWidth = Math.max(1, 1 * vpr);
          ctx.setLineDash([2 * hpr, 2 * hpr]);
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(xx, xy);
          ctx.stroke();
          ctx.setLineDash([]);
          diamond(ctx, xx, xy, 3.4 * vpr, `rgb(${m.win ? G : R})`);
        }
        dirTriangle(ctx, ex, ey, 3.8 * vpr, m.type === 'BUY', `rgb(${m.type === 'BUY' ? G : R})`);
      }

      // ── ไม้ที่เปิดอยู่: กล่อง position ────────────────────────────────────
      const p = this._source.open;
      if (!p) return;
      const x1raw = ts.timeToCoordinate(p.entryTime);
      const x2raw = ts.timeToCoordinate(p.rightTime);
      const yE = series.priceToCoordinate(p.entry);
      const yS = series.priceToCoordinate(p.sl);
      const yT = series.priceToCoordinate(p.tp);
      if (x1raw === null || yE === null || yS === null || yT === null) return;
      const x1c: number = x1raw;
      const x2c: number = x2raw === null ? x1raw + 48 : x2raw;

      const bx1 = Math.min(x1c, x2c) * hpr;
      const bx2 = Math.max(x1c, x2c) * hpr;
      const w = Math.max(3, bx2 - bx1);
      const eY = yE * vpr, sY = yS * vpr, tY = yT * vpr;

      // โซนกำไร (entry→TP เขียว) / โซนขาดทุน (entry→SL แดง)
      ctx.fillStyle = `rgba(${G}, 0.12)`;
      ctx.fillRect(bx1, Math.min(eY, tY), w, Math.abs(tY - eY));
      ctx.fillStyle = `rgba(${R}, 0.12)`;
      ctx.fillRect(bx1, Math.min(eY, sY), w, Math.abs(sY - eY));

      // เส้นขอบ TP/SL + เส้น entry ประ
      ctx.lineWidth = Math.max(1, 1.4 * vpr);
      ctx.strokeStyle = `rgba(${G}, 0.95)`;
      hline(ctx, bx1, tY, bx2);
      ctx.strokeStyle = `rgba(${R}, 0.95)`;
      hline(ctx, bx1, sY, bx2);
      ctx.strokeStyle = 'rgba(235, 235, 245, 0.9)';
      ctx.setLineDash([4 * hpr, 3 * hpr]);
      hline(ctx, bx1, eY, bx2);
      ctx.setLineDash([]);

      // ขอบซ้าย (แนวตั้ง) เชื่อม SL↔TP
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = Math.max(1, 1 * vpr);
      ctx.beginPath();
      ctx.moveTo(bx1, Math.min(sY, tY));
      ctx.lineTo(bx1, Math.max(sY, tY));
      ctx.stroke();

      // ลูกศรจุดเข้า — ปลายแตะขอบซ้ายที่ระดับ entry เป๊ะ
      entryArrow(ctx, bx1, eY, 6.5 * vpr, p.type === 'BUY' ? `rgb(${G})` : `rgb(${R})`);

      // ป้ายราคา (ชิดขอบขวากล่อง)
      priceTag(ctx, bx2, tY, `TP ${p.tp.toFixed(digits)}`, `rgba(${G}, 0.95)`, '#06120A', hpr, vpr);
      priceTag(ctx, bx2, eY, p.entry.toFixed(digits), 'rgba(235, 235, 245, 0.95)', '#101014', hpr, vpr);
      priceTag(ctx, bx2, sY, `SL ${p.sl.toFixed(digits)}`, `rgba(${R}, 0.95)`, '#160707', hpr, vpr);
    });
  }
}

class TradePaneView implements IPrimitivePaneView {
  private _source: TradePositionPrimitive;
  constructor(source: TradePositionPrimitive) { this._source = source; }
  zOrder(): PrimitivePaneViewZOrder { return 'top'; }
  renderer(): IPrimitivePaneRenderer | null { return new TradePaneRenderer(this._source); }
}

// วาดจุด entry/SL/TP/exit ให้ตรงตำแหน่งราคาจริงเป๊ะ:
//  • ไม้ที่เปิดอยู่ → กล่อง position (โซนกำไร/ขาดทุน + เส้นราคา + ลูกศรจุดเข้า)
//  • ไม้ที่ปิดแล้ว  → สามเหลี่ยมจุดเข้า + ข้าวหลามตัดจุดออก ณ ราคาจริง
export class TradePositionPrimitive implements ISeriesPrimitive<Time> {
  series: ISeriesApi<SeriesType, Time> | null = null;
  chart: IChartApiBase<Time> | null = null;
  open: OpenPosition | null = null;
  closed: ClosedMark[] = [];
  digits = 2;

  private _paneViews: TradePaneView[];
  private _requestUpdate: (() => void) | null = null;

  constructor() {
    this._paneViews = [new TradePaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.series = param.series;
    this.chart = param.chart;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.series = null;
    this.chart = null;
    this._requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  setDigits(d: number): void { this.digits = d; }

  setOpen(o: OpenPosition | null): void {
    this.open = o;
    this._requestUpdate?.();
  }

  // ยืดขอบขวาของกล่องมาถึงแท่งปัจจุบัน (เรียกทุกแท่งระหว่าง replay)
  setRightTime(t: Time): void {
    if (!this.open || this.open.rightTime === t) return;
    this.open = { ...this.open, rightTime: t };
    this._requestUpdate?.();
  }

  addClosed(mark: ClosedMark): void {
    this.closed.push(mark);
    this._requestUpdate?.();
  }

  clear(): void {
    this.open = null;
    this.closed = [];
    this._requestUpdate?.();
  }
}
