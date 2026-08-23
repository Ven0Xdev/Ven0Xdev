"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ResearchCoverageResponse } from "@/lib/types";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

const CHECKPOINT_COLORS: Record<string, string> = {
  done: "var(--status-good)", in_progress: "var(--status-warning)",
  pending: "var(--text-muted)", failed: "var(--status-critical)",
};

/** Phase 7 — real dataset coverage/provenance, straight from
 * HistoricalBar/PointInTimeFundamental/HistoricalNewsArticle/
 * CorporateAction row counts. Never claims coverage that doesn't exist:
 * an empty `bars` array or `news_honestly_unavailable=true` renders as
 * exactly that, not hidden. */
export function CoveragePanel() {
  const [data, setData] = useState<ResearchCoverageResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = () => {
    api.researchCoverage().then((r) => (setData(r), setError(null))).catch((e) => setError(e));
  };
  useEffect(load, []);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <CardSkeleton lines={5} />;

  const pending = data.backfill_checkpoints.filter((c) => c.status !== "done");

  return (
    <div className="flex flex-col gap-4">
      <div className="card animate-in flex flex-wrap items-center gap-4 p-4 text-xs">
        <span>
          Historical news:{" "}
          <strong style={{ color: data.news_honestly_unavailable ? "var(--status-warning)" : "var(--status-good)" }}>
            {data.news_honestly_unavailable ? "Not yet available — backfilling in the background" : "Available"}
          </strong>
        </span>
        <span>
          Symbols with price history: <strong>{new Set(data.bars.map((b) => b.ticker_symbol)).size}</strong>
        </span>
        <span>
          Pending/running backfill jobs: <strong>{pending.length}</strong>
        </span>
      </div>

      {data.bars.length === 0 ? (
        <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No historical bars ingested yet — the backfill pipeline hasn&apos;t run, or is still running.
          </p>
        </div>
      ) : (
        <div className="card animate-in overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Timeframe</th>
                <th className="px-3 py-2">Source / Feed</th>
                <th className="px-3 py-2">Coverage</th>
                <th className="px-3 py-2">Bars</th>
                <th className="px-3 py-2">Fundamentals</th>
                <th className="px-3 py-2">News</th>
                <th className="px-3 py-2">Corp. actions</th>
              </tr>
            </thead>
            <tbody>
              {data.bars.map((b) => (
                <tr key={`${b.ticker_symbol}-${b.timeframe}`} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-3 py-2 font-semibold">{b.ticker_symbol}</td>
                  <td className="px-3 py-2">{b.timeframe}</td>
                  <td className="px-3 py-2">
                    {b.data_source}
                    {b.feed !== "unspecified" && (
                      <span
                        className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                        title={b.feed === "iex" ? "Partial market coverage — IEX only, not the full SIP consolidated tape" : b.feed}
                      >
                        {b.feed.toUpperCase()}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    {b.coverage_start?.slice(0, 10)} → {b.coverage_end?.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2">{b.row_count.toLocaleString()}</td>
                  <td className="px-3 py-2">{data.fundamentals_rows_by_symbol[b.ticker_symbol] ?? 0}</td>
                  <td className="px-3 py-2">{data.news_rows_by_symbol[b.ticker_symbol] ?? 0}</td>
                  <td className="px-3 py-2">{data.corporate_actions_rows_by_symbol[b.ticker_symbol] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Backfill jobs in progress
          </h3>
          <div className="card animate-in overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Dataset</th>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Rows</th>
                  <th className="px-3 py-2">Last error</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((c) => (
                  <tr key={`${c.provider}-${c.dataset}-${c.ticker_symbol}`} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
                    <td className="px-3 py-2">{c.provider}</td>
                    <td className="px-3 py-2">{c.dataset}</td>
                    <td className="px-3 py-2 font-semibold">{c.ticker_symbol}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold" style={{ color: CHECKPOINT_COLORS[c.status] }}>{c.status.replace("_", " ")}</span>
                    </td>
                    <td className="px-3 py-2">{c.rows_ingested}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--status-critical)" }}>{c.last_error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
