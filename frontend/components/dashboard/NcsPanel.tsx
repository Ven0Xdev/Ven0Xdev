"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { NcsNoSignalYet, NcsSignal } from "@/lib/types";
import { LocalTime } from "@/components/ui/LocalTime";

const VERDICT_STYLES: Record<string, { label: string; color: string }> = {
  STRONG_BUY: { label: "Strong Buy", color: "var(--status-good)" },
  BUY: { label: "Buy", color: "var(--status-good)" },
  NEUTRAL: { label: "Neutral", color: "var(--text-muted)" },
  SELL: { label: "Sell", color: "var(--status-critical)" },
  STRONG_SELL: { label: "Strong Sell", color: "var(--status-critical)" },
};

function componentColor(score: number): string {
  if (score > 0.05) return "var(--status-good)";
  if (score < -0.05) return "var(--status-critical)";
  return "var(--text-muted)";
}

/** Nexora Conviction Signal — a versioned, explainable composite readout,
 * distinct from the existing POSSIBLE_ENTRY/WATCH signal ladder shown
 * elsewhere. This is a chart annotation only: nothing here places, opens,
 * or even suggests a paper order — see the "Nexora Internal Paper" label
 * everywhere the platform actually executes anything. */
export function NcsPanel({ symbol, timeframe = "1D" }: { symbol: string; timeframe?: string }) {
  const [ncs, setNcs] = useState<NcsSignal | NcsNoSignalYet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.currentNcs(symbol, timeframe).then(setNcs).catch(() => setNcs(null));
  }, [symbol, timeframe]);

  const evaluate = () => {
    setLoading(true);
    setError(null);
    api
      .evaluateNcs(symbol, timeframe)
      .then(setNcs)
      .catch(setError)
      .finally(() => setLoading(false));
  };

  const hasSignal = ncs !== null && ncs.raw_verdict !== "NO_SIGNAL_YET";
  const signal = hasSignal ? (ncs as NcsSignal) : null;
  const style = signal ? VERDICT_STYLES[signal.raw_verdict] ?? VERDICT_STYLES.NEUTRAL : VERDICT_STYLES.NEUTRAL;

  return (
    <div className="card animate-in p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Nexora Conviction Signal{" "}
            <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
              — NCS
            </span>
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Nexora&apos;s own explainable composite signal, computed only from closed bars. A chart annotation, never
            an automatic trade.
          </p>
        </div>
        <button type="button" onClick={evaluate} disabled={loading} className="btn btn-ghost btn-sm shrink-0">
          {loading ? "Evaluating…" : hasSignal ? "Re-evaluate" : "Evaluate now"}
        </button>
      </div>

      {error !== null && (
        <p className="mt-3 text-xs" style={{ color: "var(--status-critical)" }}>
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {!signal ? (
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
          No NCS evaluation yet on {timeframe}.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className="rounded-full px-3 py-1 text-sm font-bold tracking-wide"
              style={{ color: style.color, background: `color-mix(in srgb, ${style.color} 15%, transparent)` }}
              title={signal.vetoed ? `Vetoed: ${signal.veto_reason}` : undefined}
            >
              {signal.vetoed ? "VETOED" : style.label}
            </span>
            {!signal.vetoed && signal.confirmed_verdict === null && (
              <span
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
                title="NCS requires two consecutive closed bars agreeing before a verdict counts as confirmed"
              >
                Awaiting confirmation
              </span>
            )}
            {signal.fired && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
                style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
              >
                NEW
              </span>
            )}
            <span className="tabular text-xs" style={{ color: "var(--text-muted)" }}>
              confidence {signal.confidence_pct.toFixed(0)}% · risk {signal.risk_score.toFixed(0)}/100
            </span>
          </div>

          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {signal.explanation}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {signal.components
              .filter((c) => c.weight > 0)
              .map((c) => (
                <span
                  key={c.name}
                  title={c.detail}
                  className="rounded px-2 py-1 text-[11px] font-medium"
                  style={{ background: "var(--surface-2)", color: componentColor(c.score) }}
                >
                  {c.name.replace(/_/g, " ")}
                </span>
              ))}
          </div>

          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Closed bar <LocalTime iso={signal.bar_ts} options={{ style: "short" }} /> · {signal.data_source} (
            {signal.data_mode}) · {signal.version}
          </p>
        </div>
      )}
    </div>
  );
}
