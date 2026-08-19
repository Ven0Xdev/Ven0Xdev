"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { WhyNoTrade } from "@/lib/types";

const GATE_LABELS: Record<string, string> = {
  emergency_stop: "Emergency stop",
  account_opt_in: "Account opt-in",
  ncs_signal: "NCS signal",
  red_team: "Red-Team",
  shadow_track_record: "Shadow track record",
  no_existing_position: "No existing position",
  position_limit: "Position limit",
  risk_gate: "Risk gate",
  quote_freshness: "Quote freshness",
};

/** Paper Trading's "Why no trade?" — a read-only walk through every gate
 * autonomous trading itself checks for one ticker on this account, so
 * "why hasn't this fired a trade?" has a concrete, auditable answer
 * instead of silence. Never opens or closes anything (see
 * backend/app/services/paper_trading/why_no_trade.py). */
export function WhyNoTradePanel() {
  const [ticker, setTicker] = useState("");
  const [report, setReport] = useState<WhyNoTrade | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const check = () => {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return;
    setLoading(true);
    setError(null);
    api
      .whyNoTrade(symbol, "1D")
      .then(setReport)
      .catch(setError)
      .finally(() => setLoading(false));
  };

  return (
    <div className="card animate-in flex flex-col gap-3 p-4">
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Why no trade?
        </h3>
        <p className="mt-0.5 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Walks every gate autonomous trading itself checks for one ticker on this account — market state, data
          freshness, provider, NCS state, Red-Team, Shadow sample/win rate, drift, and the risk gate — without
          opening or closing anything.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Ticker"
          className="input w-28"
        />
        <button type="submit" disabled={loading || !ticker.trim()} className="btn btn-secondary btn-sm">
          {loading ? "Checking…" : "Check"}
        </button>
      </form>

      {error !== null && (
        <p className="text-xs" style={{ color: "var(--status-critical)" }}>
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {report && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className="rounded-full px-3 py-1 text-sm font-bold tracking-wide"
              style={{
                color: report.permitted ? "var(--status-good)" : "var(--status-critical)",
                background: `color-mix(in srgb, ${report.permitted ? "var(--status-good)" : "var(--status-critical)"} 15%, transparent)`,
              }}
            >
              {report.ticker} — {report.permitted ? "PERMITTED" : "BLOCKED"}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              market {report.market_state} · {report.provider} ({report.data_mode}) · data {report.data_freshness}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Field label="NCS state" value={report.ncs_state} />
            <Field label="Red-Team" value={report.red_team_result} />
            <Field
              label="Shadow sample"
              value={`${report.shadow_sample_size} closed${report.shadow_win_rate_pct !== null ? `, ${report.shadow_win_rate_pct.toFixed(0)}% win` : ""}`}
            />
            <Field label="Drift status" value={report.drift_status} />
          </div>

          {report.blockers.length > 0 && (
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
                Exact blockers
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {report.blockers.map((b, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    · {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              All gate statuses
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {report.gates.map((g) => (
                <span
                  key={g.name}
                  title={g.detail}
                  className="rounded px-2 py-1 text-[11px] font-medium"
                  style={{
                    background: g.passed ? "var(--surface-2)" : "var(--status-critical-soft)",
                    color: g.passed ? "var(--text-muted)" : "var(--status-critical)",
                  }}
                >
                  {GATE_LABELS[g.name] ?? g.name}: {g.passed ? "OK" : "blocked"}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="font-medium" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}
