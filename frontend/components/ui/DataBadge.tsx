const MODE_STYLES: Record<string, { label: string; color: string }> = {
  synthetic: { label: "SYNTHETIC DATA", color: "var(--status-warning)" },
  delayed: { label: "DELAYED / EOD DATA", color: "var(--series-blue)" },
  live: { label: "LIVE DATA", color: "var(--status-good)" },
  cached: { label: "CACHED DATA", color: "var(--status-warning)" },
  unspecified: { label: "DATA MODE UNKNOWN", color: "var(--text-muted)" },
};

// Never let a heuristic (hand-written feature formula) probability be
// mistaken for a trained model's output — this badge is the one place in
// the UI a viewer can always check which engine actually produced the
// numbers on screen. See backend/app/schemas/stock.py's engine_mode field.
const ENGINE_STYLES: Record<string, { label: string; color: string }> = {
  HEURISTIC: { label: "HEURISTIC ENGINE", color: "var(--status-warning)" },
  TRAINED_ML: { label: "TRAINED ML MODEL", color: "var(--status-good)" },
};

export function DataBadge({
  mode,
  source,
  asOf,
  priceAsOf,
  engineMode,
  modelVersion,
}: {
  mode: string;
  source: string;
  asOf?: string | null;
  priceAsOf?: string | null;
  engineMode?: string;
  modelVersion?: string | null;
}) {
  const style = MODE_STYLES[mode] ?? MODE_STYLES.unspecified;
  const engineStyle = engineMode ? ENGINE_STYLES[engineMode] : undefined;
  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" title="Data provenance">
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-semibold tracking-wide"
        style={{ color: style.color, background: `color-mix(in srgb, ${style.color} 14%, transparent)` }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color }} />
        {style.label}
      </span>
      {engineStyle && (
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-semibold tracking-wide"
          style={{ color: engineStyle.color, background: `color-mix(in srgb, ${engineStyle.color} 14%, transparent)` }}
          title={
            engineMode === "HEURISTIC"
              ? "Probabilities come from a hand-written feature formula — no trained ML model exists yet for this deployment."
              : `Probabilities come from a trained model (version ${modelVersion ?? "unknown"}).`
          }
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: engineStyle.color }} />
          {engineStyle.label}
        </span>
      )}
      <span style={{ color: "var(--text-muted)" }}>
        source: {source}
        {fmt(asOf) ? ` · computed ${fmt(asOf)}` : ""}
        {fmt(priceAsOf) ? ` · last bar ${fmt(priceAsOf)}` : ""}
      </span>
    </div>
  );
}
