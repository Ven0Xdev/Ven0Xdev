"use client";

import { StatTile } from "@/components/ui/StatTile";
import type { AccountSummary } from "@/lib/paperTradingMath";

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/** Every tile here reads straight off computeAccountSummary() — real cash/
 * equity/positions/orders, nothing simulated. No margin/leverage tile:
 * this account is cash-only (see engine.py's own docstring), so buying
 * power is plain cash — shown explicitly as "Cash / 1x", never omitted or
 * silently implied to be something else. */
export function AccountSummaryPanel({ summary }: { summary: AccountSummary }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="animate-in-stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Cash balance" value={summary.cashBalance} format={formatUsd} />
        <StatTile label="Equity" value={summary.equity} format={formatUsd} />
        <StatTile label="Starting balance" value={summary.startingBalance} format={formatUsd} />
        <StatTile label="Open positions" value={summary.openPositionCount} />
        <StatTile
          label="Realized P/L"
          value={summary.realizedPnlDollars}
          format={(n) => `${n >= 0 ? "+" : ""}${formatUsd(n)}`}
        />
        <StatTile
          label="Unrealized P/L"
          value={summary.unrealizedPnlDollars}
          format={(n) => `${n >= 0 ? "+" : ""}${formatUsd(n)}`}
        />
        <StatTile label="Capital committed" value={summary.capitalCommittedDollars} format={formatUsd} />
        <StatTile label="Open-order value" value={summary.openOrderValueDollars} format={formatUsd} />
      </div>
      <div className="card animate-in flex flex-wrap items-center gap-4 p-3 text-xs">
        <span>
          Buying power: <strong className="tabular">{formatUsd(summary.buyingPower)}</strong>{" "}
          <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
            Cash / 1x
          </span>
        </span>
        <span>
          Today&apos;s realized P/L:{" "}
          <strong className="tabular" style={{ color: summary.todayRealizedPnlDollars >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
            {summary.todayRealizedPnlDollars >= 0 ? "+" : ""}{formatUsd(summary.todayRealizedPnlDollars)}
          </strong>
        </span>
        <span>
          Total return:{" "}
          <strong className="tabular" style={{ color: summary.totalReturnPct >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
            {summary.totalReturnPct >= 0 ? "+" : ""}{summary.totalReturnPct.toFixed(2)}%
          </strong>
        </span>
        <span>
          Max drawdown: <strong className="tabular" style={{ color: "var(--status-critical)" }}>-{summary.maxDrawdownPct.toFixed(2)}%</strong>
        </span>
      </div>
    </div>
  );
}
