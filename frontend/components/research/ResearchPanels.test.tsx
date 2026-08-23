import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CanaryStatusResponse, ResearchCoverageResponse, ResearchModelSummary } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  researchCoverage: vi.fn(),
  researchModels: vi.fn(),
  canaryStatus: vi.fn(),
  enableCanary: vi.fn(),
  disableCanary: vi.fn(),
  clearCanaryAutoPause: vi.fn(),
}));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: apiMock };
});

import { CoveragePanel } from "./CoveragePanel";
import { ModelRegistryPanel } from "./ModelRegistryPanel";
import { CanaryPanel } from "./CanaryPanel";

const EMPTY_COVERAGE: ResearchCoverageResponse = {
  bars: [], fundamentals_rows_by_symbol: {}, news_rows_by_symbol: {}, corporate_actions_rows_by_symbol: {},
  news_honestly_unavailable: true, backfill_checkpoints: [], horizons: ["30m", "60m", "eod", "1d", "5d", "10d", "20d"],
};

const CANARY_DISABLED: CanaryStatusResponse = {
  enabled: false, auto_paused: false, auto_pause_reason: null,
  cash_balance: 10_000, starting_balance: 10_000, peak_equity: 10_000,
  positions_opened_today: 0, realized_pnl_today_dollars: 0, open_positions: [], recent_decisions: [],
};

describe("CoveragePanel", () => {
  afterEach(() => Object.values(apiMock).forEach((fn) => fn.mockReset()));

  it("honestly reports no data and unavailable news rather than fabricating coverage", async () => {
    apiMock.researchCoverage.mockResolvedValue(EMPTY_COVERAGE);
    render(<CoveragePanel />);

    await waitFor(() => expect(screen.getByText(/No historical bars ingested yet/)).toBeTruthy());
    expect(screen.getByText(/Not yet available — backfilling in the background/)).toBeTruthy();
  });

  it("labels an IEX feed as partial market coverage, never presented as full SIP", async () => {
    apiMock.researchCoverage.mockResolvedValue({
      ...EMPTY_COVERAGE,
      bars: [{
        ticker_symbol: "AAPL", timeframe: "30m", data_source: "alpaca", feed: "iex",
        coverage_start: "2024-01-01T00:00:00Z", coverage_end: "2024-06-01T00:00:00Z", row_count: 1000,
      }],
    });
    render(<CoveragePanel />);

    await waitFor(() => expect(screen.getByText("AAPL")).toBeTruthy());
    const badge = screen.getByTitle(/Partial market coverage/);
    expect(badge.textContent).toBe("IEX");
  });
});

describe("ModelRegistryPanel", () => {
  afterEach(() => Object.values(apiMock).forEach((fn) => fn.mockReset()));

  it("shows an honest empty state when nothing has ever been trained", async () => {
    apiMock.researchModels.mockResolvedValue([]);
    render(<ModelRegistryPanel />);
    await waitFor(() => expect(screen.getByText(/No research model has been trained yet/)).toBeTruthy());
  });

  it("renders a qualified model's state honestly", async () => {
    const model: ResearchModelSummary = {
      id: 1, family: "lightgbm", horizon: "1d", version: "v1", state: "HISTORICALLY_QUALIFIED",
      rejection_reason: null, trained_at: "2026-08-20T00:00:00Z", qualified_at: "2026-08-20T00:00:00Z", retired_at: null,
      dataset_summary: { horizon: "1d", n_samples: 500, n_symbols_with_data: 5, date_range: null, label_distribution: { BUY: 100, SELL: 90, NO_TRADE: 310 } },
    };
    apiMock.researchModels.mockResolvedValue([model]);
    render(<ModelRegistryPanel />);
    await waitFor(() => expect(screen.getByText("HISTORICALLY QUALIFIED")).toBeTruthy());
    expect(screen.getByText("lightgbm")).toBeTruthy();
  });
});

describe("CanaryPanel", () => {
  afterEach(() => Object.values(apiMock).forEach((fn) => fn.mockReset()));

  it("shows DISABLED by default and no operator controls for a non-operator", async () => {
    apiMock.canaryStatus.mockResolvedValue(CANARY_DISABLED);
    render(<CanaryPanel isOperator={false} />);
    await waitFor(() => expect(screen.getByText("DISABLED")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Enable Research Canary" })).toBeNull();
  });

  it("an operator sees an enable control that requires confirmation before calling the API", async () => {
    apiMock.canaryStatus.mockResolvedValue(CANARY_DISABLED);
    apiMock.enableCanary.mockResolvedValue({ enabled: true });
    const user = userEvent.setup();
    render(<CanaryPanel isOperator={true} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Enable Research Canary" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Enable Research Canary" }));
    expect(apiMock.enableCanary).not.toHaveBeenCalled(); // confirmation dialog first, never a one-click trade-enabling action

    await user.click(screen.getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(apiMock.enableCanary).toHaveBeenCalled());
  });

  it("shows an auto-pause banner and clear control when the account is auto-paused", async () => {
    apiMock.canaryStatus.mockResolvedValue({
      ...CANARY_DISABLED, enabled: true, auto_paused: true, auto_pause_reason: "Peak-to-trough drawdown 2.5% reached the 2.0% auto-pause threshold.",
    });
    render(<CanaryPanel isOperator={true} />);
    await waitFor(() => expect(screen.getByText("AUTO-PAUSED")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Clear auto-pause" })).toBeTruthy();
  });
});
