import type {
  IChartApi,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { Drawing, DrawingPayload } from "./types";
import { rayEndpoint, toPixel, type PriceToCoord, type TimeToCoord } from "./geometry";

function dashPattern(dash: "solid" | "dashed" | "dotted"): number[] {
  if (dash === "dashed") return [8, 5];
  if (dash === "dotted") return [2, 4];
  return [];
}

function drawOne(
  ctx: CanvasRenderingContext2D, payload: DrawingPayload, selected: boolean,
  timeToCoord: TimeToCoord, priceToCoord: PriceToCoord, mediaWidth: number,
) {
  ctx.save();
  ctx.globalAlpha = payload.style.opacity;
  ctx.strokeStyle = payload.style.color;
  ctx.fillStyle = payload.style.color;
  ctx.lineWidth = payload.style.width;
  ctx.setLineDash(dashPattern(payload.style.dash));

  const strokeHandles = (points: { x: number; y: number }[]) => {
    if (!selected) return;
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = payload.style.color;
    ctx.lineWidth = 1.5;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };

  switch (payload.type) {
    case "hline": {
      const y = priceToCoord(payload.price);
      if (y === null) break;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(mediaWidth, y);
      ctx.stroke();
      break;
    }
    case "vline": {
      const x = timeToCoord(payload.time);
      if (x === null) break;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 100_000);
      ctx.stroke();
      break;
    }
    case "trendline":
    case "arrow": {
      const a = toPixel(payload.p1, timeToCoord, priceToCoord);
      const b = toPixel(payload.p2, timeToCoord, priceToCoord);
      if (!a || !b) break;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (payload.type === "arrow") {
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const headLen = 10 + payload.style.width;
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - headLen * Math.cos(angle - Math.PI / 7), b.y - headLen * Math.sin(angle - Math.PI / 7));
        ctx.lineTo(b.x - headLen * Math.cos(angle + Math.PI / 7), b.y - headLen * Math.sin(angle + Math.PI / 7));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      strokeHandles([a, b]);
      break;
    }
    case "ray": {
      const a = toPixel(payload.p1, timeToCoord, priceToCoord);
      const b = toPixel(payload.p2, timeToCoord, priceToCoord);
      if (!a || !b) break;
      const ext = rayEndpoint(a, b);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(ext.x, ext.y);
      ctx.stroke();
      strokeHandles([a, b]);
      break;
    }
    case "rectangle": {
      const a = toPixel(payload.p1, timeToCoord, priceToCoord);
      const b = toPixel(payload.p2, timeToCoord, priceToCoord);
      if (!a || !b) break;
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      ctx.save();
      ctx.globalAlpha = payload.style.opacity * 0.15;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.strokeRect(x, y, w, h);
      strokeHandles([a, b]);
      break;
    }
    case "fibonacci": {
      const a = toPixel(payload.p1, timeToCoord, priceToCoord);
      const b = toPixel(payload.p2, timeToCoord, priceToCoord);
      if (!a || !b) break;
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      ctx.save();
      ctx.setLineDash([]);
      for (const level of payload.levels) {
        const y = a.y + (b.y - a.y) * level;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.font = "11px system-ui, sans-serif";
        ctx.fillText(`${(level * 100).toFixed(1)}%`, x1 + 4, y + 3);
      }
      ctx.restore();
      strokeHandles([a, b]);
      break;
    }
    case "text": {
      const p = toPixel(payload.anchor, timeToCoord, priceToCoord);
      if (!p) break;
      ctx.font = `${payload.style.fontSize ?? 13}px system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(payload.text, p.x + 6, p.y);
      strokeHandles([p]);
      break;
    }
  }
  ctx.restore();
}

class DrawingsPaneRenderer {
  constructor(
    private drawings: Drawing[], private selectedId: string | null,
    private timeToCoord: TimeToCoord, private priceToCoord: PriceToCoord,
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      for (const d of this.drawings) {
        if (d.hidden) continue;
        drawOne(context, d.payload, d.localId === this.selectedId, this.timeToCoord, this.priceToCoord, mediaSize.width);
      }
    });
  }
}

class DrawingsPaneView implements IPrimitivePaneView {
  constructor(private source: DrawingsPrimitive) {}

  renderer() {
    const chart = this.source.chart;
    const series = this.source.series;
    if (!chart || !series) return null;
    const timeToCoord: TimeToCoord = (t) => chart.timeScale().timeToCoordinate(t as Time);
    const priceToCoord: PriceToCoord = (p) => series.priceToCoordinate(p);
    return new DrawingsPaneRenderer(this.source.drawings, this.source.selectedId, timeToCoord, priceToCoord);
  }
}

/** The one canvas layer every drawing type renders through — trendline,
 * hline, vline, ray, arrow, rectangle, fibonacci, text. Superseding
 * TradingChart's previous native Line-series/IPriceLine trendline/hline
 * rendering (removed): that approach had no way to draw selection
 * handles or support drag-editing, and running two parallel rendering
 * systems risked double-drawing the same two types. Feature-preserving,
 * not mechanism-preserving — trendline and hline still draw exactly as
 * before, now with the same selection/edit/lock/hide every other tool
 * gets. Anchors are real {time, price}; this class only ever converts
 * them to pixels at draw time via the chart's own current scale — never
 * stores a pixel. */
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<"Candlestick"> | null = null;
  drawings: Drawing[] = [];
  selectedId: string | null = null;
  private _paneViews: DrawingsPaneView[];
  private _requestUpdate: (() => void) | null = null;

  constructor() {
    this._paneViews = [new DrawingsPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<"Candlestick">;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
  }

  updateAllViews(): void {}

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  setDrawings(drawings: Drawing[], selectedId: string | null) {
    this.drawings = drawings;
    this.selectedId = selectedId;
    this._requestUpdate?.();
  }
}
