const SEQ_STEPS = ["#cde2fb", "#9ec5f4", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];

function seqColor(score: number): string {
  const idx = Math.min(SEQ_STEPS.length - 1, Math.floor((score / 100) * SEQ_STEPS.length));
  return SEQ_STEPS[idx];
}

function statusColor(score: number, invert = false): string {
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
        <span className="tabular text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {value.toFixed(0)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full" style={{ background: "var(--gridline)" }}>
        <div
          className="h-2 rounded-full transition-[width]"
          style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: fillColor }}
        />
      </div>
    </div>
  );
}
