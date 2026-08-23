"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { CanaryStatusResponse } from "@/lib/types";
import { LocalTime } from "@/components/ui/LocalTime";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/** Phase 6/7 — Research Canary status, fully separate from manual/
 * autonomous Paper Trading and production Shadow. Operator controls
 * (enable/disable/clear-auto-pause/train) only render for operators —
 * the backend independently enforces the same gate regardless, this is
 * purely so a non-operator isn't shown a button that would 403. */
export function CanaryPanel({ isOperator }: { isOperator: boolean }) {
  const [status, setStatus] = useState<CanaryStatusResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmEnable, setConfirmEnable] = useState(false);

  const load = () => {
    api.canaryStatus().then((r) => (setStatus(r), setError(null))).catch((e) => setError(e));
  };
  useEffect(load, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!status) return <CardSkeleton lines={5} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="card animate-in flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Research Canary — INTERNAL PAPER, experimental
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Trades only a HISTORICALLY_QUALIFIED research model, only INTERNAL simulation, long-only, max 0.25% risk/trade,
            max 1 new position/day, max 2 concurrent, auto-pauses at 2% drawdown. Requires the operator&apos;s opt-in AND the
            platform-wide Autonomous Trading Emergency Stop to be resumed — both independently, neither implies the other.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-bold tracking-wide"
            style={{
              color: status.enabled ? "var(--status-good)" : "var(--text-muted)",
              background: "color-mix(in srgb, currentColor 12%, transparent)",
            }}
          >
            {status.enabled ? "ENABLED" : "DISABLED"}
          </span>
          {status.auto_paused && (
            <span
              className="rounded-full px-2.5 py-1 text-xs font-bold tracking-wide"
              style={{ color: "var(--status-critical)", background: "color-mix(in srgb, currentColor 12%, transparent)" }}
              title={status.auto_pause_reason ?? undefined}
            >
              AUTO-PAUSED
            </span>
          )}
        </div>
      </div>

      {isOperator && (
        <div className="card animate-in flex flex-wrap items-center gap-2 p-4">
          {!status.enabled ? (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setConfirmEnable(true)}>
              Enable Research Canary
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(api.disableCanary)}>
              Disable Research Canary
            </button>
          )}
          {status.auto_paused && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(api.clearCanaryAutoPause)}>
              Clear auto-pause
            </button>
          )}
          {actionError && <p className="w-full text-xs" style={{ color: "var(--status-critical)" }}>{actionError}</p>}
        </div>
      )}

      {confirmEnable && (
        <ConfirmDialog
          title="Enable Research Canary?"
          description={
            <>
              This opts this INTERNAL-PAPER-ONLY experimental track in. It still cannot trade unless the platform-wide
              Autonomous Trading Emergency Stop is separately resumed. No real broker order can ever result from this.
            </>
          }
          confirmLabel="Enable"
          busy={busy}
          onConfirm={() => run(api.enableCanary).then(() => setConfirmEnable(false))}
          onCancel={() => setConfirmEnable(false)}
        />
      )}

      <div className="animate-in-stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Cash balance</p>
          <p className="mt-1 text-lg font-bold tabular">{formatUsd(status.cash_balance)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Starting balance</p>
          <p className="mt-1 text-lg font-bold tabular">{formatUsd(status.starting_balance)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Peak equity</p>
          <p className="mt-1 text-lg font-bold tabular">{formatUsd(status.peak_equity)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Today&apos;s realized P/L</p>
          <p className="mt-1 text-lg font-bold tabular" style={{ color: status.realized_pnl_today_dollars >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
            {status.realized_pnl_today_dollars >= 0 ? "+" : ""}{formatUsd(status.realized_pnl_today_dollars)}
          </p>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Open Canary positions</h4>
        {status.open_positions.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>None open.</p>
        ) : (
          <div className="card animate-in overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Horizon</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">Stop</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Max hold until</th>
                </tr>
              </thead>
              <tbody>
                {status.open_positions.map((p) => (
                  <tr key={p.id} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
                    <td className="px-3 py-2 font-semibold">{p.ticker_symbol}</td>
                    <td className="px-3 py-2">{p.horizon}</td>
                    <td className="px-3 py-2">{p.quantity.toFixed(4)}</td>
                    <td className="px-3 py-2">${p.avg_entry_price.toFixed(2)}</td>
                    <td className="px-3 py-2" style={{ color: "var(--status-critical)" }}>${p.stop_loss.toFixed(2)}</td>
                    <td className="px-3 py-2" style={{ color: "var(--status-good)" }}>{p.take_profit ? `$${p.take_profit.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      <LocalTime iso={p.max_holding_until} options={{ style: "short" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Recent decisions</h4>
        {status.recent_decisions.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No Canary decisions have been evaluated yet.</p>
        ) : (
          <div className="card animate-in overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Verdict</th>
                  <th className="px-3 py-2">P(BUY)</th>
                  <th className="px-3 py-2">Fired</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {status.recent_decisions.map((d) => (
                  <tr key={d.id} className="tabular border-t align-top" style={{ borderColor: "var(--gridline)" }}>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      <LocalTime iso={d.evaluated_at} options={{ style: "short", seconds: true }} />
                    </td>
                    <td className="px-3 py-2 font-semibold">{d.ticker_symbol}</td>
                    <td className="px-3 py-2">{d.verdict}</td>
                    <td className="px-3 py-2">{d.probability.toFixed(3)}</td>
                    <td className="px-3 py-2" style={{ color: d.fired ? "var(--status-good)" : "var(--text-muted)" }}>
                      {d.fired ? "Yes" : "No"}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{d.no_trade_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
