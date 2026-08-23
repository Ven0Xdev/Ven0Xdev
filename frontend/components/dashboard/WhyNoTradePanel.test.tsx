import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WhyNoTrade } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  whyNoTrade: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { WhyNoTradePanel } from "./WhyNoTradePanel";

const BLOCKED: WhyNoTrade = {
  ticker: "AAPL", timeframe: "1D", market_state: "after-hours", provider: "alpaca+edgar", data_mode: "live",
  data_freshness: "12s old", ncs_state: "NEUTRAL", ncs_fired: false, ncs_vetoed: false,
  red_team_result: "PASS", shadow_sample_size: 4, shadow_win_rate_pct: null, drift_status: "stable",
  risk_gate_passed: true, risk_gate_reasons: [],
  gates: [
    { name: "emergency_stop", passed: true, detail: "Emergency stop is not engaged." },
    { name: "account_opt_in", passed: true, detail: "Account has opted into autonomous trading." },
    { name: "ncs_signal", passed: false, detail: "No newly-fired, non-vetoed BUY/STRONG_BUY NCS signal right now (current state: NEUTRAL)." },
    { name: "shadow_track_record", passed: false, detail: "Shadow sample 4/20 closed, win rate 0%/55% required." },
  ],
  permitted: false,
  blockers: [
    "No newly-fired, non-vetoed BUY/STRONG_BUY NCS signal right now (current state: NEUTRAL).",
    "Shadow sample 4/20 closed, win rate 0%/55% required.",
  ],
};

const DRIFT_BLOCKED: WhyNoTrade = {
  ...BLOCKED,
  drift_status: "significant",
  red_team_result: "Drift status is 'significant' — model/feature distributions have shifted significantly.",
  gates: [...BLOCKED.gates, { name: "red_team", passed: false, detail: "Red-Team veto: Drift status is 'significant'." }],
  blockers: [...BLOCKED.blockers, "Red-Team veto: Drift status is 'significant'."],
};

describe("WhyNoTradePanel", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("checks a ticker and shows the blockers and gate statuses", async () => {
    apiMock.whyNoTrade.mockResolvedValue(BLOCKED);
    const user = userEvent.setup();
    render(<WhyNoTradePanel />);

    await user.type(screen.getByPlaceholderText("Ticker"), "aapl");
    await user.click(screen.getByRole("button", { name: "Check" }));

    await waitFor(() => expect(apiMock.whyNoTrade).toHaveBeenCalledWith("AAPL", "1D"));
    expect(await screen.findByText(/AAPL — BLOCKED/)).toBeTruthy();
    expect(screen.getByText(/No newly-fired, non-vetoed BUY\/STRONG_BUY/)).toBeTruthy();
    expect(screen.getByText(/Shadow sample 4\/20 closed/)).toBeTruthy();
    expect(screen.getByText(/NCS signal: blocked/)).toBeTruthy();
  });

  it("surfaces a critical-drift Red-Team veto as an exact blocker", async () => {
    apiMock.whyNoTrade.mockResolvedValue(DRIFT_BLOCKED);
    const user = userEvent.setup();
    render(<WhyNoTradePanel />);

    await user.type(screen.getByPlaceholderText("Ticker"), "AAPL");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText(/Red-Team veto: Drift status is 'significant'/)).toBeTruthy();
    expect(screen.getByText(/Red-Team: blocked/)).toBeTruthy();
  });

  it("shows PERMITTED distinctly when every gate clears", async () => {
    apiMock.whyNoTrade.mockResolvedValue({ ...BLOCKED, permitted: true, blockers: [], gates: BLOCKED.gates.map((g) => ({ ...g, passed: true })) });
    const user = userEvent.setup();
    render(<WhyNoTradePanel />);

    await user.type(screen.getByPlaceholderText("Ticker"), "AAPL");
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByText(/AAPL — PERMITTED/)).toBeTruthy();
    expect(screen.queryByText("Exact blockers")).toBeNull();
  });
});
