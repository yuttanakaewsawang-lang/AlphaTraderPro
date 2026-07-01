import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitivePaneViewZOrder,
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export interface OrderBlockData {
  startTime: number;
  endTime: number;
  top: number;
  bottom: number;
  fillColor: string;
  borderColor: string;
  lineWidth?: number;   // ความหนาเส้นขอบ (default 1) — ใช้เน้น OB ที่ยังไม่ถูกแตะ
  label?: string;       // ป้ายมุมบนซ้าย เช่น "OB"
}

class OrderBlockPaneRenderer implements IPrimitivePaneRenderer {
  private _source: OrderBlockPrimitive;

  constructor(source: OrderBlockPrimitive) {
    this._source = source;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const series = this._source.series;
    const chart = this._source.chart;
    if (!series || !chart) return;

    const timeScale = chart.timeScale();

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;

      for (const block of this._source.blocks) {
        const topCoord = series.priceToCoordinate(block.top);
        const bottomCoord = series.priceToCoordinate(block.bottom);
        const startCoord = timeScale.timeToCoordinate(block.startTime as Time);
        if (topCoord === null || bottomCoord === null || startCoord === null) continue;

        const endCoord = timeScale.timeToCoordinate(block.endTime as Time);
        const left = startCoord * scope.horizontalPixelRatio;
        const right = (endCoord === null ? scope.bitmapSize.width / scope.horizontalPixelRatio : endCoord) * scope.horizontalPixelRatio;
        const top = Math.min(topCoord, bottomCoord) * scope.verticalPixelRatio;
        const bottom = Math.max(topCoord, bottomCoord) * scope.verticalPixelRatio;

        ctx.fillStyle = block.fillColor;
        ctx.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
        ctx.strokeStyle = block.borderColor;
        ctx.lineWidth = (block.lineWidth ?? 1) * scope.verticalPixelRatio;
        ctx.strokeRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));

        if (block.label) {
          ctx.fillStyle = block.borderColor;
          ctx.font = `${10 * scope.verticalPixelRatio}px sans-serif`;
          ctx.textBaseline = 'top';
          ctx.fillText(block.label, left + 3 * scope.horizontalPixelRatio, top + 2 * scope.verticalPixelRatio);
        }
      }
    });
  }
}

class OrderBlockPaneView implements IPrimitivePaneView {
  private _source: OrderBlockPrimitive;

  constructor(source: OrderBlockPrimitive) {
    this._source = source;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new OrderBlockPaneRenderer(this._source);
  }
}

// วาดกล่อง Order Block (โซนแท่งสวนทางก่อนเกิด BOS/CHoCH) ตั้งแต่ start_time ถึง end_time
export class OrderBlockPrimitive implements ISeriesPrimitive<Time> {
  blocks: OrderBlockData[] = [];
  series: ISeriesApi<SeriesType, Time> | null = null;
  chart: IChartApi | null = null;

  private _paneViews: OrderBlockPaneView[];
  private _requestUpdate: (() => void) | null = null;

  constructor() {
    this._paneViews = [new OrderBlockPaneView(this)];
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

  setBlocks(blocks: OrderBlockData[]): void {
    this.blocks = blocks;
    this._requestUpdate?.();
  }
}
