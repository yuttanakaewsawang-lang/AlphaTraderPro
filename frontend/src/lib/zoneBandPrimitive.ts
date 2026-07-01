import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitivePaneViewZOrder,
  ISeriesApi,
  SeriesType,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export interface ZoneBandData {
  high: number;
  low: number;
  color: string;
}

class ZoneBandPaneRenderer implements IPrimitivePaneRenderer {
  private _source: ZoneBandPrimitive;

  constructor(source: ZoneBandPrimitive) {
    this._source = source;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const zone = this._source.zone;
    const series = this._source.series;
    if (!zone || !series) return;

    const highCoord = series.priceToCoordinate(zone.high);
    const lowCoord = series.priceToCoordinate(zone.low);
    if (highCoord === null || lowCoord === null) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const top = Math.min(highCoord, lowCoord) * scope.verticalPixelRatio;
      const bottom = Math.max(highCoord, lowCoord) * scope.verticalPixelRatio;
      const height = Math.max(1, bottom - top);

      ctx.fillStyle = zone.color;
      ctx.fillRect(0, top, scope.bitmapSize.width, height);
    });
  }
}

class ZoneBandPaneView implements IPrimitivePaneView {
  private _source: ZoneBandPrimitive;

  constructor(source: ZoneBandPrimitive) {
    this._source = source;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new ZoneBandPaneRenderer(this._source);
  }
}

// Draws a full-width horizontal band between two price levels, used to
// highlight an active SMC supply/demand zone on the chart.
export class ZoneBandPrimitive implements ISeriesPrimitive<Time> {
  zone: ZoneBandData | null = null;
  series: ISeriesApi<SeriesType, Time> | null = null;

  private _paneViews: ZoneBandPaneView[];
  private _requestUpdate: (() => void) | null = null;

  constructor() {
    this._paneViews = [new ZoneBandPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.series = null;
    this._requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  setZone(zone: ZoneBandData | null): void {
    this.zone = zone;
    this._requestUpdate?.();
  }
}
