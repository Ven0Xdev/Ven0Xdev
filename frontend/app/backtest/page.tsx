"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { BacktestResult } from "@/lib/types";
import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { EquityCurveChart } from "@/components/charts/EquityCurveChart";
import { ErrorState } from "@/components/ui/ErrorState";

export default function BacktestPage() {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [params, setParams] = useState({ universe_limit: 15, lookback_days: 300, max_hold_days: 20, position_size_dollars: 2000 });

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.runBacktest(params);
      setResult(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Backtest Engine"
        description="Realistic execution simulation: spread, slippage, partial fills, and trading halts across the tracked asset universe."
      />

      <form
        className="card animate-in flex flex-wrap items-end gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <NumberField label="Universe limit" value={params.universe_limit} onChange={(v) => setParams({ ...params, universe_limit: v })} />
        <NumberField label="Lookback days" value={params.lookback_days} onChange={(v) => setParams({ ...params, lookback_days: v })} />
        <NumberField label="Max hold days" value={params.max_hold_days} onChange={(v) => setParams({ ...params, max_hold_days: v })} />
        <NumberField
          label="Position size ($)"
          value={params.position_size_dollars}
          onChange={(v) => setParams({ ...params, position_size_dollars: v })}
        />
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? "Running…" : "Run backtest"}
        </button>
      </form>

      {error !== null && <ErrorState error={error} onRetry={run} />}

      {loading && !result && (
        <div className="card animate-in flex flex-col items-center gap-3 p-14 text-center">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2"
            style={{ borderColor: "var(--gridline)", borderTopColor: "var(--accent)" }}
            aria-hidden="true"
          />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Simulating fills across the universe — this can take a moment…
          </p>
        </div>
      )}

      {result && (
        <>
          <div className="animate-in-stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Sharpe ratio" value={result.sharpe_ratio} format={(n) => n.toFixed(2)} />
            <StatTile label="Sortino ratio" value={result.sortino_ratio} format={(n) => n.toFixed(2)} />
            <StatTile label="Max drawdown" value={result.max_drawdown_pct} format={(n) => `${n.toFixed(1)}%`} />
            <StatTile label="Profit factor" value={result.profit_factor} format={(n) => n.toFixed(2)} />
            <StatTile label="Win rate" value={result.win_rate_pct} format={(n) => `${n.toFixed(0)}%`} />
            <StatTile label="Expectancy / trade" value={result.expectancy_pct} format={(n) => `${n.toFixed(2)}%`} />
            <StatTile label="Avg hold time" value={result.avg_hold_time_days} format={(n) => `${n.toFixed(1)}d`} />
            <StatTile label="Total return" value={result.total_return_pct} format={(n) => `${n.toFixed(1)}%`} />
          </div>

          <div className="card animate-in p-5">
            <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Equity curve ({result.num_trades} trades)
            </h2>
            <EquityCurveChart data={result.equity_curve} />
          </div>

          <div className="card animate-in overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Entry</th>
                  <th className="px-4 py-3">Exit</th>
                  <th className="px-4 py-3">P/L</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Hold days</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.slice(0, 100).map((t, i) => (
                  <tr
                    key={i}
                    className="tabular border-t"
                    style={{ borderColor: "var(--gridline)", transition: "background-color var(--duration-fast) var(--ease-out)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-4 py-2.5 font-semibold">{t.symbol}</td>
                    <td className="px-4 py-2.5">${t.entry_price.toFixed(4)}</td>
                    <td className="px-4 py-2.5">{t.exit_price ? `$${t.exit_price.toFixed(4)}` : "—"}</td>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: (t.pnl_pct ?? 0) >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                      {t.pnl_pct != null ? `${t.pnl_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                      {t.exit_reason}
                      {t.was_halted_entry ? " (halted)" : ""}
                    </td>
                    <td className="px-4 py-2.5">{t.hold_days}</td>
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

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
      {label}
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="input w-32" />
    </label>
  );
}
