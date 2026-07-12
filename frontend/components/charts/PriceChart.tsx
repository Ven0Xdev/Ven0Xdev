"use client";

import { useMemo, useState } from "react";
import type { OhlcvBar } from "@/lib/types";

const W = 720;
const H = 260;
const PAD = { t: 14, r: 86, b: 22, l: 8 };

interface Marker {
  label: string;
  price: number;
  color: string;
}

export function PriceChart({
  bars,
  markers,
}: {
  bars: OhlcvBar[];
  markers: Marker[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const model = useMemo(() => {
    if (bars.length === 0) return null;
    const closes = bars.map((b) => b.close);
    // Y domain covers both price history and any markers so levels are visible.
    const lo = Math.min(...closes, ...markers.map((m) => m.price)) * 0.98;
    const hi = Math.max(...closes, ...markers.map((m) => m.price)) * 1.02;
    const span = hi - lo || 1;
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const x = (i: number) => PAD.l + (i / Math.max(1, bars.length - 1)) * iw;
    const y = (v: number) => PAD.t + ih - ((v - lo) / span) * ih;
    const pts = closes.map((v, i) => [x(i), y(v)] as const);
    const path = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
    const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${H - PAD.b} L${pts[0][0].toFixed(1)},${H - PAD.b} Z`;
    return { lo, hi, pts, path, area, y };
  }, [bars, markers]);

  if (!model) {
    return <p className="p-4 text-sm" style={{ color: "var(--text-muted)" }}>No price history available.</p>;
  }

  const hovered = hoverIdx !== null ? { bar: bars[hoverIdx], pt: model.pts[hoverIdx] } : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Price history with trade-plan levels"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((relX - PAD.l) / (W - PAD.l - PAD.r)) * (bars.length - 1));
          setHoverIdx(Math.max(0, Math.min(bars.length - 1, idx)));
        }}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + t * (H - PAD.t - PAD.b)} y2={PAD.t + t * (H - PAD.t - PAD.b)} stroke="var(--gridline)" strokeWidth={1} />
        ))}

        <path d={model.area} fill="var(--series-blue)" opacity={0.1} />
        <path d={model.path} fill="none" stroke="var(--series-blue)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {markers.map((m) => {
          const my = model.y(m.price);
          return (
            <g key={m.label}>
              <line x1={PAD.l} x2={W - PAD.r} y1={my} y2={my} stroke={m.color} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.85} />
              <text x={W - PAD.r + 6} y={my + 3.5} fontSize={10.5} fontWeight={650} fill={m.color}>
                {m.label} ${m.price.toFixed(4)}
              </text>
            </g>
          );
        })}

        {hovered && (
          <>
            <line x1={hovered.pt[0]} x2={hovered.pt[0]} y1={PAD.t} y2={H - PAD.b} stroke="var(--baseline)" strokeWidth={1} />
            <circle cx={hovered.pt[0]} cy={hovered.pt[1]} r={4} fill="var(--series-blue)" stroke="var(--surface-1)" strokeWidth={2} />
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="card pointer-events-none absolute -translate-x-1/2 -translate-y-full px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${(hovered.pt[0] / W) * 100}%`, top: `${(hovered.pt[1] / H) * 100 - 3}%` }}
        >
          <span className="tabular font-semibold">${hovered.bar.close.toFixed(4)}</span>
          <span className="ml-1.5" style={{ color: "var(--text-muted)" }}>{hovered.bar.ts.slice(0, 10)}</span>
        </div>
      )}

      <div className="mt-1 flex justify-between text-xs tabular" style={{ color: "var(--text-muted)" }}>
        <span>{bars[0].ts.slice(0, 10)}</span>
        <span>{bars[bars.length - 1].ts.slice(0, 10)}</span>
      </div>
    </div>
  );
}
