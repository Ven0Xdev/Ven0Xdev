import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { BillingStatus, PlanCatalog } from "@/lib/types";

const apiMock = vi.hoisted(() => ({
  billingStatus: vi.fn(),
  planCatalog: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import BillingPage from "./page";

const STATUS: BillingStatus = {
  plan: "free",
  usage: { watchlist_items: 3, max_watchlist_items: 10, alert_rules: 2, max_alert_rules: 5 },
  billing_configured: false,
  billing_message: "Billing is not configured on this deployment. Plans are granted by an operator during this beta.",
};
const CATALOG: PlanCatalog = {
  plans: { free: { max_watchlist_items: 10, max_alert_rules: 5 }, pro: { max_watchlist_items: 200, max_alert_rules: 100 } },
};

describe("BillingPage", () => {
  afterEach(() => {
    apiMock.billingStatus.mockReset();
    apiMock.planCatalog.mockReset();
  });

  it("shows the current plan, real usage counts, and an honest not-configured message — never a fake checkout", async () => {
    apiMock.billingStatus.mockResolvedValue(STATUS);
    apiMock.planCatalog.mockResolvedValue(CATALOG);
    render(<BillingPage />);

    await waitFor(() => expect(screen.getByText("Billing is not yet available")).toBeTruthy());
    expect(screen.getByText("3 / 10")).toBeTruthy();
    expect(screen.getByText("2 / 5")).toBeTruthy();
    expect(screen.getByText(/Plans are granted by an operator/)).toBeTruthy();
    // No self-serve checkout control anywhere on the page.
    expect(screen.queryByRole("button", { name: /upgrade/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /subscribe/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /pay/i })).toBeNull();
  });

  it("lists every plan from the real catalog, including the one the user isn't on", async () => {
    apiMock.billingStatus.mockResolvedValue(STATUS);
    apiMock.planCatalog.mockResolvedValue(CATALOG);
    render(<BillingPage />);

    await waitFor(() => expect(screen.getByText("200 watchlist items")).toBeTruthy());
    expect(screen.getByText("100 alert rules")).toBeTruthy();
  });
});
