import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ShadowStats } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  shadowStats: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { ShadowTrackRecordPanel } from "./ShadowTrackRecordPanel";

describe("ShadowTrackRecordPanel", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("shows an honest empty state with no closed signals yet", async () => {
    const stats: ShadowStats = {
      count_closed: 0, count_open: 2, win_rate_pct: null, avg_pnl_pct: null, avg_mfe_pct: null, avg_mae_pct: null,
    };
    apiMock.shadowStats.mockResolvedValue(stats);
    render(<ShadowTrackRecordPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText(/No closed shadow signals yet for AAPL/)).toBeTruthy());
    expect(screen.getByText(/2 open, still being tracked/)).toBeTruthy();
  });

  it("renders win rate and average return once signals have closed", async () => {
    const stats: ShadowStats = {
      count_closed: 10, count_open: 1, win_rate_pct: 60, avg_pnl_pct: 0.021, avg_mfe_pct: 0.05, avg_mae_pct: -0.015,
    };
    apiMock.shadowStats.mockResolvedValue(stats);
    render(<ShadowTrackRecordPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText("60%")).toBeTruthy());
    expect(screen.getByText("2.10%")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("never claims to be the paper trading engine", async () => {
    apiMock.shadowStats.mockResolvedValue({
      count_closed: 0, count_open: 0, win_rate_pct: null, avg_pnl_pct: null, avg_mfe_pct: null, avg_mae_pct: null,
    });
    render(<ShadowTrackRecordPanel symbol="AAPL" />);

    await waitFor(() => expect(screen.getByText(/hypothetical, passive readout/)).toBeTruthy());
    expect(screen.queryByText(/NEXORA INTERNAL PAPER/)).toBeNull();
  });
});
