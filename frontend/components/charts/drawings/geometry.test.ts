import { describe, expect, it } from "vitest";
import type { UTCTimestamp } from "lightweight-charts";
import { hitTest, magnetSnap, rayEndpoint, toPixel } from "./geometry";
import type { DrawingPayload } from "./types";
import { DEFAULT_STYLE } from "./types";

const T = (n: number) => n as UTCTimestamp;

// A trivial linear scale: time (seconds) maps 1:1 to x, price maps 1:1 to
// (200 - price) so "up" on screen means a higher price, matching how a
// real chart's priceToCoordinate behaves.
const timeToCoord = (t: UTCTimestamp) => (t as number);
const priceToCoord = (p: number) => 200 - p;

describe("toPixel", () => {
  it("converts a real time/price anchor to pixels using the supplied scale", () => {
    expect(toPixel({ time: T(10), price: 50 }, timeToCoord, priceToCoord)).toEqual({ x: 10, y: 150 });
  });

  it("returns null if either coordinate is off-scale", () => {
    const offscreen = () => null;
    expect(toPixel({ time: T(10), price: 50 }, offscreen, priceToCoord)).toBeNull();
    expect(toPixel({ time: T(10), price: 50 }, timeToCoord, offscreen)).toBeNull();
  });
});

describe("rayEndpoint", () => {
  it("extends far past the second point in the same direction", () => {
    const end = rayEndpoint({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(end.x).toBeGreaterThan(1000);
    expect(end.y).toBeCloseTo(0, 5);
  });
});

describe("hitTest", () => {
  it("hits a horizontal line within tolerance of its price row", () => {
    const payload: DrawingPayload = { type: "hline", price: 100, style: DEFAULT_STYLE };
    expect(hitTest(payload, { x: 50, y: 100 }, timeToCoord, priceToCoord)).toBe(true);
    expect(hitTest(payload, { x: 50, y: 200 }, timeToCoord, priceToCoord)).toBe(false);
  });

  it("hits a vertical line within tolerance of its time column", () => {
    const payload: DrawingPayload = { type: "vline", time: T(40), style: DEFAULT_STYLE };
    expect(hitTest(payload, { x: 40, y: 5 }, timeToCoord, priceToCoord)).toBe(true);
    expect(hitTest(payload, { x: 400, y: 5 }, timeToCoord, priceToCoord)).toBe(false);
  });

  it("hits a trendline segment but not a point far off the line", () => {
    const payload: DrawingPayload = {
      type: "trendline", p1: { time: T(0), price: 200 }, p2: { time: T(100), price: 100 }, style: DEFAULT_STYLE,
    };
    // Midpoint of the segment in pixel space: (50, 50).
    expect(hitTest(payload, { x: 50, y: 51 }, timeToCoord, priceToCoord)).toBe(true);
    expect(hitTest(payload, { x: 50, y: 150 }, timeToCoord, priceToCoord)).toBe(false);
  });

  it("hits a ray beyond its second point but not behind its first", () => {
    const payload: DrawingPayload = {
      type: "ray", p1: { time: T(0), price: 200 }, p2: { time: T(10), price: 200 }, style: DEFAULT_STYLE,
    };
    expect(hitTest(payload, { x: 5000, y: 0 }, timeToCoord, priceToCoord)).toBe(true);
    expect(hitTest(payload, { x: -50, y: 0 }, timeToCoord, priceToCoord)).toBe(false);
  });

  it("treats any interior point of a rectangle as a hit, not just its border", () => {
    const payload: DrawingPayload = {
      type: "rectangle", p1: { time: T(0), price: 200 }, p2: { time: T(100), price: 100 }, style: DEFAULT_STYLE,
    };
    expect(hitTest(payload, { x: 50, y: 50 }, timeToCoord, priceToCoord)).toBe(true);
    expect(hitTest(payload, { x: 500, y: 500 }, timeToCoord, priceToCoord)).toBe(false);
  });

  it("only counts near-border/near-level clicks for a fibonacci zone, not its filled interior", () => {
    const payload: DrawingPayload = {
      type: "fibonacci", p1: { time: T(0), price: 200 }, p2: { time: T(100), price: 100 },
      levels: [0, 0.5, 1], style: DEFAULT_STYLE,
    };
    // y for level 0.5 sits at a.y + (b.y - a.y) * 0.5 = 0 + (100 - 0) * 0.5 = 50.
    expect(hitTest(payload, { x: 50, y: 50 }, timeToCoord, priceToCoord)).toBe(true);
    // Well inside the box but nowhere near a level line.
    expect(hitTest(payload, { x: 50, y: 25 }, timeToCoord, priceToCoord)).toBe(false);
  });

  it("hits text near its anchor point", () => {
    const payload: DrawingPayload = { type: "text", anchor: { time: T(20), price: 100 }, text: "note", style: DEFAULT_STYLE };
    expect(hitTest(payload, { x: 20, y: 101 }, timeToCoord, priceToCoord)).toBe(true);
    expect(hitTest(payload, { x: 20, y: 500 }, timeToCoord, priceToCoord)).toBe(false);
  });
});

describe("magnetSnap", () => {
  const toTime = (iso: string) => (Date.parse(iso) / 1000) as UTCTimestamp;
  const bars = [
    { ts: "2026-06-15T14:00:00Z", open: 100, high: 105, low: 99, close: 103 },
    { ts: "2026-06-15T15:00:00Z", open: 103, high: 110, low: 102, close: 108 },
  ];

  it("snaps to the nearest bar's closest OHLC value, never an interpolated price", () => {
    const raw = { time: toTime("2026-06-15T15:01:00Z"), price: 109 };
    const snapped = magnetSnap(raw, bars, toTime);
    expect(snapped.time).toBe(toTime("2026-06-15T15:00:00Z"));
    expect([103, 110, 102, 108]).toContain(snapped.price);
    expect(snapped.price).toBe(110); // closest of the second bar's OHLC to 109
  });

  it("returns the raw anchor untouched when there are no bars to snap to", () => {
    const raw = { time: T(1), price: 42 };
    expect(magnetSnap(raw, [], toTime)).toEqual(raw);
  });
});
