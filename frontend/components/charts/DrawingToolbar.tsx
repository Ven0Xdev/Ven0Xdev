"use client";

export type DrawTool = "none" | "trendline" | "hline";

const TOOLS: { key: DrawTool; label: string; hint: string }[] = [
  { key: "trendline", label: "Trendline", hint: "Click two points on the chart to draw a trendline" },
  { key: "hline", label: "Horizontal line", hint: "Click once to draw a horizontal line at that price" },
];

/** Purely presentational — TradingChart owns all drawing state/logic
 * (click handling, series/price-line creation, persistence) since only it
 * holds the chart/series refs those operations need. */
export function DrawingToolbar({
  activeTool,
  onSelectTool,
  onClear,
  hasDrawings,
  pendingFirstPoint,
}: {
  activeTool: DrawTool;
  onSelectTool: (tool: DrawTool) => void;
  onClear: () => void;
  hasDrawings: boolean;
  pendingFirstPoint: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button
          key={t.key}
          type="button"
          title={t.hint}
          onClick={() => onSelectTool(activeTool === t.key ? "none" : t.key)}
          className="rounded-md px-2.5 py-1 text-xs font-semibold"
          style={{
            background: activeTool === t.key ? "var(--accent-soft)" : "transparent",
            color: activeTool === t.key ? "var(--accent)" : "var(--text-secondary)",
            border: `1px solid ${activeTool === t.key ? "var(--accent)" : "var(--border)"}`,
          }}
        >
          {t.label}
        </button>
      ))}
      {activeTool === "trendline" && (
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {pendingFirstPoint ? "Click the second point…" : "Click the first point…"}
        </span>
      )}
      {hasDrawings && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2.5 py-1 text-xs font-semibold"
          style={{ color: "var(--status-critical)", border: "1px solid var(--border)" }}
        >
          Clear drawings
        </button>
      )}
    </div>
  );
}
