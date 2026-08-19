import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AutonomousTradingStatus, SafeModeStatus } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  safeMode: vi.fn(),
  autonomousTradingStatus: vi.fn(),
  setSafeMode: vi.fn(),
  setAutonomousTradingPaused: vi.fn(),
  me: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { PlatformStatusBar } from "./PlatformStatusBar";

const SAFE_MODE_OFF: SafeModeStatus = { override: null, env_default: false, effective: false, updated_at: null, updated_by_user_id: null };
const SAFE_MODE_ON: SafeModeStatus = { override: true, env_default: false, effective: true, updated_at: null, updated_by_user_id: null };
const AUTONOMOUS_RUNNING: AutonomousTradingStatus = {
  paused: false, updated_at: null, updated_by_user_id: null,
  drift_status: "stable", drift_blocking: false, safe_mode_active: false, operational: true,
};
const AUTONOMOUS_PAUSED: AutonomousTradingStatus = {
  paused: true, updated_at: null, updated_by_user_id: null,
  drift_status: "stable", drift_blocking: false, safe_mode_active: false, operational: false,
};
const AUTONOMOUS_DRIFT_BLOCKED: AutonomousTradingStatus = {
  paused: false, updated_at: null, updated_by_user_id: null,
  drift_status: "significant", drift_blocking: true, safe_mode_active: false, operational: false,
};

describe("PlatformStatusBar", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("shows the off/running state for a regular user, with no controls", async () => {
    apiMock.safeMode.mockResolvedValue(SAFE_MODE_OFF);
    apiMock.autonomousTradingStatus.mockResolvedValue(AUTONOMOUS_RUNNING);
    apiMock.me.mockResolvedValue({ id: 1, email: "u@example.com", role: "user", created_at: "" });

    render(<PlatformStatusBar refreshSignal={0} />);

    await waitFor(() => expect(screen.getByText(/Safe Mode off/)).toBeTruthy());
    expect(screen.getByText(/Autonomous trading running/)).toBeTruthy();
    expect(screen.queryByText("Emergency stop")).toBeNull();
  });

  it("shows ACTIVE/PAUSED state distinctly", async () => {
    apiMock.safeMode.mockResolvedValue(SAFE_MODE_ON);
    apiMock.autonomousTradingStatus.mockResolvedValue(AUTONOMOUS_PAUSED);
    apiMock.me.mockRejectedValue(new Error("401"));

    render(<PlatformStatusBar refreshSignal={0} />);

    await waitFor(() => expect(screen.getByText(/Safe Mode ACTIVE/)).toBeTruthy());
    expect(screen.getByText(/Autonomous trading PAUSED/)).toBeTruthy();
  });

  it("shows BLOCKED — CRITICAL MODEL DRIFT rather than 'running' when the emergency stop is off but drift is significant", async () => {
    // Regression guard: the label must never be derived from `!paused`
    // alone — Red-Team's drift veto blocks every autonomous entry
    // independently of the emergency-stop switch (see admin.py's
    // AutonomousTradingOut docstring).
    apiMock.safeMode.mockResolvedValue(SAFE_MODE_OFF);
    apiMock.autonomousTradingStatus.mockResolvedValue(AUTONOMOUS_DRIFT_BLOCKED);
    apiMock.me.mockResolvedValue({ id: 1, email: "u@example.com", role: "user", created_at: "" });

    render(<PlatformStatusBar refreshSignal={0} />);

    await waitFor(() => expect(screen.getByText(/BLOCKED — CRITICAL MODEL DRIFT/)).toBeTruthy());
    expect(screen.queryByText(/Autonomous trading running/)).toBeNull();
  });

  it("shows operator controls only for an operator, and toggling calls the right endpoint", async () => {
    apiMock.safeMode.mockResolvedValue(SAFE_MODE_OFF);
    apiMock.autonomousTradingStatus.mockResolvedValue(AUTONOMOUS_RUNNING);
    apiMock.me.mockResolvedValue({ id: 1, email: "op@example.com", role: "operator", created_at: "" });
    apiMock.setAutonomousTradingPaused.mockResolvedValue(AUTONOMOUS_PAUSED);
    const user = userEvent.setup();

    render(<PlatformStatusBar refreshSignal={0} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Emergency stop" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Emergency stop" }));

    await waitFor(() => expect(apiMock.setAutonomousTradingPaused).toHaveBeenCalledWith(true));
  });

  it("re-fetches when refreshSignal changes", async () => {
    apiMock.safeMode.mockResolvedValue(SAFE_MODE_OFF);
    apiMock.autonomousTradingStatus.mockResolvedValue(AUTONOMOUS_RUNNING);
    apiMock.me.mockResolvedValue({ id: 1, email: "u@example.com", role: "user", created_at: "" });

    const { rerender } = render(<PlatformStatusBar refreshSignal={0} />);
    await waitFor(() => expect(apiMock.safeMode).toHaveBeenCalledTimes(1));

    rerender(<PlatformStatusBar refreshSignal={1} />);
    await waitFor(() => expect(apiMock.safeMode).toHaveBeenCalledTimes(2));
  });

  it("renders nothing before either status has loaded", () => {
    apiMock.safeMode.mockReturnValue(new Promise(() => {}));
    apiMock.autonomousTradingStatus.mockReturnValue(new Promise(() => {}));
    apiMock.me.mockReturnValue(new Promise(() => {}));

    const { container } = render(<PlatformStatusBar refreshSignal={0} />);
    expect(container.textContent).toBe("");
  });
});
