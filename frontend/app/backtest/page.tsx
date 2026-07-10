"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { BacktestResult } from "@/lib/types";
import { StatTile } from "@/components/ui/StatTile";
import { EquityCurveChart } from "@/components/charts/EquityCurveChart";

export default function BacktestPage() {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({ universe_limit: 15, lookback_days: 300, max_hold_days: 20, position_size_dollars: 2000 });

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.runBacktest(params);
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Backtest Engine</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Realistic execution simulation: spread, slippage, partial fills, and trading halts on the OTC universe.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-4 p-4">
        <NumberField label="Universe limit" value={params.universe_limit} onChange={(v) => setParams({ ...params, universe_limit: v })} />
        <NumberField label="Lookback days" value={params.lookback_days} onChange={(v) => setParams({ ...params, lookback_days: v })} />
        <NumberField label="Max hold days" value={params.max_hold_days} onChange={(v) => setParams({ ...params, max_hold_days: v })} />
        <NumberField
          label="Position size ($)"
          value={params.position_size_dollars}
          onChange={(v) => setParams({ ...params, position_size_dollars: v })}
        />
        <button
          onClick={run}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: "var(--series-blue)", color: "#fff" }}
        >
          {loading ? "Running…" : "Run backtest"}
        </button>
      </div>

      {error && (
        <div className="card p-4 text-sm" style={{ color: "var(--status-critical)" }}>
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Sharpe ratio" value={result.sharpe_ratio.toFixed(2)} />
            <StatTile label="Sortino ratio" value={result.sortino_ratio.toFixed(2)} />
            <StatTile label="Max drawdown" value={`${result.max_drawdown_pct.toFixed(1)}%`} />
            <StatTile label="Profit factor" value={result.profit_factor.toFixed(2)} />
            <StatTile label="Win rate" value={`${result.win_rate_pct.toFixed(0)}%`} />
            <StatTile label="Expectancy / trade" value={`${result.expectancy_pct.toFixed(2)}%`} />
            <StatTile label="Avg hold time" value={`${result.avg_hold_time_days.toFixed(1)}d`} />
            <StatTile label="Total return" value={`${result.total_return_pct.toFixed(1)}%`} />
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
              Equity curve ({result.num_trades} trades)
            </h2>
            <EquityCurveChart data={result.equity_curve} />
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                  <th className="px-4 py-2 font-medium">Symbol</th>
                  <th className="px-4 py-2 font-medium">Entry</th>
                  <th className="px-4 py-2 font-medium">Exit</th>
                  <th className="px-4 py-2 font-medium">P/L</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                  <th className="px-4 py-2 font-medium">Hold days</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.slice(0, 100).map((t, i) => (
                  <tr key={i} className="border-t tabular" style={{ borderColor: "var(--gridline)" }}>
                    <td className="px-4 py-2 font-medium">{t.symbol}</td>
                    <td className="px-4 py-2">${t.entry_price.toFixed(4)}</td>
                    <td className="px-4 py-2">{t.exit_price ? `$${t.exit_price.toFixed(4)}` : "—"}</td>
                    <td className="px-4 py-2 font-semibold" style={{ color: (t.pnl_pct ?? 0) >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                      {t.pnl_pct != null ? `${t.pnl_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                      {t.exit_reason}
                      {t.was_halted_entry ? " (halted)" : ""}
                    </td>
                    <td className="px-4 py-2">{t.hold_days}</td>
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
    <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32 rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--border)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
    </label>
  );
}
