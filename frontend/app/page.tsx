"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, getFetchMeta } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useResyncListener } from "@/lib/pwa";
import type { DashboardSummary, SectorHeatmapEntry } from "@/lib/types";
import { StatTile } from "@/components/ui/StatTile";
import { Badge, riskVariant, scoreVariant } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton, CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { SectorHeatmap } from "@/components/charts/SectorHeatmap";
import { CacheBadge } from "@/components/pwa/CacheBadge";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { PlatformStatusBar } from "@/components/dashboard/PlatformStatusBar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
type LiveConnState = "connecting" | "live" | "disconnected";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [heatmap, setHeatmap] = useState<SectorHeatmapEntry[]>([]);
  const [dataProvider, setDataProvider] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const [liveConn, setLiveConn] = useState<LiveConnState>("connecting");
  const [platformRefreshSignal, setPlatformRefreshSignal] = useState(0);

  // Kept free of any synchronous setState call so it's safe to hand
  // directly to useEffect below — every state update here happens inside
  // a .then()/.catch() callback, i.e. asynchronously, never during the
  // effect's own synchronous execution.
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

  // Live dashboard updates — a platform-wide SSE channel (new alerts
  // firing, autonomous paper trades opening/closing, Safe Mode / the
  // autonomous-trading emergency stop being flipped), distinct from the
  // per-symbol chart stream. Every event here is a "something changed,
  // go re-fetch" nudge (see services/dashboard/events.py), never treated
  // as authoritative data itself — this always re-triggers the normal
  // `load()` (or, for platform.* events, bumps a signal the compact
  // status bar below re-fetches on) rather than trying to hand-merge a
  // partial payload into state.
  useEffect(() => {
    const token = getAccessToken();
    const url = `${API_BASE}/stream/dashboard${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const es = new EventSource(url);

    es.addEventListener("hello", () => setLiveConn("live"));
    es.addEventListener("alert.fired", () => load());
    es.addEventListener("autonomous.position_opened", () => load());
    es.addEventListener("autonomous.position_closed", () => load());
    es.addEventListener("platform.safe_mode_changed", () => setPlatformRefreshSignal((n) => n + 1));
    es.addEventListener("platform.autonomous_trading_paused_changed", () => setPlatformRefreshSignal((n) => n + 1));
    es.onerror = () => setLiveConn("disconnected");

    return () => es.close();
  }, [load]);

  // lib/api.ts's request timeout guarantees `error` eventually gets set for
  // an unreachable backend, but this is a second, independent ceiling so a
  // skeleton never just sits there with no way out for the user.
  useEffect(() => {
    if (summary !== null || error !== null) return;
    const t = setTimeout(() => setLoadingTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [summary, error]);

  // Event-handler-only: safe to setState synchronously here (this runs
  // from a button click, never from inside an effect).
  const retry = useCallback(() => {
    setError(null);
    setLoadingTooLong(false);
    load();
  }, [load]);

  // The AI summary/heatmap (a full universe scan, tens of seconds on a
  // cache miss) and the market overview (a handful of cheap quote lookups)
  // are unrelated data sources — one being slow must never block the other.
  // PageHeader and MarketOverview always render; only the AI-analysis
  // section below swaps between skeleton/error/content.
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Dashboard"
          description="Continuous AI scan across the tracked asset universe. All scores are probability-based, never certainty."
        />
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold"
          style={{
            color:
              liveConn === "live" ? "var(--status-good)" : liveConn === "connecting" ? "var(--text-muted)" : "var(--status-warning)",
          }}
          title="Live updates for new alerts, autonomous trades, and platform-wide safety toggles"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background:
                liveConn === "live" ? "var(--status-good)" : liveConn === "connecting" ? "var(--text-muted)" : "var(--status-warning)",
            }}
          />
          {liveConn === "live" ? "LIVE" : liveConn === "connecting" ? "CONNECTING…" : "RECONNECTING…"}
        </span>
      </div>

      <PlatformStatusBar refreshSignal={platformRefreshSignal} />

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

      <div className="flex flex-col gap-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Market overview
        </h2>
        <MarketOverview />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : !summary ? (
        loadingTooLong ? (
          <div className="card flex flex-col gap-2 p-5 text-sm">
            <p className="font-semibold">Still waiting on the AI scan.</p>
            <p style={{ color: "var(--text-secondary)" }}>
              A full universe scan can take a while on a cold cache — this is taking longer than expected.
            </p>
            <button onClick={retry} className="btn btn-secondary btn-sm mt-1 w-fit">
              Retry
            </button>
          </div>
        ) : (
          <DashboardSummarySkeleton />
        )
      ) : (
        <>
          <div className="animate-in-stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Universe scanned" value={summary.universe_size} />
            <StatTile label="Avg model confidence" value={summary.avg_model_confidence} format={(n) => `${n.toFixed(0)}%`} />
            <StatTile label="Watchlist" value={summary.watchlist_count} />
            <StatTile label="Open positions" value={summary.open_positions} />
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
        </>
      )}
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

function DashboardSummarySkeleton() {
  return (
    <div className="flex flex-col gap-7">
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
