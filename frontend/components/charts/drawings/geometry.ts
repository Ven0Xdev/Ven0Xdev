import type { UTCTimestamp } from "lightweight-charts";
import type { Anchor, DrawingPayload } from "./types";

export interface PixelPoint {
  x: number;
  y: number;
}

/** Converts a drawing's real {time, price} anchors to screen pixels using
 * the chart's OWN current time/price scale — called fresh on every
 * render (pan/zoom/resize/theme change), never cached, which is exactly
 * why storing pixels instead of {time, price} would break the moment the
 * view changes. Returns null for any anchor currently off the visible
 * time range (lightweight-charts' own timeToCoordinate contract). */
export type TimeToCoord = (t: UTCTimestamp) => number | null;
export type PriceToCoord = (p: number) => number | null;

export function toPixel(a: Anchor, timeToCoord: TimeToCoord, priceToCoord: PriceToCoord): PixelPoint | null {
  const x = timeToCoord(a.time);
  const y = priceToCoord(a.price);
  if (x === null || y === null) return null;
  return { x, y };
}

function distToSegment(p: PixelPoint, a: PixelPoint, b: PixelPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/** Extends a ray far enough past `b` to reliably hit-test/render "to the
 * edge of the visible chart" without needing the chart's actual pixel
 * width plumbed through — 100,000px is far beyond any real viewport. */
export function rayEndpoint(a: PixelPoint, b: PixelPoint): PixelPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const scale = 100_000 / len;
  return { x: a.x + dx * scale, y: a.y + dy * scale };
}

const HIT_TOLERANCE_PX = 6;

/** Hit-tests a click against one drawing's rendered pixel geometry — the
 * same tolerance-based approach every canvas drawing tool uses, since a
 * mouse click is never pixel-perfect on a 1-2px line. */
export function hitTest(
  payload: DrawingPayload, click: PixelPoint, timeToCoord: TimeToCoord, priceToCoord: PriceToCoord,
): boolean {
  switch (payload.type) {
    case "hline": {
      const y = priceToCoord(payload.price);
      return y !== null && Math.abs(click.y - y) <= HIT_TOLERANCE_PX;
    }
    case "vline": {
      const x = timeToCoord(payload.time);
      return x !== null && Math.abs(click.x - x) <= HIT_TOLERANCE_PX;
    }
    case "trendline":
    case "arrow": {
      const a = toPixel(payload.p1, timeToCoord, priceToCoord);
      const b = toPixel(payload.p2, timeToCoord, priceToCoord);
      return a !== null && b !== null && distToSegment(click, a, b) <= HIT_TOLERANCE_PX;
    }
    case "ray": {
      const a = toPixel(payload.p1, timeToCoord, priceToCoord);
      const b = toPixel(payload.p2, timeToCoord, priceToCoord);
      if (a === null || b === null) return false;
      return distToSegment(click, a, rayEndpoint(a, b)) <= HIT_TOLERANCE_PX;
    }
    case "rectangle":
    case "fibonacci": {
      const a = toPixel(payload.p1, timeToCoord, priceToCoord);
      const b = toPixel(payload.p2, timeToCoord, priceToCoord);
      if (a === null || b === null) return false;
      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
      // Near the border only (not filled-interior click-through) for
      // fibonacci; rectangle counts an interior click too since it reads
      // as a highlight zone.
      const inside = click.x >= minX && click.x <= maxX && click.y >= minY && click.y <= maxY;
      if (payload.type === "rectangle") return inside;
      return (
        inside &&
        (Math.abs(click.x - minX) <= HIT_TOLERANCE_PX ||
          Math.abs(click.x - maxX) <= HIT_TOLERANCE_PX ||
          payload.levels.some((lv) => {
            const y = a.y + (b.y - a.y) * lv;
            return Math.abs(click.y - y) <= HIT_TOLERANCE_PX;
          }))
      );
    }
    case "text": {
      const p = toPixel(payload.anchor, timeToCoord, priceToCoord);
      return p !== null && Math.hypot(click.x - p.x, click.y - p.y) <= 16;
    }
  }
}

/** Magnet mode: snaps a raw {time, price} click to the nearest visible
 * candle's actual OHLC value — never an interpolated/invented price.
 * `bars` must be sorted ascending by time (matches CandlesResponse). */
export function magnetSnap<B extends { ts: string; open: number; high: number; low: number; close: number }>(
  raw: Anchor, bars: B[], toTime: (iso: string) => UTCTimestamp,
): Anchor {
  if (bars.length === 0) return raw;
  let nearest = bars[0];
  let nearestDelta = Math.abs(toTime(nearest.ts) - raw.time);
  for (const bar of bars) {
    const delta = Math.abs(toTime(bar.ts) - raw.time);
    if (delta < nearestDelta) {
      nearest = bar;
      nearestDelta = delta;
    }
  }
  const candidates = [nearest.open, nearest.high, nearest.low, nearest.close];
  const closestPrice = candidates.reduce((best, v) => (Math.abs(v - raw.price) < Math.abs(best - raw.price) ? v : best));
  return { time: toTime(nearest.ts), price: closestPrice };
}
