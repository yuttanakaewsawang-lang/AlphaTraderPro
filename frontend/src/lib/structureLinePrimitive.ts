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

export interface StructureLineData {
  startTime: number;
  endTime: number;
  price: number;
  label: string;
  color: string;
}

class StructureLinePaneRenderer implements IPrimitivePaneRenderer {
  private _source: StructureLinePrimitive;

  constructor(source: StructureLinePrimitive) {
    this._source = source;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const series = this._source.series;
    const chart = this._source.chart;
    if (!series || !chart) return;

    const timeScale = chart.timeScale();

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;

      for (const line of this._source.lines) {
        const y = series.priceToCoordinate(line.price);
        const x1 = timeScale.timeToCoordinate(line.startTime as Time);
        const x2 = timeScale.timeToCoordinate(line.endTime as Time);
        if (y === null || x1 === null || x2 === null) continue;

        const yPix = y * scope.verticalPixelRatio;
        const x1Pix = x1 * scope.horizontalPixelRatio;
        const x2Pix = x2 * scope.horizontalPixelRatio;

        ctx.save();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.min(x1Pix, x2Pix), yPix);
        ctx.lineTo(Math.max(x1Pix, x2Pix), yPix);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = line.color;
        ctx.font = `${10 * scope.verticalPixelRatio}px sans-serif`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(line.label, Math.max(x1Pix, x2Pix) + 4, yPix - 2);
        ctx.restore();
      }
    });
  }
}

class StructureLinePaneView implements IPrimitivePaneView {
  private _source: StructureLinePrimitive;

  constructor(source: StructureLinePrimitive) {
    this._source = source;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new StructureLinePaneRenderer(this._source);
  }
}

// วาดเส้น BOS/CHoCH (จาก swing point ที่ถูก break ไปจนถึงจุดที่ราคา break ผ่าน) พร้อม label
export class StructureLinePrimitive implements ISeriesPrimitive<Time> {
  lines: StructureLineData[] = [];
  series: ISeriesApi<SeriesType, Time> | null = null;
  chart: IChartApi | null = null;

  private _paneViews: StructureLinePaneView[];
  private _requestUpdate: (() => void) | null = null;

  constructor() {
    this._paneViews = [new StructureLinePaneView(this)];
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

  setLines(lines: StructureLineData[]): void {
    this.lines = lines;
    this._requestUpdate?.();
  }
}
