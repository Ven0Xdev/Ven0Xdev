"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, classifyApiError } from "@/lib/api";
import type { DashboardSummary, SectorHeatmapEntry } from "@/lib/types";
import { StatTile } from "@/components/ui/StatTile";
import { Badge, riskVariant, scoreVariant } from "@/components/ui/Badge";
import { SectorHeatmap } from "@/components/charts/SectorHeatmap";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [heatmap, setHeatmap] = useState<SectorHeatmapEntry[]>([]);
  const [dataProvider, setDataProvider] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([api.dashboardSummary(), api.heatmap()])
      .then(([s, h]) => {
        setSummary(s);
        setHeatmap(h);
      })
      .catch((e) => setError(e));
    api.health().then((h) => setDataProvider(h.data_provider)).catch(() => setDataProvider(null));
  }, []);

  if (error) return <ErrorState error={error} />;
  if (!summary) return <LoadingState />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Continuous AI scan across the OTC universe. All scores are probability-based, never certainty.
        </p>
      </div>

      {dataProvider === "mock" && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
          style={{
            color: "var(--status-warning)",
            background: "color-mix(in srgb, var(--status-warning) 12%, transparent)",
          }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--status-warning)" }} />
          Synthetic data mode — no live market-data provider is configured. Every number on this screen is generated
          demo data. Set MARKET_DATA_PROVIDER in backend/.env to connect real data.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Universe scanned" value={summary.universe_size.toString()} />
        <StatTile label="Avg model confidence" value={`${summary.avg_model_confidence.toFixed(0)}%`} />
        <StatTile label="Watchlist" value={summary.watchlist_count.toString()} />
        <StatTile label="Open positions" value={summary.open_positions.toString()} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Top opportunities
          </h2>
          <ul className="flex flex-col gap-2">
            {summary.top_opportunities.map((o) => (
              <li key={o.ticker} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--page-plane)" }}>
                <Link href={`/stock/${o.ticker}`} className="font-medium hover:underline">
                  {o.ticker}
                </Link>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular" style={{ color: "var(--text-muted)" }}>
                    confidence {o.confidence_score.toFixed(0)}%
                  </span>
                  <Badge variant={scoreVariant(o.overall_ai_score)}>{o.overall_ai_score.toFixed(0)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Risk monitor — elevated manipulation risk
          </h2>
          {summary.high_risk_watch.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No tickers currently flagged above the risk threshold.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.high_risk_watch.map((r) => (
                <li key={r.ticker} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--page-plane)" }}>
                  <Link href={`/stock/${r.ticker}`} className="font-medium hover:underline">
                    {r.ticker}
                  </Link>
                  <Badge variant={riskVariant(r.manipulation_risk)}>{r.manipulation_risk.toFixed(0)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
          Sector rotation — avg AI score by sector
        </h2>
        <SectorHeatmap data={heatmap} />
      </div>
    </div>
  );
}

function LoadingState() {
  return <p style={{ color: "var(--text-muted)" }}>Scanning OTC universe…</p>;
}

function ErrorState({ error }: { error: unknown }) {
  const { title, hint } = classifyApiError(error);
  return (
    <div className="card p-5 text-sm" style={{ color: "var(--status-critical)" }}>
      {title}
      <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{hint}</p>
      <pre className="mt-2 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
        {String(error)}
      </pre>
    </div>
  );
}
