"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DecisionAuditResponse, DecisionAuditRow } from "@/lib/types";
import { LocalTime } from "@/components/ui/LocalTime";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

const STATE_COLORS: Record<DecisionAuditRow["state"], string> = {
  fired: "var(--status-good)",
  vetoed: "var(--status-critical)",
  awaiting_confirmation: "var(--status-warning)",
  no_trade: "var(--text-muted)",
};

const DRIFT_COLORS: Record<string, string> = {
  insufficient_history: "var(--text-muted)",
  stable: "var(--status-good)",
  moderate: "var(--status-warning)",
  significant: "var(--status-critical)",
};

/** Phase 4 — every real persisted NCS evaluation for a ticker/timeframe,
 * never fabricated. Buy/Sell-worthy markers are only ever rows with
 * state "fired" — vetoed/no-trade rows render here too (that's the
 * point: an honest audit trail includes the setups that did NOT fire),
 * but this panel never labels them Buy/Sell. */
export function DecisionAuditPanel({ symbol, timeframe = "1D" }: { symbol: string; timeframe?: string }) {
  const [data, setData] = useState<DecisionAuditResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = () => {
    api.decisionAudit(symbol, timeframe).then((r) => (setData(r), setError(null))).catch((e) => setError(e));
  };
  useEffect(load, [symbol, timeframe]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <CardSkeleton lines={4} />;

  const { eligibility_progress: prog } = data;

  return (
    <div className="flex flex-col gap-4">
      <div className="card animate-in flex flex-wrap items-center justify-between gap-3 p-4 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span>
            Eligibility:{" "}
            <strong style={{ color: prog.eligible ? "var(--status-good)" : "var(--text-muted)" }}>
              {prog.eligible ? "Eligible" : "Not yet eligible"}
            </strong>
          </span>
          <span>
            Shadow progress: <strong className="tabular">{prog.progress_pct.toFixed(0)}%</strong> ({prog.closed_outcomes} closed /{" "}
            {prog.open_observations} open / {prog.candidate_signals} candidates)
          </span>
          {prog.win_rate_pct != null && (
            <span>
              Win rate: <strong className="tabular">{prog.win_rate_pct.toFixed(0)}%</strong>
            </span>
          )}
        </div>
        <span
          className="rounded-full px-2 py-0.5 font-semibold tracking-wide"
          style={{ color: DRIFT_COLORS[data.current_drift_status] ?? "var(--text-muted)", background: "var(--surface-2)" }}
          title="Platform-wide model/feature drift status — the same check Red-Team's veto uses"
        >
          drift: {data.current_drift_status.replace("_", " ")}
        </span>
      </div>

      {prog.blockers.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {prog.blockers.map((b, i) => (
            <li key={i}>· {b}</li>
          ))}
        </ul>
      )}

      {data.rows.length === 0 ? (
        <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No NCS evaluations recorded yet for {symbol} ({timeframe}).
          </p>
        </div>
      ) : (
        <div className="card animate-in overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Verdict</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Version</th>
                <th className="px-3 py-2">Red-Team</th>
                <th className="px-3 py-2">Shadow</th>
                <th className="px-3 py-2">Linked order/position</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="tabular border-t align-top" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    <LocalTime iso={r.bar_ts} options={{ style: "short", seconds: true }} />
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide"
                      style={{ color: STATE_COLORS[r.state], background: "color-mix(in srgb, currentColor 12%, transparent)" }}
                    >
                      {r.fired ? (r.confirmed_verdict?.includes("SELL") ? "SELL" : "BUY") : r.state.replace("_", " ").toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.confirmed_verdict?.replace(/_/g, " ") ?? r.raw_verdict.replace(/_/g, " ")}
                    <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                      (raw {r.raw_verdict.replace(/_/g, " ")})
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.confidence_pct.toFixed(0)}% · risk {r.risk_score.toFixed(0)}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {r.version} · {r.data_source} ({r.data_mode})
                  </td>
                  <td className="px-3 py-2">
                    {r.vetoed ? (
                      <span style={{ color: "var(--status-critical)" }} title={r.veto_reason ?? undefined}>
                        VETOED{r.veto_reason ? ` — ${r.veto_reason}` : ""}
                      </span>
                    ) : (
                      <span style={{ color: "var(--status-good)" }}>Passed</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.shadow_status ? (
                      <>
                        {r.shadow_status}
                        {r.shadow_pnl_pct != null && (
                          <span className="ml-1" style={{ color: r.shadow_pnl_pct >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                            {r.shadow_pnl_pct >= 0 ? "+" : ""}{(r.shadow_pnl_pct * 100).toFixed(1)}%
                          </span>
                        )}
                        {r.shadow_exit_reason && <span className="ml-1" style={{ color: "var(--text-muted)" }}>({r.shadow_exit_reason})</span>}
                      </>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {r.paper_position_id != null && `position #${r.paper_position_id}`}
                    {r.paper_order_id != null && ` order #${r.paper_order_id}`}
                    {r.paper_position_id == null && r.paper_order_id == null && "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
