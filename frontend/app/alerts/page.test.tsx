import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AlertEvent, AlertRule } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  alertRules: vi.fn(),
  alertEvents: vi.fn(),
  createAlertRule: vi.fn(),
  setAlertRuleActive: vi.fn(),
  deleteAlertRule: vi.fn(),
  acknowledgeAlertEvent: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import AlertsPage from "./page";

const RULE: AlertRule = {
  id: 1, ticker_symbol: "AAPL", condition_type: "price", comparison: "above",
  threshold_value: 200, target_status: null, is_active: true, created_at: "2026-01-01T00:00:00Z", last_fired_at: null,
};
const EVENT: AlertEvent = {
  id: 1, rule_id: 1, ticker_symbol: "AAPL", fired_at: "2026-01-01T00:00:00Z",
  message: "AAPL: price is above 200 (observed 205.5)", observed_value: 205.5, observed_status: null, acknowledged: false,
};

describe("AlertsPage", () => {
  afterEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it("renders an existing rule's condition and a fired event's message", async () => {
    apiMock.alertRules.mockResolvedValue([RULE]);
    apiMock.alertEvents.mockResolvedValue([EVENT]);
    render(<AlertsPage />);

    await waitFor(() => expect(screen.getByText("Price goes above 200")).toBeTruthy());
    expect(screen.getByText(/observed 205.5/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("shows the empty states honestly when nothing exists yet, never fabricated content", async () => {
    apiMock.alertRules.mockResolvedValue([]);
    apiMock.alertEvents.mockResolvedValue([]);
    render(<AlertsPage />);

    await waitFor(() => expect(screen.getByText("No alert rules yet.")).toBeTruthy());
    expect(screen.getByText("No alerts have fired yet.")).toBeTruthy();
  });

  it("clicking Dismiss acknowledges the event and reloads the list", async () => {
    apiMock.alertRules.mockResolvedValue([RULE]);
    apiMock.alertEvents.mockResolvedValue([EVENT]);
    apiMock.acknowledgeAlertEvent.mockResolvedValue({ ...EVENT, acknowledged: true });
    const user = userEvent.setup();
    render(<AlertsPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(apiMock.acknowledgeAlertEvent).toHaveBeenCalledWith(1));
    // Reload after the mutation — the honest-status contract for every
    // action on this page (never show a stale rule/event list after a write).
    expect(apiMock.alertEvents).toHaveBeenCalledTimes(2);
  });

  it("submitting the create-rule form sends the typed ticker uppercased", async () => {
    apiMock.alertRules.mockResolvedValue([]);
    apiMock.alertEvents.mockResolvedValue([]);
    apiMock.createAlertRule.mockResolvedValue(RULE);
    const user = userEvent.setup();
    render(<AlertsPage />);

    await waitFor(() => expect(screen.getByPlaceholderText("e.g. AAPL")).toBeTruthy());
    await user.type(screen.getByPlaceholderText("e.g. AAPL"), "aapl");
    await user.type(screen.getByRole("spinbutton"), "200");
    await user.click(screen.getByRole("button", { name: "Create alert" }));

    await waitFor(() =>
      expect(apiMock.createAlertRule).toHaveBeenCalledWith(
        expect.objectContaining({ ticker_symbol: "AAPL", condition_type: "price", comparison: "above", threshold_value: 200 })
      )
    );
  });

  it("surfaces a create-rule server rejection inline instead of failing silently", async () => {
    apiMock.alertRules.mockResolvedValue([]);
    apiMock.alertEvents.mockResolvedValue([]);
    apiMock.createAlertRule.mockRejectedValue(new Error("AXNT is not in the tracked asset universe"));
    const user = userEvent.setup();
    render(<AlertsPage />);

    await waitFor(() => expect(screen.getByPlaceholderText("e.g. AAPL")).toBeTruthy());
    await user.type(screen.getByPlaceholderText("e.g. AAPL"), "AXNT");
    await user.type(screen.getByRole("spinbutton"), "5");
    await user.click(screen.getByRole("button", { name: "Create alert" }));

    await waitFor(() => expect(screen.getByText(/not in the tracked asset universe/)).toBeTruthy());
  });
});
