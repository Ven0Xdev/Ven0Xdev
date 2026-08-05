import type { TopFactor } from "@/lib/types";

export function FactorsPanel({ factors }: { factors: TopFactor[] }) {
  return (
    <div className="animate-in-stagger flex flex-col gap-2">
      {factors.map((f) => (
        <div
          key={f.feature}
          className="flex items-center justify-between rounded-[10px] px-3.5 py-2.5"
          style={{ background: "var(--surface-2)" }}
        >
          <span className="text-sm font-medium">{f.label}</span>
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: f.direction === "bullish" ? "var(--status-good)" : "var(--status-critical)" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: f.direction === "bullish" ? "none" : "rotate(180deg)" }}>
              <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {f.direction === "bullish" ? "bullish" : "bearish"}
          </span>
        </div>
      ))}
    </div>
  );
}
