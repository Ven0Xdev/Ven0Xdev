import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaperAccount, PaperSimulationSummary } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  paperAccount: vi.fn(),
  paperSimulations: vi.fn(),
  paperPositions: vi.fn(),
  startPaperSimulation: vi.fn(),
  openPaperPosition: vi.fn(),
  closePaperPosition: vi.fn(),
  setAutonomousTrading: vi.fn(),
}));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: apiMock };
});

import PaperTradingPage from "./page";

const ACCOUNT: PaperAccount = {
  id: 1, simulation_number: 1, label: null, cash_balance: 2_500, starting_balance: 2_500,
  is_active: true, archived_at: null, created_at: "2026-08-18T00:00:00Z", equity: 2_500, unrealized_pnl_dollars: 0,
  autonomous_trading_enabled: false,
};

const SIM_HISTORY: PaperSimulationSummary = {
  id: 1, simulation_number: 1, label: null, starting_balance: 2_500, is_active: true,
  created_at: "2026-08-18T00:00:00Z", archived_at: null, closed_trade_count: 0, realized_pnl_dollars: 0, win_rate_pct: null,
};

function mockLoad(overrides: { account?: PaperAccount | null; sims?: PaperSimulationSummary[] } = {}) {
  apiMock.paperAccount.mockResolvedValue(overrides.account === undefined ? null : overrides.account);
  apiMock.paperPositions.mockResolvedValue([]);
  apiMock.paperSimulations.mockResolvedValue(overrides.sims ?? []);
}

describe("PaperTradingPage — Start New Simulation", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("shows the first-simulation panel and no position tables when nothing has ever been started", async () => {
    mockLoad();
    render(<PaperTradingPage />);

    await waitFor(() => expect(screen.getByText("Start Your First Paper Simulation")).toBeTruthy());
    expect(screen.getByText(/No active paper simulation yet/)).toBeTruthy();
    expect(screen.queryByText("Open positions")).toBeNull();
  });

  it("has no hardcoded starting amount pre-filled — the input starts empty", async () => {
    mockLoad();
    render(<PaperTradingPage />);

    await waitFor(() => expect(screen.getByLabelText("Starting capital")).toBeTruthy());
    expect((screen.getByLabelText("Starting capital") as HTMLInputElement).value).toBe("");
  });

  it("quick-amount buttons fill the input with the exact amount", async () => {
    mockLoad();
    const user = userEvent.setup();
    render(<PaperTradingPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "$2,500.00" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "$2,500.00" }));

    expect((screen.getByLabelText("Starting capital") as HTMLInputElement).value).toBe("2500");
  });

  it("confirmation dialog shows the exact manually entered amount before starting", async () => {
    mockLoad();
    const user = userEvent.setup();
    render(<PaperTradingPage />);

    await waitFor(() => expect(screen.getByLabelText("Starting capital")).toBeTruthy());
    await user.type(screen.getByLabelText("Starting capital"), "13337");
    await user.click(screen.getByRole("button", { name: "Start New Paper Simulation" }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getAllByText(/\$13,337\.00/).length).toBeGreaterThan(0); // in the description and the confirm button
    expect(apiMock.startPaperSimulation).not.toHaveBeenCalled(); // not yet confirmed
  });

  it("confirming starts the simulation with the exact amount and reloads", async () => {
    mockLoad();
    apiMock.startPaperSimulation.mockResolvedValue(ACCOUNT);
    const user = userEvent.setup();
    render(<PaperTradingPage />);

    await waitFor(() => expect(screen.getByLabelText("Starting capital")).toBeTruthy());
    await user.type(screen.getByLabelText("Starting capital"), "2500");
    await user.click(screen.getByRole("button", { name: "Start New Paper Simulation" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Start with $2,500.00" }));

    await waitFor(() => expect(apiMock.startPaperSimulation).toHaveBeenCalledWith(2500));
    await waitFor(() => expect(apiMock.paperAccount).toHaveBeenCalledTimes(2)); // initial load + reload after start
  });

  it("rejects a non-numeric or non-positive amount client-side before any dialog appears", async () => {
    mockLoad();
    const user = userEvent.setup();
    render(<PaperTradingPage />);

    await waitFor(() => expect(screen.getByLabelText("Starting capital")).toBeTruthy());
    await user.type(screen.getByLabelText("Starting capital"), "-50");

    expect(screen.getByText("Enter a valid positive dollar amount.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Start New Paper Simulation" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("surfaces a server-side validation rejection (e.g. open positions must close first)", async () => {
    mockLoad({ account: ACCOUNT, sims: [SIM_HISTORY] });
    const { ApiError } = await import("@/lib/api");
    apiMock.startPaperSimulation.mockRejectedValue(
      new ApiError("request_failed", 400, "Close all open paper positions before starting a new one.", "/paper-trading/simulations")
    );
    const user = userEvent.setup();
    render(<PaperTradingPage />);

    await waitFor(() => expect(screen.getByText("Start New Simulation")).toBeTruthy());
    await user.type(screen.getByLabelText("Starting capital"), "5000");
    await user.click(screen.getByRole("button", { name: "Start New Paper Simulation" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Start with $5,000.00" }));

    await waitFor(() => expect(screen.getByText(/Close all open paper positions/)).toBeTruthy());
  });

  it("existing simulation UI (cash balance, equity, positions) still renders once a simulation is active", async () => {
    mockLoad({ account: ACCOUNT, sims: [SIM_HISTORY] });
    render(<PaperTradingPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Open positions" })).toBeTruthy());
    expect(screen.getAllByText(/\$2,500\.00/).length).toBeGreaterThan(0);
  });

  it("renders simulation history with archived and active rows, never dropping past runs", async () => {
    const archived: PaperSimulationSummary = {
      ...SIM_HISTORY, id: 2, simulation_number: 1, is_active: false,
      archived_at: "2026-08-10T00:00:00Z", closed_trade_count: 4, realized_pnl_dollars: 120.5, win_rate_pct: 75,
    };
    const active: PaperSimulationSummary = {
      ...SIM_HISTORY, id: 3, simulation_number: 2, starting_balance: 5000, is_active: true,
    };
    mockLoad({ account: { ...ACCOUNT, id: 3, simulation_number: 2, starting_balance: 5000 }, sims: [active, archived] });
    render(<PaperTradingPage />);

    await waitFor(() => expect(screen.getByText("Paper Simulations History")).toBeTruthy());
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
  });
});
