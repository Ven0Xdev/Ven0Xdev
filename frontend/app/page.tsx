"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, classifyApiError, getFetchMeta } from "@/lib/api";
import { useResyncListener } from "@/lib/pwa";
import type { DashboardSummary, SectorHeatmapEntry } from "@/lib/types";
import { StatTile } from "@/components/ui/StatTile";
import { Badge, riskVariant, scoreVariant } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton, CardSkeleton } from "@/components/ui/Skeleton";
import { SectorHeatmap } from "@/components/charts/SectorHeatmap";
import { CacheBadge } from "@/components/pwa/CacheBadge";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [heatmap, setHeatmap] = useState<SectorHeatmapEntry[]>([]);
  const [dataProvider, setDataProvider] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.dashboardSummary(), api.heatmap()])
      .then(([s, h]) => {
        setSummary(s);
        setHeatmap(h);
        setError(null);
        // A verified reconnect fires a fresh network request, so a stale
        // cache badge from a prior offline view is cleared here too.
        setCachedAt(getFetchMeta("/dashboard/summary")?.offline ? getFetchMeta("/dashboard/summary")!.cachedAt : null);
      })
      .catch((e) => setError(e));
    api.health().then((h) => setDataProvider(h.data_provider)).catch(() => setDataProvider(null));
  }, []);

  useEffect(load, [load]);
  useResyncListener(load); // re-fetch fresh data automatically when connectivity is verified back

  if (error) return <ErrorState error={error} />;
  if (!summary) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Dashboard"
        description="Continuous AI scan across the OTC universe. All scores are probability-based, never certainty."
      />

      {cachedAt !== null && <CacheBadge cachedAt={cachedAt} />}

      {dataProvider === "mock" && (
        <div
          className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
          style={{
            color: "var(--status-warning)",
            background: "var(--status-warning-soft)",
          }}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--status-warning)" }} />
          Synthetic data mode — no live market-data provider is configured. Every number on this screen is generated
          demo data. Set MARKET_DATA_PROVIDER in backend/.env to connect real data.
        </div>
      )}

      <div className="animate-in-stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Universe scanned" value={summary.universe_size.toString()} />
        <StatTile label="Avg model confidence" value={`${summary.avg_model_confidence.toFixed(0)}%`} />
        <StatTile label="Watchlist" value={summary.watchlist_count.toString()} />
        <StatTile label="Open positions" value={summary.open_positions.toString()} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card animate-in p-5">
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Top opportunities
          </h2>
          {summary.top_opportunities.length === 0 ? (
            <EmptyRow text="No opportunities scored yet." />
          ) : (
            <ul className="flex flex-col gap-1">
              {summary.top_opportunities.map((o) => (
                <li key={o.ticker}>
                  <Link
                    href={`/stock/${o.ticker}`}
                    className="flex items-center justify-between rounded-[10px] px-3 py-2.5 transition-colors"
                    style={{ transition: "background-color var(--duration-fast) var(--ease-out)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span className="font-semibold">{o.ticker}</span>
                    <div className="flex items-center gap-2.5">
                      <span className="tabular text-xs" style={{ color: "var(--text-muted)" }}>
                        confidence {o.confidence_score.toFixed(0)}%
                      </span>
                      <Badge variant={scoreVariant(o.overall_ai_score)}>{o.overall_ai_score.toFixed(0)}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card animate-in p-5">
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Risk monitor — elevated manipulation risk
          </h2>
          {summary.high_risk_watch.length === 0 ? (
            <EmptyRow text="No tickers currently flagged above the risk threshold." good />
          ) : (
            <ul className="flex flex-col gap-1">
              {summary.high_risk_watch.map((r) => (
                <li key={r.ticker}>
                  <Link
                    href={`/stock/${r.ticker}`}
                    className="flex items-center justify-between rounded-[10px] px-3 py-2.5"
                    style={{ transition: "background-color var(--duration-fast) var(--ease-out)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span className="font-semibold">{r.ticker}</span>
                    <Badge variant={riskVariant(r.manipulation_risk)}>{r.manipulation_risk.toFixed(0)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card animate-in p-5">
        <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Sector rotation — avg AI score by sector
        </h2>
        <SectorHeatmap data={heatmap} />
      </div>
    </div>
  );
}

function EmptyRow({ text, good }: { text: string; good?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: good ? "var(--status-good)" : "var(--text-muted)" }}>
        {good ? (
          <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
            <path d="M9 10h.01M15 10h.01M9 15c.7-.7 1.9-1 3-1s2.3.3 3 1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </>
        )}
      </svg>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {text}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex flex-col gap-2.5 p-5">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>
      <CardSkeleton lines={3} />
    </div>
  );
}

function ErrorState({ error }: { error: unknown }) {
  const { title, hint } = classifyApiError(error);
  return (
    <div className="card animate-in p-5 text-sm" style={{ borderColor: "var(--status-critical-soft)" }}>
      <p className="font-semibold" style={{ color: "var(--status-critical)" }}>
        {title}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{hint}</p>
      <pre className="mt-2 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
        {String(error)}
      </pre>
    </div>
  );
}
