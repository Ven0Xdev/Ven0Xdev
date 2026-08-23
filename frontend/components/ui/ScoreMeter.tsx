import { AnimatedNumber } from "./AnimatedNumber";

const SEQ_STEPS = ["var(--seq-100)", "var(--seq-250)", "var(--seq-400)", "var(--seq-450)", "var(--seq-550)", "var(--seq-650)"];

/** Shared with Gauge.tsx (the ring variant) so both meter styles agree on
 * exactly which color a given score renders as. */
export function seqColor(score: number): string {
  const idx = Math.min(SEQ_STEPS.length - 1, Math.floor((score / 100) * SEQ_STEPS.length));
  return SEQ_STEPS[idx];
}

export function statusColor(score: number, invert = false): string {
  const s = invert ? 100 - score : score;
  if (s >= 70) return "var(--status-good)";
  if (s >= 45) return "var(--status-warning)";
  if (s >= 25) return "var(--status-serious)";
  return "var(--status-critical)";
}

export function ScoreMeter({
  label,
  value,
  invert = false,
  variant = "sequential",
}: {
  label: string;
  value: number;
  invert?: boolean;
  variant?: "sequential" | "status";
}) {
  const fillColor = variant === "status" ? statusColor(value, invert) : seqColor(invert ? 100 - value : value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
        <AnimatedNumber
          value={value}
          format={(n) => n.toFixed(0)}
          className="text-sm font-semibold"
          durationMs={400}
        />
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--gridline)" }}>
        <div
          className="h-1.5 rounded-full"
          style={{
            width: `${Math.max(2, Math.min(100, value))}%`,
            background: fillColor,
            transition: "width var(--duration-slow) var(--ease-out)",
          }}
        />
      </div>
    </div>
  );
}
