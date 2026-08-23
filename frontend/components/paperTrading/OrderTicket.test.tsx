import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaperAccount, PaperPosition, QuoteTicket } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  paperTicketQuote: vi.fn(),
  submitPaperOrder: vi.fn(),
}));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: apiMock };
});

import { OrderTicket } from "./OrderTicket";

const QUOTE: QuoteTicket = {
  symbol: "AAPL", last: 100, bid: 99.9, ask: 100.1, spread: 0.2,
  timestamp: "2026-08-19T14:00:00Z", data_source: "mock", data_mode: "synthetic",
};

const ACCOUNT: PaperAccount = {
  id: 1, simulation_number: 1, label: null, cash_balance: 10_000, starting_balance: 10_000,
  is_active: true, archived_at: null, created_at: "2026-08-01T00:00:00Z", equity: 10_000,
  unrealized_pnl_dollars: 0, autonomous_trading_enabled: false,
};

function position(overrides: Partial<PaperPosition> = {}): PaperPosition {
  return {
    id: 1, ticker_symbol: "AAPL", quantity: 10, avg_entry_price: 90, opened_at: "2026-08-01T00:00:00Z",
    closed_at: null, exit_price: null, status: "open", realized_pnl_dollars: null,
    entry_confidence_pct: null, entry_risk_reward: null, planned_stop_loss: null, planned_take_profit: null,
    risk_policy_version: "v1", entry_data_source: "mock", entry_data_mode: "synthetic",
    current_price: 100, unrealized_pnl_dollars: 100, unrealized_pnl_pct: 11,
    opened_by: "manual", ncs_signal_id: null,
    ...overrides,
  };
}

describe("OrderTicket", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("labels itself as internal paper trading and shows live bid/ask/spread", async () => {
    apiMock.paperTicketQuote.mockResolvedValue(QUOTE);
    render(<OrderTicket symbol="AAPL" account={ACCOUNT} openPositions={[]} onOrderPlaced={() => {}} />);

    expect(screen.getByText("PAPER TRADING — INTERNAL ONLY")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("$99.90")).toBeTruthy());
    expect(screen.getByText("$100.10")).toBeTruthy();
  });

  it("blocks a Sell with no matching open position — long-only, never a silent short", async () => {
    apiMock.paperTicketQuote.mockResolvedValue(QUOTE);
    const user = userEvent.setup();
    render(<OrderTicket symbol="AAPL" account={ACCOUNT} openPositions={[]} onOrderPlaced={() => {}} />);

    await user.click(screen.getByRole("button", { name: "sell" }));
    await user.type(screen.getByLabelText("Shares"), "5");

    expect(screen.getByText(/long-only; Sell can only reduce or close/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Review order" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requires an exact quantity match to close an existing long position", async () => {
    apiMock.paperTicketQuote.mockResolvedValue(QUOTE);
    const user = userEvent.setup();
    render(<OrderTicket symbol="AAPL" account={ACCOUNT} openPositions={[position({ quantity: 10 })]} onOrderPlaced={() => {}} />);

    await user.click(screen.getByRole("button", { name: "sell" }));
    const qtyInput = screen.getByLabelText("Shares");
    await user.type(qtyInput, "3");

    expect(screen.getByText(/closes a full position only — enter exactly 10 shares/)).toBeTruthy();
  });

  it("warns when a market buy's estimated value exceeds available cash", async () => {
    apiMock.paperTicketQuote.mockResolvedValue(QUOTE);
    const user = userEvent.setup();
    render(<OrderTicket symbol="AAPL" account={{ ...ACCOUNT, cash_balance: 50 }} openPositions={[]} onOrderPlaced={() => {}} />);

    const qtyInput = screen.getByLabelText("Shares");
    await user.type(qtyInput, "10"); // 10 * ask(100.1) = 1001 > 50 cash

    expect(screen.getByText(/exceeds available cash/)).toBeTruthy();
  });

  it("submits a valid market order with an idempotency key after review, and reports the placed order", async () => {
    apiMock.paperTicketQuote.mockResolvedValue(QUOTE);
    apiMock.submitPaperOrder.mockResolvedValue({ id: 42, status: "filled" });
    const onPlaced = vi.fn();
    const user = userEvent.setup();
    render(<OrderTicket symbol="AAPL" account={ACCOUNT} openPositions={[]} onOrderPlaced={onPlaced} />);

    const qtyInput = screen.getByLabelText("Shares");
    await user.type(qtyInput, "5");
    await user.click(screen.getByRole("button", { name: "Review order" }));
    await user.click(screen.getByRole("button", { name: "Submit Paper Order" }));

    await waitFor(() => expect(apiMock.submitPaperOrder).toHaveBeenCalled());
    const call = apiMock.submitPaperOrder.mock.calls[0][0];
    expect(call.ticker_symbol).toBe("AAPL");
    expect(call.side).toBe("buy");
    expect(call.order_type).toBe("market");
    expect(call.quantity).toBe(5);
    expect(typeof call.idempotency_key).toBe("string");
    expect(call.idempotency_key.length).toBeGreaterThan(0);
    expect(onPlaced).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Order #42 filled.")).toBeTruthy());
  });

  it("honestly reports a risk-gate rejection instead of claiming success — the order call still succeeded (HTTP 200), only the trade itself was refused", async () => {
    apiMock.paperTicketQuote.mockResolvedValue(QUOTE);
    apiMock.submitPaperOrder.mockResolvedValue({
      id: 7, status: "rejected", rejected_reason: "Position risk 1.65% of portfolio exceeds the 1.00% max risk per trade.",
    });
    const user = userEvent.setup();
    render(<OrderTicket symbol="AAPL" account={ACCOUNT} openPositions={[]} onOrderPlaced={() => {}} />);

    await user.type(screen.getByLabelText("Shares"), "5");
    await user.click(screen.getByRole("button", { name: "Review order" }));
    await user.click(screen.getByRole("button", { name: "Submit Paper Order" }));

    await waitFor(() => expect(screen.getByText(/Order #7 rejected: Position risk 1\.65%/)).toBeTruthy());
    expect(screen.queryByText(/Order #7 filled/)).toBeNull();
  });

  it("shows the honest DOM-unavailable message rather than fabricating an order book", async () => {
    apiMock.paperTicketQuote.mockResolvedValue(QUOTE);
    const user = userEvent.setup();
    render(<OrderTicket symbol="AAPL" account={ACCOUNT} openPositions={[]} onOrderPlaced={() => {}} />);

    await user.click(screen.getByRole("tab", { name: "DOM" }));
    expect(screen.getByText("Market depth unavailable on the current data plan")).toBeTruthy();
    // No fabricated order-book ladder — no table/grid of price levels rendered.
    expect(screen.queryByRole("table")).toBeNull();
  });
});
