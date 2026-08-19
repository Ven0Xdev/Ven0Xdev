import { describe, expect, it } from "vitest";
import { buildEquityCurve, computeAccountSummary } from "./paperTradingMath";
import type { PaperAccount, PaperOrderRecord, PaperPosition } from "./types";

function account(overrides: Partial<PaperAccount> = {}): PaperAccount {
  return {
    id: 1, simulation_number: 1, label: null, cash_balance: 8_000, starting_balance: 10_000,
    is_active: true, archived_at: null, created_at: "2026-08-01T00:00:00Z",
    equity: 9_500, unrealized_pnl_dollars: -500, autonomous_trading_enabled: false,
    ...overrides,
  };
}

function position(overrides: Partial<PaperPosition> = {}): PaperPosition {
  return {
    id: 1, ticker_symbol: "AAPL", quantity: 10, avg_entry_price: 100, opened_at: "2026-08-01T00:00:00Z",
    closed_at: null, exit_price: null, status: "open", realized_pnl_dollars: null,
    entry_confidence_pct: null, entry_risk_reward: null, planned_stop_loss: null, planned_take_profit: null,
    risk_policy_version: "v1", entry_data_source: "mock", entry_data_mode: "synthetic",
    current_price: null, unrealized_pnl_dollars: null, unrealized_pnl_pct: null,
    opened_by: "manual", ncs_signal_id: null,
    ...overrides,
  };
}

function order(overrides: Partial<PaperOrderRecord> = {}): PaperOrderRecord {
  return {
    id: 1, ticker_symbol: "AAPL", side: "buy", order_type: "limit", quantity: 5,
    limit_price: 90, stop_price: null, bracket_take_profit: null, bracket_stop_loss: null,
    status: "pending", regular_hours_only: false, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
    filled_at: null, filled_price: null, rejected_reason: null, cancelled_reason: null,
    origin: "manual", position_id: null, oco_group_id: null, ncs_signal_id: null,
    data_source: "mock", data_mode: "synthetic",
    ...overrides,
  };
}

describe("buildEquityCurve", () => {
  it("starts at the starting balance and applies each closed trade's realized P/L in chronological order", () => {
    const closed = [
      position({ id: 2, status: "closed", closed_at: "2026-08-03T00:00:00Z", realized_pnl_dollars: -200 }),
      position({ id: 1, status: "closed", closed_at: "2026-08-02T00:00:00Z", realized_pnl_dollars: 500 }),
    ];
    const { curve } = buildEquityCurve(10_000, closed);
    expect(curve).toEqual([10_000, 10_500, 10_300]);
  });

  it("computes max drawdown from the real peak-to-trough of that series, never a smoothed approximation", () => {
    const closed = [
      position({ id: 1, status: "closed", closed_at: "2026-08-01T00:00:00Z", realized_pnl_dollars: 1_000 }), // 10000 -> 11000
      position({ id: 2, status: "closed", closed_at: "2026-08-02T00:00:00Z", realized_pnl_dollars: -2_200 }), // -> 8800
      position({ id: 3, status: "closed", closed_at: "2026-08-03T00:00:00Z", realized_pnl_dollars: 500 }), // -> 9300
    ];
    const { maxDrawdownPct } = buildEquityCurve(10_000, closed);
    // peak 11000 -> trough 8800 = 2200/11000 = 20%
    expect(maxDrawdownPct).toBeCloseTo(20, 5);
  });

  it("returns just the starting balance with zero drawdown when nothing has closed yet", () => {
    const { curve, maxDrawdownPct } = buildEquityCurve(5_000, []);
    expect(curve).toEqual([5_000]);
    expect(maxDrawdownPct).toBe(0);
  });
});

describe("computeAccountSummary", () => {
  it("sums realized P/L only from closed positions and unrealized only from open ones", () => {
    const open = [position({ id: 1, unrealized_pnl_dollars: -300 }), position({ id: 2, unrealized_pnl_dollars: 150 })];
    const closed = [position({ id: 3, status: "closed", closed_at: "2026-08-01T00:00:00Z", realized_pnl_dollars: 400 })];
    const summary = computeAccountSummary(account(), open, closed, []);
    expect(summary.unrealizedPnlDollars).toBe(-150);
    expect(summary.realizedPnlDollars).toBe(400);
  });

  it("reports buying power as plain cash — no margin fabricated", () => {
    const summary = computeAccountSummary(account({ cash_balance: 7_777 }), [], [], []);
    expect(summary.buyingPower).toBe(7_777);
  });

  it("computes capital committed from real open-position notional and open-order value only from pending/accepted orders", () => {
    const open = [position({ id: 1, avg_entry_price: 50, quantity: 4 })]; // 200
    const orders = [
      order({ id: 1, status: "pending", limit_price: 20, quantity: 3 }), // 60
      order({ id: 2, status: "filled", limit_price: 999, quantity: 999 }), // excluded — not open
      order({ id: 3, status: "accepted", stop_price: 10, limit_price: null, quantity: 2 }), // 20
    ];
    const summary = computeAccountSummary(account(), open, [], orders);
    expect(summary.capitalCommittedDollars).toBe(200);
    expect(summary.openOrderValueDollars).toBe(80);
  });

  it("computes total return from real equity vs. starting balance", () => {
    const summary = computeAccountSummary(account({ starting_balance: 10_000, equity: 11_000 }), [], [], []);
    expect(summary.totalReturnPct).toBeCloseTo(10, 5);
  });
});
