import type { SectorHeatmapEntry } from "@/lib/types";

const SEQ_STEPS = ["#e3f9ef", "#a7ecd2", "#4fd1a5", "#0bb981", "#0a8f65", "#0a6b4d"];

function seqColor(score: number): string {
  const idx = Math.min(SEQ_STEPS.length - 1, Math.max(0, Math.floor((score / 100) * SEQ_STEPS.length)));
  return SEQ_STEPS[idx];
}

function textColorFor(score: number): string {
  return score / 100 > 0.45 ? "#ffffff" : "#0b0d10";
}

export function SectorHeatmap({ data }: { data: SectorHeatmapEntry[] }) {
  if (data.length === 0) {
    return <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>No sector data yet.</div>;
  }
  return (
    <div>
      <div className="animate-in-stagger grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {data.map((entry) => (
          <div
            key={entry.sector}
            className="flex cursor-default flex-col justify-between rounded-[10px] p-3.5"
            style={{
              background: seqColor(entry.avg_score),
              color: textColorFor(entry.avg_score),
              minHeight: 88,
              transition: "transform var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px) scale(1.015)";
              e.currentTarget.style.boxShadow = "var(--shadow-md)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "";
            }}
          >
            <span className="text-xs font-medium opacity-90">{entry.sector}</span>
            <div className="flex items-end justify-between">
              <span className="tabular text-xl font-semibold">{entry.avg_score.toFixed(0)}</span>
              <span className="text-xs opacity-80">{entry.count} tickers</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>Avg AI score:</span>
        <div className="flex h-1.5 flex-1 overflow-hidden rounded-full">
          {SEQ_STEPS.map((c) => (
            <div key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>
        <span>low → high</span>
      </div>
    </div>
  );
}
