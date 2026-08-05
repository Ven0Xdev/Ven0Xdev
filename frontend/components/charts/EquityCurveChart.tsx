"use client";

import { useMemo, useState } from "react";

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 16, right: 48, bottom: 24, left: 8 };

export function EquityCurveChart({ data }: { data: number[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = WIDTH;
  const height = HEIGHT;
  const padding = PADDING;

  const { points, min, max, path, areaPath } = useMemo(() => {
    if (data.length === 0) return { points: [] as { x: number; y: number; v: number }[], min: 0, max: 1, path: "", areaPath: "" };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const innerW = WIDTH - PADDING.left - PADDING.right;
    const innerH = HEIGHT - PADDING.top - PADDING.bottom;
    const pts = data.map((v, i) => ({
      x: PADDING.left + (i / Math.max(1, data.length - 1)) * innerW,
      y: PADDING.top + innerH - ((v - min) / span) * innerH,
      v,
    }));
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const areaPath = `${path} L${pts[pts.length - 1].x.toFixed(1)},${(HEIGHT - PADDING.bottom).toFixed(1)} L${pts[0].x.toFixed(1)},${(HEIGHT - PADDING.bottom).toFixed(1)} Z`;
    return { points: pts, min, max, path, areaPath };
  }, [data]);

  if (points.length === 0) {
    return <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>No equity curve data yet — run a backtest.</div>;
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => padding.top + t * (height - padding.top - padding.bottom));
  const last = points[points.length - 1];
  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const idx = Math.round(((relX - padding.left) / (width - padding.left - padding.right)) * (points.length - 1));
          setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {gridLines.map((y, i) => (
          <line key={i} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--gridline)" strokeWidth={1} />
        ))}

        <path d={areaPath} fill="var(--accent)" opacity={0.1} stroke="none" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        <circle cx={last.x} cy={last.y} r={4} fill="var(--accent)" stroke="var(--surface-1)" strokeWidth={2} />
        <text x={last.x - 6} y={last.y - 10} textAnchor="end" fontSize={11} fill="var(--text-primary)" fontWeight={600}>
          ${last.v.toFixed(0)}
        </text>

        {hovered && (
          <>
            <line x1={hovered.x} x2={hovered.x} y1={padding.top} y2={height - padding.bottom} stroke="var(--baseline)" strokeWidth={1} />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill="var(--accent)" stroke="var(--surface-1)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hovered && (
        <div
          className="card pointer-events-none absolute -translate-x-1/2 -translate-y-full px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${(hovered.x / width) * 100}%`, top: `${(hovered.y / height) * 100 - 4}%` }}
        >
          <span className="tabular font-semibold">${hovered.v.toFixed(2)}</span>
          <span className="ml-1" style={{ color: "var(--text-muted)" }}>
            trade {hoverIdx! + 1}
          </span>
        </div>
      )}
      <div className="mt-1 flex justify-between text-xs tabular" style={{ color: "var(--text-muted)" }}>
        <span>min ${min.toFixed(0)}</span>
        <span>max ${max.toFixed(0)}</span>
      </div>
    </div>
  );
}
