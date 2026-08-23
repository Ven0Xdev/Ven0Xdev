import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaperOrderRecord, PaperPosition } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  shadowProgress: vi.fn(),
  decisionAudit: vi.fn(),
  cancelPaperOrder: vi.fn(),
}));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: apiMock };
});

import { PaperTradingTerminal } from "./PaperTradingTerminal";
import { computeAccountSummary } from "@/lib/paperTradingMath";
import type { PaperAccount } from "@/lib/types";

const ACCOUNT: PaperAccount = {
  id: 1, simulation_number: 1, label: null, cash_balance: 9_000, starting_balance: 10_000,
  is_active: true, archived_at: null, created_at: "2026-08-01T00:00:00Z", equity: 9_500,
  unrealized_pnl_dollars: -500, autonomous_trading_enabled: false,
};

const OPEN: PaperPosition = {
  id: 1, ticker_symbol: "MSFT", quantity: 5, avg_entry_price: 300, opened_at: "2026-08-01T00:00:00Z",
  closed_at: null, exit_price: null, status: "open", realized_pnl_dollars: null,
  entry_confidence_pct: 70, entry_risk_reward: 2, planned_stop_loss: 280, planned_take_profit: 340,
  risk_policy_version: "v1", entry_data_source: "mock", entry_data_mode: "synthetic",
  current_price: 305, unrealized_pnl_dollars: 25, unrealized_pnl_pct: 1.6, opened_by: "manual", ncs_signal_id: null,
};

const PENDING_ORDER: PaperOrderRecord = {
  id: 9, ticker_symbol: "MSFT", side: "buy", order_type: "limit", quantity: 2, limit_price: 290, stop_price: null,
  bracket_take_profit: null, bracket_stop_loss: null, status: "pending", regular_hours_only: false,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z", filled_at: null, filled_price: null,
  rejected_reason: null, cancelled_reason: null, origin: "manual", position_id: null, oco_group_id: null,
  ncs_signal_id: null, data_source: "mock", data_mode: "synthetic",
};

function renderTerminal() {
  const summary = computeAccountSummary(ACCOUNT, [OPEN], [], [PENDING_ORDER]);
  return render(
    <PaperTradingTerminal
      openPositions={[OPEN]}
      closedPositions={[]}
      orders={[PENDING_ORDER]}
      trades={[]}
      summary={summary}
      startingBalance={ACCOUNT.starting_balance}
      onClosePosition={() => {}}
      closingId={null}
      onRefreshOrders={() => {}}
    />,
  );
}

describe("PaperTradingTerminal", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("defaults to the Positions tab, showing real position data", () => {
    renderTerminal();
    expect(screen.getByRole("tab", { name: "Positions", selected: true })).toBeTruthy();
    expect(screen.getByText("MSFT")).toBeTruthy();
    expect(screen.getByText("LONG")).toBeTruthy();
  });

  it("switches to Open Orders and shows the pending limit order with a cancel control", async () => {
    const user = userEvent.setup();
    renderTerminal();

    await user.click(screen.getByRole("tab", { name: "Open Orders" }));
    expect(screen.getByText("limit")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("switches to Shadow Learning and renders the real progress panel, not a stub", async () => {
    apiMock.shadowProgress.mockResolvedValue({ timeframe: "1D", tickers: [] });
    const user = userEvent.setup();
    renderTerminal();

    await user.click(screen.getByRole("tab", { name: "Shadow Learning" }));
    await waitFor(() => expect(apiMock.shadowProgress).toHaveBeenCalled());
  });

  it("switches to Decision Audit, defaults the ticker to the first open position, and fetches its audit", async () => {
    apiMock.decisionAudit.mockResolvedValue({
      symbol: "MSFT", timeframe: "1D", current_drift_status: "stable",
      eligibility_progress: { candidate_signals: 0, open_observations: 0, closed_outcomes: 0, progress_pct: 0, win_rate_pct: null, eligible: false, blockers: [] },
      rows: [],
    });
    const user = userEvent.setup();
    renderTerminal();

    await user.click(screen.getByRole("tab", { name: "Decision Audit" }));
    await waitFor(() => expect(apiMock.decisionAudit).toHaveBeenCalledWith("MSFT", "1D"));
  });
});
