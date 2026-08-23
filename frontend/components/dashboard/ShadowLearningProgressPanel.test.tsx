import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ShadowProgressResponse } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  shadowProgress: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { ShadowLearningProgressPanel } from "./ShadowLearningProgressPanel";

const RESPONSE: ShadowProgressResponse = {
  timeframe: "1D",
  tickers: [
    {
      ticker: "AAPL", timeframe: "1D", ncs_version: "ncs-1.0.0",
      candidate_signals: 0, open_observations: 0, closed_outcomes: 0, progress_pct: 0,
      win_rate_pct: null, last_evaluation: null, eligible: false,
      blockers: ["No NCS evaluation has run yet for this ticker/timeframe."],
    },
    {
      ticker: "NVDA", timeframe: "1D", ncs_version: "ncs-1.0.0",
      candidate_signals: 3, open_observations: 2, closed_outcomes: 1, progress_pct: 5.0,
      win_rate_pct: 100.0, last_evaluation: "2026-08-19T07:47:12Z", eligible: false,
      blockers: ["Only 1/20 closed observations (2 still open, incomplete holding period)."],
    },
  ],
};

describe("ShadowLearningProgressPanel", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("shows a per-ticker breakdown with candidate/open/closed counts and exact blockers", async () => {
    apiMock.shadowProgress.mockResolvedValue(RESPONSE);
    render(<ShadowLearningProgressPanel />);

    await waitFor(() => expect(screen.getByText("AAPL")).toBeTruthy());
    expect(screen.getByText("NVDA")).toBeTruthy();
    expect(screen.getByText(/No NCS evaluation has run yet/)).toBeTruthy();
    expect(screen.getByText(/Only 1\/20 closed observations/)).toBeTruthy();
    expect(screen.getByText(/0\/2 tickers eligible/)).toBeTruthy();
  });

  it("never claims this is the paper trading engine", async () => {
    apiMock.shadowProgress.mockResolvedValue(RESPONSE);
    render(<ShadowLearningProgressPanel />);

    await waitFor(() => expect(screen.getByText(/never the paper trading engine/)).toBeTruthy());
  });
});
