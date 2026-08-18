import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NcsSignal } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  currentNcs: vi.fn(),
  evaluateNcs: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { NcsPanel } from "./NcsPanel";

const SIGNAL: NcsSignal = {
  id: 1, ticker: "AAPL", timeframe: "1D", bar_ts: "2026-08-18T00:00:00Z", computed_at: "2026-08-18T00:05:00Z",
  raw_verdict: "STRONG_BUY", confirmed_verdict: "STRONG_BUY", fired: true,
  composite_score: 0.7, confidence_pct: 82, risk_score: 18,
  explanation: "Strong Buy — EMA9 > EMA21 > SMA50; RSI 71, MACD bullish. Risk score 18/100.",
  components: [
    { name: "trend_structure", score: 1.0, weight: 0.16, detail: "EMA9 > EMA21 > SMA50" },
    { name: "news_sentiment", score: 0.0, weight: 0.0, detail: "No live news signal available yet" },
  ],
  vetoed: false, veto_reason: null, version: "ncs-1.0.0", data_source: "alpaca", data_mode: "live",
};

describe("NcsPanel", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("shows 'no evaluation yet' before any signal exists", async () => {
    apiMock.currentNcs.mockResolvedValue({ raw_verdict: "NO_SIGNAL_YET", ticker: "AAPL" });
    render(<NcsPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText(/No NCS evaluation yet/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Evaluate now" })).toBeTruthy();
  });

  it("renders a fired, confirmed Strong Buy verdict with confidence, risk, and explanation", async () => {
    apiMock.currentNcs.mockResolvedValue(SIGNAL);
    render(<NcsPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText("Strong Buy")).toBeTruthy());
    expect(screen.getByText(/confidence 82%/)).toBeTruthy();
    expect(screen.getByText(/risk 18\/100/)).toBeTruthy();
    expect(screen.getByText(SIGNAL.explanation)).toBeTruthy();
    expect(screen.getByText("NEW")).toBeTruthy(); // fired=true
  });

  it("shows 'awaiting confirmation' when confirmed_verdict is null", async () => {
    apiMock.currentNcs.mockResolvedValue({ ...SIGNAL, confirmed_verdict: null, fired: false });
    render(<NcsPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText("Awaiting confirmation")).toBeTruthy());
    expect(screen.queryByText("NEW")).toBeNull();
  });

  it("displays a vetoed signal distinctly, with the reason on hover", async () => {
    apiMock.currentNcs.mockResolvedValue({ ...SIGNAL, vetoed: true, veto_reason: "correlated exposure too high", fired: false });
    render(<NcsPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText("VETOED")).toBeTruthy());
    expect(screen.getByText("VETOED").getAttribute("title")).toContain("correlated exposure too high");
  });

  it("never claims a chart signal is a paper order", async () => {
    apiMock.currentNcs.mockResolvedValue(SIGNAL);
    render(<NcsPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText(/never an automatic trade/)).toBeTruthy());
  });

  it("re-evaluating calls the evaluate endpoint and updates the panel", async () => {
    apiMock.currentNcs.mockResolvedValue(SIGNAL);
    apiMock.evaluateNcs.mockResolvedValue({ ...SIGNAL, confidence_pct: 91 });
    const user = userEvent.setup();
    render(<NcsPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Re-evaluate" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Re-evaluate" }));

    await waitFor(() => expect(apiMock.evaluateNcs).toHaveBeenCalledWith("AAPL", "1D"));
    await waitFor(() => expect(screen.getByText(/confidence 91%/)).toBeTruthy());
  });
});
