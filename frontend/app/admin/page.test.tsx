import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SafeModeStatus } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  me: vi.fn(),
  safeMode: vi.fn(),
  providerHealth: vi.fn(),
  platformHealth: vi.fn(),
  schemaStatus: vi.fn(),
  models: vi.fn(),
  assetUniverse: vi.fn(),
  adminUsers: vi.fn(),
  planCatalog: vi.fn(),
  setSafeMode: vi.fn(),
  setUserPlan: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import AdminPage from "./page";

const SAFE_MODE_OFF: SafeModeStatus = { override: null, env_default: false, effective: false, updated_at: null, updated_by_user_id: null };

function mockDashboardData() {
  apiMock.safeMode.mockResolvedValue(SAFE_MODE_OFF);
  apiMock.providerHealth.mockResolvedValue({
    provider: "mock", data_mode: "synthetic", ok: true, latency_ms: 1, sample_symbols: ["AAPL"], error: null, checked_at: "2026-01-01T00:00:00Z",
  });
  apiMock.platformHealth.mockResolvedValue({
    generated_at: "2026-01-01T00:00:00Z", drift: {}, prediction_accuracy: {}, provider: {}, scanner: {},
    api_latency: {}, database: { status: "healthy", ping_ms: 1 }, alerts: [],
  });
  apiMock.schemaStatus.mockResolvedValue({ ready: true, schema_managed_by: "create_all", detail: "ok" });
  apiMock.models.mockResolvedValue([]);
  apiMock.assetUniverse.mockResolvedValue([]);
  apiMock.adminUsers.mockResolvedValue([]);
  apiMock.planCatalog.mockResolvedValue({ plans: { free: { max_watchlist_items: 10, max_alert_rules: 5 }, pro: { max_watchlist_items: 200, max_alert_rules: 100 } } });
}

// Server enforcement (require_operator, see backend/app/api/deps.py) is the
// real security boundary — this only proves the client-side gate reflects
// whatever /auth/me reports, so a regular user isn't shown operator
// controls they'd immediately get a 403 from anyway.
describe("AdminPage — operator gate", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("shows an access-required message for a regular user, never the dashboard", async () => {
    apiMock.me.mockResolvedValue({ id: 2, email: "u@example.com", role: "user", created_at: "" });
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText(/does not have operator access/)).toBeTruthy());
    expect(screen.queryByText("Safe Mode — platform-wide kill switch")).toBeNull();
    expect(apiMock.safeMode).not.toHaveBeenCalled();
  });

  it("prompts sign-in when unauthenticated, never the dashboard", async () => {
    apiMock.me.mockRejectedValue(new Error("401"));
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText(/Sign in with an operator account/)).toBeTruthy());
    expect(apiMock.safeMode).not.toHaveBeenCalled();
  });

  it("renders the full dashboard for an operator", async () => {
    apiMock.me.mockResolvedValue({ id: 1, email: "op@example.com", role: "operator", created_at: "" });
    mockDashboardData();
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText("Safe Mode — platform-wide kill switch")).toBeTruthy());
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(screen.getByText("Market data provider")).toBeTruthy();
  });

  it("reflects Safe Mode ACTIVE when the backend reports an override in effect", async () => {
    apiMock.me.mockResolvedValue({ id: 1, email: "op@example.com", role: "operator", created_at: "" });
    mockDashboardData();
    apiMock.safeMode.mockResolvedValue({ override: true, env_default: false, effective: true, updated_at: "2026-01-01T00:00:00Z", updated_by_user_id: 1 });
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText("ACTIVE")).toBeTruthy());
  });

  it("lists users with their plan and lets an operator change it", async () => {
    apiMock.me.mockResolvedValue({ id: 1, email: "op@example.com", role: "operator", created_at: "" });
    mockDashboardData();
    apiMock.adminUsers.mockResolvedValue([
      { id: 7, email: "beta-tester@example.com", role: "user", plan: "free", is_active: true, created_at: "2026-01-01T00:00:00Z" },
    ]);
    apiMock.setUserPlan.mockResolvedValue({ id: 7, email: "beta-tester@example.com", role: "user", plan: "pro", is_active: true, created_at: "2026-01-01T00:00:00Z" });
    render(<AdminPage />);

    await waitFor(() => expect(screen.getByText("beta-tester@example.com")).toBeTruthy());
    const select = screen.getByDisplayValue("free");
    await userEvent.setup().selectOptions(select, "pro");

    await waitFor(() => expect(apiMock.setUserPlan).toHaveBeenCalledWith(7, "pro"));
  });
});
