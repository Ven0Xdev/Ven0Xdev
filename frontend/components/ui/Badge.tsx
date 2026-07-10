const VARIANT_COLORS: Record<string, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
  neutral: "var(--text-muted)",
};

export function Badge({ children, variant = "neutral" }: { children: React.ReactNode; variant?: keyof typeof VARIANT_COLORS }) {
  const color = VARIANT_COLORS[variant];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function riskVariant(score: number): keyof typeof VARIANT_COLORS {
  if (score >= 70) return "critical";
  if (score >= 45) return "serious";
  if (score >= 20) return "warning";
  return "good";
}

export function scoreVariant(score: number): keyof typeof VARIANT_COLORS {
  if (score >= 65) return "good";
  if (score >= 45) return "warning";
  if (score >= 25) return "serious";
  return "critical";
}
