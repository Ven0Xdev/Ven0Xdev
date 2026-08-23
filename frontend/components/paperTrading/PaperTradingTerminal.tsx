"use client";

import { useState } from "react";
import type { PaperOrderRecord, PaperPosition, PaperTradeRecord } from "@/lib/types";
import type { AccountSummary } from "@/lib/paperTradingMath";
import { ShadowLearningProgressPanel } from "@/components/dashboard/ShadowLearningProgressPanel";
import { DecisionAuditPanel } from "./DecisionAuditPanel";
import { PositionsTab, OpenOrdersTab, OrderHistoryTab, EquityHistoryTab, TradingJournalTab } from "./TerminalTabs";

type TabKey = "positions" | "orders" | "history" | "equity" | "journal" | "shadow" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "positions", label: "Positions" },
  { key: "orders", label: "Open Orders" },
  { key: "history", label: "Order History" },
  { key: "equity", label: "Balance/Equity History" },
  { key: "journal", label: "Trading Journal" },
  { key: "shadow", label: "Shadow Learning" },
  { key: "audit", label: "Decision Audit" },
];

/** Phase 2's seven-tab account terminal — every tab renders only real
 * persisted data (positions/orders/trades already loaded by the parent
 * page, or fetched by the panel itself for Shadow Learning/Decision
 * Audit, which already have their own live backends). */
export function PaperTradingTerminal({
  openPositions,
  closedPositions,
  orders,
  trades,
  summary,
  startingBalance,
  onClosePosition,
  closingId,
  onRefreshOrders,
}: {
  openPositions: PaperPosition[];
  closedPositions: PaperPosition[];
  orders: PaperOrderRecord[];
  trades: PaperTradeRecord[];
  summary: AccountSummary;
  startingBalance: number;
  onClosePosition: (id: number) => void;
  closingId: number | null;
  onRefreshOrders: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("positions");
  const [auditSymbol, setAuditSymbol] = useState(openPositions[0]?.ticker_symbol ?? "");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 border-b" role="tablist" aria-label="Paper trading account" style={{ borderColor: "var(--gridline)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="rounded-t-md px-3 py-2 text-xs font-semibold"
            style={{
              color: tab === t.key ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "positions" && <PositionsTab positions={openPositions} onClose={onClosePosition} closingId={closingId} />}
      {tab === "orders" && <OpenOrdersTab orders={orders} onRefresh={onRefreshOrders} />}
      {tab === "history" && <OrderHistoryTab orders={orders} trades={trades} />}
      {tab === "equity" && <EquityHistoryTab summary={summary} startingBalance={startingBalance} />}
      {tab === "journal" && <TradingJournalTab closedPositions={closedPositions} />}
      {tab === "shadow" && <ShadowLearningProgressPanel />}
      {tab === "audit" && (
        <div className="flex flex-col gap-3">
          <label className="flex w-fit items-center gap-2 text-xs">
            <span style={{ color: "var(--text-muted)" }}>Ticker</span>
            <input
              value={auditSymbol}
              onChange={(e) => setAuditSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              className="input w-28"
            />
          </label>
          {auditSymbol ? (
            <DecisionAuditPanel symbol={auditSymbol} />
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Enter a ticker to view its Decision Audit.</p>
          )}
        </div>
      )}
    </div>
  );
}
