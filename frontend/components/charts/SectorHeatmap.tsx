import type { SectorHeatmapEntry } from "@/lib/types";

const SEQ_STEPS = ["#cde2fb", "#9ec5f4", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];

function seqColor(score: number): string {
  const idx = Math.min(SEQ_STEPS.length - 1, Math.max(0, Math.floor((score / 100) * SEQ_STEPS.length)));
  return SEQ_STEPS[idx];
}

function textColorFor(score: number): string {
  return score / 100 > 0.55 ? "#ffffff" : "#0b0b0b";
}

export function SectorHeatmap({ data }: { data: SectorHeatmapEntry[] }) {
  if (data.length === 0) {
    return <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>No sector data yet.</div>;
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data.map((entry) => (
          <div
            key={entry.sector}
            className="flex flex-col justify-between rounded-lg p-3"
            style={{ background: seqColor(entry.avg_score), color: textColorFor(entry.avg_score), minHeight: 84 }}
          >
            <span className="text-xs font-medium opacity-90">{entry.sector}</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-semibold tabular">{entry.avg_score.toFixed(0)}</span>
              <span className="text-xs opacity-80">{entry.count} tickers</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>Avg AI score:</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full">
          {SEQ_STEPS.map((c) => (
            <div key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>
        <span>low → high</span>
      </div>
    </div>
  );
}
