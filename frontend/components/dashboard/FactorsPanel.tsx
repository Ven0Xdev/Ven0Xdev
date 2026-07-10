import type { TopFactor } from "@/lib/types";

export function FactorsPanel({ factors }: { factors: TopFactor[] }) {
  return (
    <div className="flex flex-col gap-2">
      {factors.map((f) => (
        <div key={f.feature} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--page-plane)" }}>
          <span className="text-sm">{f.label}</span>
          <span
            className="text-xs font-semibold"
            style={{ color: f.direction === "bullish" ? "var(--status-good)" : "var(--status-critical)" }}
          >
            {f.direction === "bullish" ? "▲ bullish" : "▼ bearish"}
          </span>
        </div>
      ))}
    </div>
  );
}
