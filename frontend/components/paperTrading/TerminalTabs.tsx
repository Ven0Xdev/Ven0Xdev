"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { PaperOrderRecord, PaperPosition, PaperTradeRecord } from "@/lib/types";
import { LocalTime } from "@/components/ui/LocalTime";
import { EquityCurveChart } from "@/components/charts/EquityCurveChart";
import type { AccountSummary } from "@/lib/paperTradingMath";

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="card animate-in flex flex-col items-center gap-2 p-10 text-center">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{text}</p>
    </div>
  );
}

function OriginBadge({ origin, ncsSignalId }: { origin: string; ncsSignalId: number | null }) {
  if (origin !== "autonomous") return null;
  return (
    <span
      className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
      style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
      title={`Opened autonomously${ncsSignalId ? ` from NCS signal #${ncsSignalId}` : ""}`}
    >
      AUTO
    </span>
  );
}

export function PositionsTab({
  positions,
  onClose,
  closingId,
}: {
  positions: PaperPosition[];
  onClose: (id: number) => void;
  closingId: number | null;
}) {
  if (positions.length === 0) return <EmptyState text="No open paper positions." />;
  return (
    <div className="card animate-in overflow-x-auto">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">Avg fill</th>
            <th className="px-3 py-2">Last</th>
            <th className="px-3 py-2">TP / SL</th>
            <th className="px-3 py-2">Unrealized P/L</th>
            <th className="px-3 py-2">Market value</th>
            <th className="px-3 py-2">Capital allocated</th>
            <th className="px-3 py-2">Signal / strategy</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.id} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
              <td className="px-3 py-2">
                <Link href={`/stock/${p.ticker_symbol}`} className="font-semibold hover:underline">{p.ticker_symbol}</Link>
                <OriginBadge origin={p.opened_by} ncsSignalId={p.ncs_signal_id} />
              </td>
              <td className="px-3 py-2" style={{ color: "var(--status-good)" }}>LONG</td>
              <td className="px-3 py-2">{p.quantity}</td>
              <td className="px-3 py-2">${p.avg_entry_price.toFixed(4)}</td>
              <td className="px-3 py-2">
                {p.current_price ? `$${p.current_price.toFixed(4)}` : "—"}
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <LocalTime iso={p.opened_at} options={{ style: "short" }} showAbbreviation={false} />
                </div>
              </td>
              <td className="px-3 py-2 text-xs">
                <span style={{ color: "var(--status-good)" }}>{p.planned_take_profit != null ? `$${p.planned_take_profit.toFixed(2)}` : "—"}</span>
                {" / "}
                <span style={{ color: "var(--status-critical)" }}>{p.planned_stop_loss != null ? `$${p.planned_stop_loss.toFixed(2)}` : "—"}</span>
              </td>
              <td className="px-3 py-2 font-semibold" style={{ color: (p.unrealized_pnl_dollars ?? 0) >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                {p.unrealized_pnl_dollars != null ? `${p.unrealized_pnl_dollars >= 0 ? "+" : ""}$${p.unrealized_pnl_dollars.toFixed(2)} (${p.unrealized_pnl_pct?.toFixed(1)}%)` : "—"}
              </td>
              <td className="px-3 py-2">{p.current_price ? formatUsd(p.current_price * p.quantity) : "—"}</td>
              <td className="px-3 py-2">{formatUsd(p.avg_entry_price * p.quantity)}</td>
              <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                {p.ncs_signal_id ? `NCS #${p.ncs_signal_id}` : "manual entry"} · {p.risk_policy_version}
              </td>
              <td className="px-3 py-2">
                <button onClick={() => onClose(p.id)} disabled={closingId === p.id} className="btn btn-ghost btn-sm" style={{ color: "var(--status-critical)" }}>
                  {closingId === p.id ? "Closing…" : "Close"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "var(--status-warning)", accepted: "var(--status-warning)", partially_filled: "var(--series-blue)",
  filled: "var(--status-good)", cancelled: "var(--text-muted)", rejected: "var(--status-critical)",
  expired: "var(--text-muted)", triggered: "var(--status-good)",
};

export function OpenOrdersTab({ orders, onRefresh }: { orders: PaperOrderRecord[]; onRefresh: () => void }) {
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = orders.filter((o) => o.status === "pending" || o.status === "accepted" || o.status === "partially_filled");

  const cancel = async (id: number) => {
    setCancellingId(id);
    setError(null);
    try {
      await api.cancelPaperOrder(id);
      onRefresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e));
    } finally {
      setCancellingId(null);
    }
  };

  if (pending.length === 0) return <EmptyState text="No open paper orders." />;
  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-xs" style={{ color: "var(--status-critical)" }}>{error}</p>}
      <div className="card animate-in overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Origin</th>
              <th className="px-3 py-2">Submitted</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {pending.map((o) => (
              <tr key={o.id} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-3 py-2 font-semibold">
                  <Link href={`/stock/${o.ticker_symbol}`} className="hover:underline">{o.ticker_symbol}</Link>
                  {o.oco_group_id && <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }} title="Part of a take-profit/stop-loss bracket">OCO</span>}
                </td>
                <td className="px-3 py-2 capitalize">{o.side}</td>
                <td className="px-3 py-2 capitalize">{o.order_type.replace("_", " ")}</td>
                <td className="px-3 py-2">{o.quantity}</td>
                <td className="px-3 py-2">{o.limit_price != null ? `$${o.limit_price.toFixed(2)}` : o.stop_price != null ? `$${o.stop_price.toFixed(2)}` : "market"}</td>
                <td className="px-3 py-2">
                  <span className="font-semibold" style={{ color: ORDER_STATUS_COLORS[o.status] }}>{o.status.replace("_", " ")}</span>
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{o.origin}</td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}><LocalTime iso={o.created_at} options={{ style: "short" }} /></td>
                <td className="px-3 py-2">
                  <button onClick={() => cancel(o.id)} disabled={cancellingId === o.id} className="btn btn-ghost btn-sm" style={{ color: "var(--status-critical)" }}>
                    {cancellingId === o.id ? "Cancelling…" : "Cancel"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OrderHistoryTab({ orders, trades }: { orders: PaperOrderRecord[]; trades: PaperTradeRecord[] }) {
  const settled = orders.filter((o) => o.status !== "pending" && o.status !== "accepted");
  if (settled.length === 0 && trades.length === 0) return <EmptyState text="No order history yet." />;
  return (
    <div className="card animate-in overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Fill price</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2">Updated</th>
          </tr>
        </thead>
        <tbody>
          {settled.map((o) => (
            <tr key={o.id} className="tabular border-t" style={{ borderColor: "var(--gridline)" }}>
              <td className="px-3 py-2 font-semibold">
                <Link href={`/stock/${o.ticker_symbol}`} className="hover:underline">{o.ticker_symbol}</Link>
              </td>
              <td className="px-3 py-2 capitalize">{o.side}</td>
              <td className="px-3 py-2 capitalize">{o.order_type.replace("_", " ")}</td>
              <td className="px-3 py-2">{o.quantity}</td>
              <td className="px-3 py-2">
                <span className="font-semibold" style={{ color: ORDER_STATUS_COLORS[o.status] }}>{o.status.replace("_", " ")}</span>
              </td>
              <td className="px-3 py-2">{o.filled_price != null ? `$${o.filled_price.toFixed(4)}` : "—"}</td>
              <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{o.rejected_reason ?? o.cancelled_reason ?? "—"}</td>
              <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}><LocalTime iso={o.updated_at} options={{ style: "short" }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EquityHistoryTab({ summary, startingBalance }: { summary: AccountSummary; startingBalance: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="animate-in-stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total return</p>
          <p className="mt-1 text-lg font-bold tabular" style={{ color: summary.totalReturnPct >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
            {summary.totalReturnPct >= 0 ? "+" : ""}{summary.totalReturnPct.toFixed(2)}%
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Max drawdown</p>
          <p className="mt-1 text-lg font-bold tabular" style={{ color: "var(--status-critical)" }}>-{summary.maxDrawdownPct.toFixed(2)}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Today&apos;s realized P/L</p>
          <p className="mt-1 text-lg font-bold tabular" style={{ color: summary.todayRealizedPnlDollars >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
            {summary.todayRealizedPnlDollars >= 0 ? "+" : ""}{formatUsd(summary.todayRealizedPnlDollars)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Starting balance</p>
          <p className="mt-1 text-lg font-bold tabular">{formatUsd(startingBalance)}</p>
        </div>
      </div>
      <div className="card animate-in p-4">
        <p className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
          Equity after each closed trade (real realized P/L, chronological — not a continuous intraday mark-to-market series)
        </p>
        <EquityCurveChart data={summary.equityCurve} />
      </div>
    </div>
  );
}

export function TradingJournalTab({ closedPositions }: { closedPositions: PaperPosition[] }) {
  if (closedPositions.length === 0) return <EmptyState text="No closed trades yet — the journal fills in as positions close." />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Shown below: everything this platform genuinely tracks per trade (entry confidence, planned risk/reward, planned
        stop/target, origin, risk-policy version). Fees, slippage, news context, and maximum favorable/adverse excursion are
        not yet persisted per trade in this simulator — they are honestly omitted here rather than estimated.
      </p>
      <div className="card animate-in overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Origin</th>
              <th className="px-3 py-2">Entry confidence</th>
              <th className="px-3 py-2">Planned R:R</th>
              <th className="px-3 py-2">Planned SL / TP</th>
              <th className="px-3 py-2">Entry → Exit</th>
              <th className="px-3 py-2">Realized P/L</th>
              <th className="px-3 py-2">Risk policy</th>
            </tr>
          </thead>
          <tbody>
            {closedPositions.map((p) => (
              <tr key={p.id} className="tabular border-t align-top" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-3 py-2 font-semibold">
                  <Link href={`/stock/${p.ticker_symbol}`} className="hover:underline">{p.ticker_symbol}</Link>
                  <OriginBadge origin={p.opened_by} ncsSignalId={p.ncs_signal_id} />
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{p.opened_by}{p.ncs_signal_id ? ` · NCS #${p.ncs_signal_id}` : ""}</td>
                <td className="px-3 py-2">{p.entry_confidence_pct != null ? `${p.entry_confidence_pct.toFixed(0)}%` : "—"}</td>
                <td className="px-3 py-2">{p.entry_risk_reward != null ? `${p.entry_risk_reward.toFixed(2)}R` : "—"}</td>
                <td className="px-3 py-2 text-xs">
                  <span style={{ color: "var(--status-critical)" }}>{p.planned_stop_loss != null ? `$${p.planned_stop_loss.toFixed(2)}` : "—"}</span>
                  {" / "}
                  <span style={{ color: "var(--status-good)" }}>{p.planned_take_profit != null ? `$${p.planned_take_profit.toFixed(2)}` : "—"}</span>
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <LocalTime iso={p.opened_at} options={{ style: "short" }} showAbbreviation={false} /> →{" "}
                  <LocalTime iso={p.closed_at} options={{ style: "short" }} showAbbreviation={false} fallback="—" />
                </td>
                <td className="px-3 py-2 font-semibold" style={{ color: (p.realized_pnl_dollars ?? 0) >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                  {p.realized_pnl_dollars != null ? `${p.realized_pnl_dollars >= 0 ? "+" : ""}$${p.realized_pnl_dollars.toFixed(2)}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{p.risk_policy_version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
