import type { UTCTimestamp } from "lightweight-charts";

/** Every drawing tool this workspace implements. `cursor`/`crosshair`
 * aren't drawing types (they're interaction modes, no shape is created)
 * — see DrawingToolbar's own DrawTool union for the full tool list
 * including those two plus zoom/measure actions that never persist. */
export type DrawingType =
  | "trendline"
  | "hline"
  | "vline"
  | "ray"
  | "rectangle"
  | "fibonacci"
  | "text"
  | "arrow";

export interface Anchor {
  time: UTCTimestamp;
  price: number;
}

export interface DrawingStyle {
  color: string;
  width: number;
  opacity: number; // 0..1
  dash: "solid" | "dashed" | "dotted";
  fontSize?: number; // text annotations only
}

export const DEFAULT_STYLE: DrawingStyle = { color: "#2563eb", width: 2, opacity: 1, dash: "solid" };

export const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/** The full persisted payload for one drawing — this exact shape is what
 * gets serialized into ChartDrawing.data on the backend (see
 * backend/app/db/models/chart_drawing.py: "one flexible JSON blob per
 * drawing"). Anchors are always {time, price}; screen pixels are only
 * ever derived at render time, never stored. */
export type DrawingPayload =
  | { type: "trendline"; p1: Anchor; p2: Anchor; style: DrawingStyle }
  | { type: "ray"; p1: Anchor; p2: Anchor; style: DrawingStyle }
  | { type: "arrow"; p1: Anchor; p2: Anchor; style: DrawingStyle }
  | { type: "hline"; price: number; style: DrawingStyle }
  | { type: "vline"; time: UTCTimestamp; style: DrawingStyle }
  | { type: "rectangle"; p1: Anchor; p2: Anchor; style: DrawingStyle }
  | { type: "fibonacci"; p1: Anchor; p2: Anchor; levels: number[]; style: DrawingStyle }
  | { type: "text"; anchor: Anchor; text: string; style: DrawingStyle };

/** One drawing, as held in React/chart state — the persisted payload
 * plus the identity/flags that live in ChartDrawing's own columns rather
 * than its `data` blob. `serverId` is null until the create request
 * round-trips (optimistic local id in the meantime), so a drawing is
 * always visible and editable immediately, never waiting on the network. */
export interface Drawing {
  localId: string;
  serverId: number | null;
  payload: DrawingPayload;
  locked: boolean;
  hidden: boolean;
}

export function anchorsOf(payload: DrawingPayload): Anchor[] {
  switch (payload.type) {
    case "trendline":
    case "ray":
    case "arrow":
    case "rectangle":
    case "fibonacci":
      return [payload.p1, payload.p2];
    case "text":
      return [payload.anchor];
    case "hline":
    case "vline":
      return [];
  }
}

export function styleOf(payload: DrawingPayload): DrawingStyle {
  return payload.style;
}

export function withStyle(payload: DrawingPayload, style: DrawingStyle): DrawingPayload {
  return { ...payload, style } as DrawingPayload;
}
