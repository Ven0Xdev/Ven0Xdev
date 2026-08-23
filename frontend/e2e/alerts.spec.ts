import { test, expect } from "@playwright/test";

/**
 * Formalizes the manual alerts verification run by hand in Phase 10
 * (create a rule, confirm the tracked-universe validation, list/toggle/
 * delete it) into a permanent spec. Requires a live backend at
 * NEXT_PUBLIC_API_URL (default http://localhost:8000/api/v1) with
 * AUTH_REQUIRED=false (the local dev default) — see playwright.config.ts.
 */

const API_BASE = "http://localhost:8000/api/v1";

test.describe("Alerts", () => {
  // All three tests exercise AAPL rules against the same shared dev
  // backend (no per-test DB isolation like the pytest suite has) — serial
  // execution avoids two tests' AAPL rows colliding in the same table.
  test.describe.configure({ mode: "serial" });

  test("creating a rule on a tracked ticker succeeds and appears in the list", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();

    await page.getByPlaceholder("e.g. AAPL").fill("AAPL");
    await page.getByRole("combobox").first().selectOption("price");
    await page.getByRole("spinbutton").fill("0.01");
    await page.getByRole("button", { name: "Create alert" }).click();

    const row = page.locator("tr", { hasText: "AAPL" }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText("Price goes above 0.01")).toBeVisible();

    // Cleanup: leaving this rule around would affect any later run.
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("tr", { hasText: "AAPL" })).toHaveCount(0);
  });

  test("creating a rule on a ticker outside the tracked universe is refused with an inline reason", async ({ page }) => {
    await page.goto("/alerts");

    await page.getByPlaceholder("e.g. AAPL").fill("NOTREAL");
    await page.getByRole("spinbutton").fill("1");
    await page.getByRole("button", { name: "Create alert" }).click();

    await expect(page.getByText(/tracked asset universe/)).toBeVisible();
    // Refused server-side — must never silently appear as if it were accepted.
    await expect(page.locator("tr", { hasText: "NOTREAL" })).toHaveCount(0);
  });

  test("toggling a rule's active state persists through a reload", async ({ page, request }) => {
    const created = await request.post(`${API_BASE}/alerts/rules`, {
      data: { ticker_symbol: "AAPL", condition_type: "price", comparison: "above", threshold_value: 999999 },
    });
    expect(created.ok()).toBeTruthy();
    const rule = await created.json();

    try {
      await page.goto("/alerts");
      const row = page.locator("tr", { hasText: "AAPL" }).first();
      await row.getByRole("button", { name: "Enabled" }).click();
      await expect(row.getByRole("button", { name: "Disabled" })).toBeVisible();

      await page.reload();
      await expect(page.locator("tr", { hasText: "AAPL" }).first().getByRole("button", { name: "Disabled" })).toBeVisible();
    } finally {
      await request.delete(`${API_BASE}/alerts/rules/${rule.id}`);
    }
  });
});
