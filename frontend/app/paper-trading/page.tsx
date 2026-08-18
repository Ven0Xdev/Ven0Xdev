"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useResyncListener } from "@/lib/pwa";
import type { PaperAccount, PaperPosition } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatTile } from "@/components/ui/StatTile";
import { LocalTime } from "@/components/ui/LocalTime";

export default function PaperTradingPage() {
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [openPositions, setOpenPositions] = useState<PaperPosition[] | null>(null);
  const [closedPositions, setClosedPositions] = useState<PaperPosition[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const [form, setForm] = useState({ ticker: "", quantity: "" });
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<unknown>(null);
  const [closingId, setClosingId] = useState<number | null>(null);

  const load = useCallback(() => {
    Promise.all([api.paperAccount(), api.paperPositions("open"), api.paperPositions("closed")])
      .then(([a, open, closed]) => {
        setAccount(a);
        setOpenPositions(open);
        setClosedPositions(closed);
        setError(null);
      })
      .catch((e) => setError(e));
  }, []);

  useEffect(load, [load]);
  useResyncListener(load); // re-fetch fresh data automatically when connectivity is verified back

  useEffect(() => {
    if (account !== null || error !== null) return;
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

  const totalUnrealized = (openPositions ?? []).reduce((sum, p) => sum + (p.unrealized_pnl_dollars ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Paper Trading"
        description="Simulated execution only — no real money moves. Every open is gated by the same deterministic risk engine the scanner and Signal Engine use; a setup the platform would flag NO_TRADE/AVOID cannot be opened here either."
      />

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

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : account === null ? (
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
          <div className="animate-in-stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Cash balance" value={account.cash_balance} format={(n) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
            <StatTile label="Starting balance" value={account.starting_balance} format={(n) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
            <StatTile label="Open positions" value={openPositions?.length ?? 0} />
            <StatTile
              label="Unrealized P/L"
              value={totalUnrealized}
              format={(n) => `${n >= 0 ? "+" : ""}$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
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
    </div>
  );
}
