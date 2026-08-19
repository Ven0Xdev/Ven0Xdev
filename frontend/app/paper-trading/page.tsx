"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useResyncListener } from "@/lib/pwa";
import type { PaperAccount, PaperPosition, PaperSimulationSummary } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatTile } from "@/components/ui/StatTile";
import { LocalTime } from "@/components/ui/LocalTime";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WhyNoTradePanel } from "@/components/dashboard/WhyNoTradePanel";

const QUICK_AMOUNTS = [1_000, 2_500, 5_000, 10_000];

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/** Parses a user-typed amount that may include "$", ",", or stray
 * whitespace — never silently coerces garbage to 0; returns null for
 * anything that isn't a real positive number so the caller can show a
 * validation message instead of proceeding with a wrong amount. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function StartSimulationPanel({
  hasActiveSimulation,
  onStarted,
}: {
  hasActiveSimulation: boolean;
  onStarted: () => void;
}) {
  const [amountInput, setAmountInput] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const parsedAmount = useMemo(() => parseAmount(amountInput), [amountInput]);

  const submit = async () => {
    if (parsedAmount === null) return;
    setStarting(true);
    setError(null);
    try {
      await api.startPaperSimulation(parsedAmount);
      setShowConfirm(false);
      setAmountInput("");
      onStarted();
    } catch (e) {
      setError(e);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="card animate-in flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {hasActiveSimulation ? "Start New Simulation" : "Start Your First Paper Simulation"}
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Choose exactly how much simulated cash to start with — no fixed default. Nexora Internal Paper only;
          nothing here ever touches Alpaca or any real broker.
          {hasActiveSimulation &&
            " Starting a new simulation archives the current one (with its full history) — you'll need to close any open positions first."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            $
          </span>
          <input
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="Starting capital"
            inputMode="decimal"
            aria-label="Starting capital"
            className="input w-44"
            style={{ paddingLeft: "1.5rem" }}
          />
        </div>
        {QUICK_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setAmountInput(String(amount))}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
          >
            {formatUsd(amount)}
          </button>
        ))}
      </div>

      {amountInput.trim() && parsedAmount === null && (
        <p className="text-xs" style={{ color: "var(--status-critical)" }}>
          Enter a valid positive dollar amount.
        </p>
      )}

      <button
        type="button"
        disabled={parsedAmount === null}
        onClick={() => setShowConfirm(true)}
        className="btn btn-primary w-fit"
      >
        Start New Paper Simulation
      </button>

      {error !== null && (
        <p className="text-xs" style={{ color: "var(--status-critical)" }}>
          {error instanceof ApiError ? error.detail : error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {showConfirm && parsedAmount !== null && (
        <ConfirmDialog
          title="Start new paper simulation?"
          description={
            <>
              This starts a brand-new NEXORA INTERNAL PAPER simulation with exactly{" "}
              <strong style={{ color: "var(--text-primary)" }}>{formatUsd(parsedAmount)}</strong> in simulated cash.
              Realized and unrealized P&amp;L reset to zero.
              {hasActiveSimulation && " Your current simulation will be archived, never deleted."}
            </>
          }
          confirmLabel={`Start with ${formatUsd(parsedAmount)}`}
          busy={starting}
          onConfirm={submit}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

function SimulationHistory({ simulations }: { simulations: PaperSimulationSummary[] }) {
  if (simulations.length === 0) return null;
  return (
    <div>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Paper Simulations History
      </h2>
      <div className="card animate-in overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr
              className="text-left text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}
            >
              <th className="px-4 py-3">Simulation</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Starting balance</th>
              <th className="px-4 py-3">Closed trades</th>
              <th className="px-4 py-3">Realized P/L</th>
              <th className="px-4 py-3">Win rate</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Archived on</th>
            </tr>
          </thead>
          <tbody>
            {simulations.map((s) => (
              <tr key={s.id} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-4 py-3 font-semibold">#{s.simulation_number}{s.label ? ` — ${s.label}` : ""}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      color: s.is_active ? "var(--status-good)" : "var(--text-muted)",
                      background: s.is_active ? "var(--status-good-soft)" : "var(--surface-2)",
                    }}
                  >
                    {s.is_active ? "Active" : "Archived"}
                  </span>
                </td>
                <td className="px-4 py-3">{formatUsd(s.starting_balance)}</td>
                <td className="px-4 py-3">{s.closed_trade_count}</td>
                <td
                  className="px-4 py-3 font-semibold"
                  style={{ color: s.realized_pnl_dollars >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
                >
                  {s.closed_trade_count > 0
                    ? `${s.realized_pnl_dollars >= 0 ? "+" : ""}${formatUsd(s.realized_pnl_dollars)}`
                    : "—"}
                </td>
                <td className="px-4 py-3">{s.win_rate_pct != null ? `${s.win_rate_pct.toFixed(0)}%` : "—"}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                  <LocalTime iso={s.created_at} options={{ style: "short" }} />
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                  <LocalTime iso={s.archived_at} options={{ style: "short" }} fallback="—" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PaperTradingPage() {
  const [account, setAccount] = useState<PaperAccount | null | undefined>(undefined);
  const [simulations, setSimulations] = useState<PaperSimulationSummary[] | null>(null);
  const [openPositions, setOpenPositions] = useState<PaperPosition[] | null>(null);
  const [closedPositions, setClosedPositions] = useState<PaperPosition[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const [form, setForm] = useState({ ticker: "", quantity: "" });
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<unknown>(null);
  const [closingId, setClosingId] = useState<number | null>(null);

  const load = useCallback(() => {
    Promise.all([api.paperAccount(), api.paperPositions("open"), api.paperPositions("closed"), api.paperSimulations()])
      .then(([a, open, closed, sims]) => {
        setAccount(a);
        setOpenPositions(open);
        setClosedPositions(closed);
        setSimulations(sims);
        setError(null);
      })
      .catch((e) => setError(e));
  }, []);

  useEffect(load, [load]);
  useResyncListener(load); // re-fetch fresh data automatically when connectivity is verified back

  useEffect(() => {
    if (account !== undefined || error !== null) return;
    const t = setTimeout(() => setLoadingTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [account, error]);

  const retry = useCallback(() => {
    setError(null);
    setLoadingTooLong(false);
    load();
  }, [load]);

  const openPosition = async () => {
    if (!form.ticker.trim() || !form.quantity || opening) return;
    setOpening(true);
    setOpenError(null);
    try {
      await api.openPaperPosition(form.ticker.trim().toUpperCase(), Number(form.quantity));
      setForm({ ticker: "", quantity: "" });
      load();
    } catch (e) {
      setOpenError(e);
    } finally {
      setOpening(false);
    }
  };

  const closePosition = async (id: number) => {
    setClosingId(id);
    try {
      await api.closePaperPosition(id);
      load();
    } catch (e) {
      setError(e);
    } finally {
      setClosingId(null);
    }
  };

  const [autonomousBusy, setAutonomousBusy] = useState(false);
  const toggleAutonomous = async (enabled: boolean) => {
    setAutonomousBusy(true);
    try {
      const updated = await api.setAutonomousTrading(enabled);
      setAccount(updated);
    } catch (e) {
      setError(e);
    } finally {
      setAutonomousBusy(false);
    }
  };

  const totalUnrealized = (openPositions ?? []).reduce((sum, p) => sum + (p.unrealized_pnl_dollars ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Paper Trading"
        description="NEXORA INTERNAL PAPER — simulated execution only, no real money moves and no real broker is ever called. Every open is gated by the same deterministic risk engine the scanner and Signal Engine use; a setup the platform would flag NO_TRADE/AVOID cannot be opened here either."
      />

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : account === undefined ? (
        loadingTooLong ? (
          <div className="card flex flex-col gap-2 p-5 text-sm">
            <p className="font-semibold">Still waiting on your paper trading account.</p>
            <p style={{ color: "var(--text-secondary)" }}>This is taking longer than expected.</p>
            <button onClick={retry} className="btn btn-secondary btn-sm mt-1 w-fit">
              Retry
            </button>
          </div>
        ) : (
          <CardSkeleton lines={4} />
        )
      ) : (
        <>
          <StartSimulationPanel hasActiveSimulation={account !== null} onStarted={load} />

          {account === null ? (
            <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No active paper simulation yet — start one above to begin.
              </p>
            </div>
          ) : (
            <>
              <div className="animate-in-stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatTile label="Cash balance" value={account.cash_balance} format={(n) => formatUsd(n)} />
                <StatTile label="Equity" value={account.equity ?? account.cash_balance} format={(n) => formatUsd(n)} />
                <StatTile label="Starting balance" value={account.starting_balance} format={(n) => formatUsd(n)} />
                <StatTile label="Open positions" value={openPositions?.length ?? 0} />
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Simulation #{account.simulation_number}
                {account.label ? ` — ${account.label}` : ""} · started{" "}
                <LocalTime iso={account.created_at} options={{ style: "short" }} />
              </p>

              <div className="card animate-in flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Autonomous trading
                  </h3>
                  <p className="mt-0.5 max-w-2xl text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    When on, this simulation may open a NEXORA INTERNAL PAPER position on its own — only when a fired
                    NCS signal clears Red-Team review, its own shadow track record, and this account&apos;s position
                    limits. Off by default; a platform-wide emergency stop can also disable this for every simulation.
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={account.autonomous_trading_enabled}
                    disabled={autonomousBusy}
                    onChange={(e) => toggleAutonomous(e.target.checked)}
                  />
                  {account.autonomous_trading_enabled ? "Enabled" : "Disabled"}
                </label>
              </div>

              <WhyNoTradePanel />

              <form
                className="card animate-in flex flex-wrap items-start gap-2.5 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  openPosition();
                }}
              >
                <input
                  value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                  placeholder="Ticker"
                  className="input w-28"
                />
                <input
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="Quantity"
                  type="number"
                  min="0"
                  step="any"
                  className="input w-32"
                />
                <button type="submit" disabled={opening} className="btn btn-primary">
                  {opening ? "Checking risk gate…" : "Open paper position"}
                </button>
                {openError !== null && (
                  <p className="w-full text-xs" style={{ color: "var(--status-critical)" }}>
                    {openError instanceof Error ? openError.message : String(openError)}
                  </p>
                )}
              </form>

              <div className="animate-in-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatTile
                  label="Unrealized P/L"
                  value={totalUnrealized}
                  format={(n) => `${n >= 0 ? "+" : ""}${formatUsd(n)}`}
                />
              </div>

              <div>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Open positions
                </h2>
                {openPositions && openPositions.length === 0 ? (
                  <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>No open paper positions.</p>
                  </div>
                ) : (
                  <div className="card animate-in overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                          <th className="px-4 py-3">Ticker</th>
                          <th className="px-4 py-3">Qty</th>
                          <th className="px-4 py-3">Entry</th>
                          <th className="px-4 py-3">Current</th>
                          <th className="px-4 py-3">Unrealized P/L</th>
                          <th className="px-4 py-3">Entry confidence</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {(openPositions ?? []).map((p) => (
                          <tr key={p.id} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
                            <td className="px-4 py-3">
                              <Link href={`/stock/${p.ticker_symbol}`} className="font-semibold hover:underline">
                                {p.ticker_symbol}
                              </Link>
                              {p.opened_by === "autonomous" && (
                                <span
                                  className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
                                  style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
                                  title={`Opened autonomously${p.ncs_signal_id ? ` from NCS signal #${p.ncs_signal_id}` : ""}`}
                                >
                                  AUTO
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">{p.quantity}</td>
                            <td className="px-4 py-3">${p.avg_entry_price.toFixed(4)}</td>
                            <td className="px-4 py-3">{p.current_price ? `$${p.current_price.toFixed(4)}` : "—"}</td>
                            <td
                              className="px-4 py-3 font-semibold"
                              style={{ color: (p.unrealized_pnl_dollars ?? 0) >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
                            >
                              {p.unrealized_pnl_dollars != null
                                ? `${p.unrealized_pnl_dollars >= 0 ? "+" : ""}$${p.unrealized_pnl_dollars.toFixed(2)} (${p.unrealized_pnl_pct?.toFixed(1)}%)`
                                : "—"}
                            </td>
                            <td className="px-4 py-3">{p.entry_confidence_pct != null ? `${p.entry_confidence_pct.toFixed(0)}%` : "—"}</td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => closePosition(p.id)}
                                disabled={closingId === p.id}
                                className="btn btn-ghost btn-sm"
                                style={{ color: "var(--status-critical)" }}
                              >
                                {closingId === p.id ? "Closing…" : "Close"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Closed positions
                </h2>
                {closedPositions && closedPositions.length === 0 ? (
                  <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>No closed paper positions yet.</p>
                  </div>
                ) : (
                  <div className="card animate-in overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                          <th className="px-4 py-3">Ticker</th>
                          <th className="px-4 py-3">Qty</th>
                          <th className="px-4 py-3">Entry</th>
                          <th className="px-4 py-3">Exit</th>
                          <th className="px-4 py-3">Realized P/L</th>
                          <th className="px-4 py-3">Closed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(closedPositions ?? []).map((p) => (
                          <tr key={p.id} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
                            <td className="px-4 py-3">
                              <Link href={`/stock/${p.ticker_symbol}`} className="font-semibold hover:underline">
                                {p.ticker_symbol}
                              </Link>
                              {p.opened_by === "autonomous" && (
                                <span
                                  className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
                                  style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
                                  title={`Opened autonomously${p.ncs_signal_id ? ` from NCS signal #${p.ncs_signal_id}` : ""}`}
                                >
                                  AUTO
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">{p.quantity}</td>
                            <td className="px-4 py-3">${p.avg_entry_price.toFixed(4)}</td>
                            <td className="px-4 py-3">{p.exit_price ? `$${p.exit_price.toFixed(4)}` : "—"}</td>
                            <td
                              className="px-4 py-3 font-semibold"
                              style={{ color: (p.realized_pnl_dollars ?? 0) >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
                            >
                              {p.realized_pnl_dollars != null ? `${p.realized_pnl_dollars >= 0 ? "+" : ""}$${p.realized_pnl_dollars.toFixed(2)}` : "—"}
                            </td>
                            <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                              <LocalTime iso={p.closed_at} options={{ style: "short" }} fallback="—" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {simulations && <SimulationHistory simulations={simulations} />}
        </>
      )}
    </div>
  );
}
