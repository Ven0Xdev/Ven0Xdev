"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ShadowTickerProgress } from "@/lib/types";
import { LocalTime } from "@/components/ui/LocalTime";

/** Shadow Learning Progress — per-ticker read-only progress toward
 * autonomous-trading eligibility (services/shadow/engine.py's
 * shadow_learning_progress). Distinguishes "no signal has fired yet"
 * from "signals fired but haven't closed" from "genuinely close" rather
 * than a bare, unexplained zero — see the incident this panel exists to
 * answer: every shadow sample count reading zero, with no way to tell
 * why. */
export function ShadowLearningProgressPanel({ timeframe = "1D" }: { timeframe?: string }) {
  const [tickers, setTickers] = useState<ShadowTickerProgress[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    api.shadowProgress(timeframe).then((r) => !cancelled && setTickers(r.tickers)).catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [timeframe]);

  const eligibleCount = tickers?.filter((t) => t.eligible).length ?? 0;
  const withSignal = tickers?.filter((t) => t.candidate_signals > 0).length ?? 0;

  return (
    <div className="card animate-in flex flex-col gap-3 p-4">
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Shadow Learning Progress
        </h3>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Passive, hypothetical NCS track record per ticker — never the paper trading engine. Autonomous entries
          require at least 20 closed observations and a 55% win rate per ticker/timeframe before they count
          toward eligibility.
        </p>
      </div>

      {error !== null && (
        <p className="text-xs" style={{ color: "var(--status-critical)" }}>
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {!tickers ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {eligibleCount}/{tickers.length} tickers eligible · {withSignal}/{tickers.length} have at least one
            fired signal
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="py-1 pr-3 font-medium">Ticker</th>
                  <th className="py-1 pr-3 font-medium">Candidate</th>
                  <th className="py-1 pr-3 font-medium">Open</th>
                  <th className="py-1 pr-3 font-medium">Closed</th>
                  <th className="py-1 pr-3 font-medium">Progress</th>
                  <th className="py-1 pr-3 font-medium">Win rate</th>
                  <th className="py-1 pr-3 font-medium">Last eval</th>
                  <th className="py-1 pr-3 font-medium">NCS version</th>
                  <th className="py-1 font-medium">Blockers</th>
                </tr>
              </thead>
              <tbody>
                {tickers.map((t) => (
                  <tr key={t.ticker} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--text-primary)" }}>
                      {t.ticker}
                    </td>
                    <td className="py-1.5 pr-3 tabular">{t.candidate_signals}</td>
                    <td className="py-1.5 pr-3 tabular">{t.open_observations}</td>
                    <td className="py-1.5 pr-3 tabular">{t.closed_outcomes}</td>
                    <td className="py-1.5 pr-3 tabular">
                      <span
                        className="rounded px-1.5 py-0.5 font-semibold"
                        style={{
                          color: t.eligible ? "var(--status-good)" : "var(--text-muted)",
                          background: t.eligible ? "var(--status-good-soft)" : "var(--surface-2)",
                        }}
                      >
                        {t.progress_pct.toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 tabular">{t.win_rate_pct !== null ? `${t.win_rate_pct.toFixed(0)}%` : "—"}</td>
                    <td className="py-1.5 pr-3" style={{ color: "var(--text-muted)" }}>
                      {t.last_evaluation ? <LocalTime iso={t.last_evaluation} options={{ style: "short" }} /> : "never"}
                    </td>
                    <td className="py-1.5 pr-3" style={{ color: "var(--text-muted)" }}>
                      {t.ncs_version}
                    </td>
                    <td className="py-1.5" style={{ color: "var(--text-secondary)" }}>
                      {t.blockers.length ? t.blockers.join("; ") : "none — eligible"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
