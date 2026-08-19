import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { DecisionAuditResponse } from "@/lib/types";

const apiMock = vi.hoisted(() => ({ decisionAudit: vi.fn() }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: apiMock };
});

import { DecisionAuditPanel } from "./DecisionAuditPanel";

const BASE_RESPONSE: DecisionAuditResponse = {
  symbol: "AAPL", timeframe: "1D", current_drift_status: "stable",
  eligibility_progress: {
    candidate_signals: 5, open_observations: 1, closed_outcomes: 4, progress_pct: 20,
    win_rate_pct: 75, eligible: false, blockers: ["Only 4/20 closed observations."],
  },
  rows: [
    {
      id: 1, ticker: "AAPL", timeframe: "1D", bar_ts: "2026-08-19T14:00:00Z", evaluated_at: "2026-08-19T14:00:01Z",
      raw_verdict: "BUY", confirmed_verdict: "BUY", state: "fired", fired: true, confidence_pct: 82, composite_score: 0.6,
      risk_score: 20, version: "ncs-1.0.0", data_source: "mock", data_mode: "synthetic", components: [],
      vetoed: false, veto_reason: null, shadow_status: "OPEN", shadow_maturity_bar_ts: null, shadow_pnl_pct: null,
      shadow_exit_reason: null, paper_position_id: null, paper_order_id: null,
    },
    {
      id: 2, ticker: "AAPL", timeframe: "1D", bar_ts: "2026-08-19T15:00:00Z", evaluated_at: "2026-08-19T15:00:01Z",
      raw_verdict: "BUY", confirmed_verdict: "BUY", state: "vetoed", fired: false, confidence_pct: 55, composite_score: 0.3,
      risk_score: 70, version: "ncs-1.0.0", data_source: "mock", data_mode: "synthetic", components: [],
      vetoed: true, veto_reason: "Drift status is 'significant'.", shadow_status: null, shadow_maturity_bar_ts: null,
      shadow_pnl_pct: null, shadow_exit_reason: null, paper_position_id: null, paper_order_id: null,
    },
  ],
};

describe("DecisionAuditPanel", () => {
  afterEach(() => {
    apiMock.decisionAudit.mockReset();
  });

  it("renders a fired row as BUY and a vetoed row honestly labeled VETOED, never Buy/Sell", async () => {
    apiMock.decisionAudit.mockResolvedValue(BASE_RESPONSE);
    render(<DecisionAuditPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getAllByText("BUY").length).toBeGreaterThan(0));
    expect(screen.getAllByText("VETOED").length).toBeGreaterThan(0);
    expect(screen.getByText(/Drift status is 'significant'/)).toBeTruthy();
  });

  it("shows the current platform-wide drift status and shadow eligibility progress", async () => {
    apiMock.decisionAudit.mockResolvedValue(BASE_RESPONSE);
    render(<DecisionAuditPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText(/drift: stable/)).toBeTruthy());
    expect(screen.getByText(/20%/)).toBeTruthy();
    expect(screen.getByText(/Only 4\/20 closed observations/)).toBeTruthy();
  });

  it("shows an honest empty state instead of fabricating rows when nothing has evaluated yet", async () => {
    apiMock.decisionAudit.mockResolvedValue({ ...BASE_RESPONSE, rows: [] });
    render(<DecisionAuditPanel symbol="ZZZZ" />);

    await waitFor(() => expect(screen.getByText(/No NCS evaluations recorded yet for ZZZZ/)).toBeTruthy());
  });
});
