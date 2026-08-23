"use client";

import { useId } from "react";
import { AnimatedNumber } from "./AnimatedNumber";
import { seqColor, statusColor } from "./ScoreMeter";

const SIZE = 88;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Circular "confidence ring" sibling to ScoreMeter's bar — same score
 * semantics and color scale (seqColor/statusColor, imported rather than
 * re-derived), animated via a stroke-dashoffset CSS transition so it draws
 * in on mount and re-draws smoothly when the value updates. */
export function Gauge({
  label,
  value,
  variant = "sequential",
  invert = false,
}: {
  label: string;
  value: number;
  variant?: "sequential" | "status";
  invert?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = variant === "status" ? statusColor(value, invert) : seqColor(invert ? 100 - value : value);
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  const gradId = useId();

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--gridline)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset var(--duration-slow) var(--ease-out)" }}
          />
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity={0.7} />
              <stop offset="100%" stopColor={color} stopOpacity={1} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <AnimatedNumber value={clamped} format={(n) => n.toFixed(0)} className="text-lg font-semibold" durationMs={500} />
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
    </div>
  );
}
