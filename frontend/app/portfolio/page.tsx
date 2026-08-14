"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useResyncListener } from "@/lib/pwa";
import type { PortfolioPosition } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

export default function PortfolioPage() {
  const [positions, setPositions] = useState<PortfolioPosition[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const [form, setForm] = useState({ ticker: "", quantity: "", price: "" });
  const [opening, setOpening] = useState(false);

  // Kept free of any synchronous setState call so it's safe to hand
  // directly to useEffect below, matching the Dashboard/Watchlist
  // pages' established load() pattern.
  const load = useCallback(() => {
    api
      .portfolio()
      .then((data) => {
        setPositions(data);
        setError(null);
      })
      .catch((e) => setError(e));
  }, []);

  useEffect(load, [load]);
  useResyncListener(load); // re-fetch fresh data automatically when connectivity is verified back

  useEffect(() => {
    if (positions !== null || error !== null) return;
    const t = setTimeout(() => setLoadingTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [positions, error]);

  // Event-handler-only: safe to setState synchronously here.
  const retry = useCallback(() => {
    setError(null);
    setLoadingTooLong(false);
    load();
  }, [load]);

  const openPosition = async () => {
    if (!form.ticker || !form.quantity || !form.price || opening) return;
    setOpening(true);
    try {
      await api.openPosition(form.ticker.toUpperCase(), Number(form.quantity), Number(form.price));
      setForm({ ticker: "", quantity: "", price: "" });
      load();
    } catch (e) {
      setError(e);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Portfolio" description="Manually logged positions, marked to the live AI-analyzed price." />

      <form
        className="card animate-in flex flex-wrap gap-2.5 p-4"
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
          className="input w-32"
        />
        <input
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          placeholder="Avg entry price"
          type="number"
          step="0.0001"
          className="input w-44"
        />
        <button type="submit" disabled={opening} className="btn btn-primary">
          {opening ? "Opening…" : "Open position"}
        </button>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={retry} />
      ) : !positions ? (
        loadingTooLong ? (
          <div className="card flex flex-col gap-2 p-5 text-sm">
            <p className="font-semibold">Still waiting on your portfolio.</p>
            <p style={{ color: "var(--text-secondary)" }}>This is taking longer than expected.</p>
            <button onClick={retry} className="btn btn-secondary btn-sm mt-1 w-fit">
              Retry
            </button>
          </div>
        ) : (
          <CardSkeleton lines={3} />
        )
      ) : positions.length === 0 ? (
        <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-muted)" }}>
            <path d="M3 7h18v13H3V7Zm5 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No open positions.</p>
        </div>
      ) : (
        <div className="card animate-in overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Avg entry</th>
                <th className="px-4 py-3">Current</th>
                <th className="px-4 py-3">Unrealized P/L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr
                  key={p.ticker_symbol}
                  className="tabular border-t"
                  style={{ borderColor: "var(--gridline)", transition: "background-color var(--duration-fast) var(--ease-out)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
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
                    style={{ color: (p.unrealized_pnl_pct ?? 0) >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
                  >
                    {p.unrealized_pnl_pct != null ? `${p.unrealized_pnl_pct.toFixed(1)}%` : "—"}
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
