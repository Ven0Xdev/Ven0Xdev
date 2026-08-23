import { test, expect } from "@playwright/test";

/**
 * Formalizes the manual Phase 13 verification: a free-plan watchlist quota
 * is genuinely enforced (not a UI-only hint), and an operator changing a
 * user's plan via the Admin UI genuinely raises it — the only path to
 * "upgrade" during this beta, since no real payment provider is
 * configured (see services/billing/provider.py's NullBillingProvider).
 * Requires a live backend at NEXT_PUBLIC_API_URL with AUTH_REQUIRED=false
 * (the local dev default — every request resolves to the dev operator).
 */

const API_BASE = "http://localhost:8000/api/v1";
const FREE_LIMIT = 10; // app/core/entitlements.py PLAN_LIMITS["free"]["max_watchlist_items"]

test.describe("Billing — plan quota and operator-driven upgrade", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async ({ request }) => {
    // Reset the dev principal back to "free" so this spec is repeatable
    // and doesn't leave every other manual/E2E run against this shared
    // dev backend with an inflated quota.
    const users = await (await request.get(`${API_BASE}/admin/users`)).json();
    const dev = users.find((u: { email: string }) => u.email === "dev@local");
    if (dev) await request.patch(`${API_BASE}/admin/users/${dev.id}/plan`, { data: { plan: "free" } });
  });

  test("the free plan's watchlist quota is genuinely enforced, then lifted by an operator plan change", async ({ page, request }) => {
    // Fill the quota directly via API (faster and more deterministic than
    // clicking "Add" ten times through the UI for a setup step).
    for (let i = 0; i < FREE_LIMIT; i++) {
      const res = await request.post(`${API_BASE}/watchlist`, { data: { ticker_symbol: `ZE2E${i}` } });
      expect(res.ok()).toBeTruthy();
    }

    const blocked = await request.post(`${API_BASE}/watchlist`, { data: { ticker_symbol: "ZE2EOVER" } });
    expect(blocked.status()).toBe(402);
    expect((await blocked.json()).detail).toContain("upgrade your plan");

    await page.goto("/billing");
    await expect(page.getByText(`${FREE_LIMIT} / ${FREE_LIMIT}`)).toBeVisible();

    await page.goto("/admin");
    const devUserRow = page.locator("tr", { hasText: "dev@local" });
    const planSelect = devUserRow.getByRole("combobox");
    await planSelect.selectOption("pro");
    await expect(planSelect).toHaveValue("pro");

    const afterUpgrade = await request.post(`${API_BASE}/watchlist`, { data: { ticker_symbol: "ZE2EOVER" } });
    expect(afterUpgrade.ok()).toBeTruthy();

    // Cleanup: remove every symbol this test added.
    for (let i = 0; i < FREE_LIMIT; i++) {
      await request.delete(`${API_BASE}/watchlist/ZE2E${i}`);
    }
    await request.delete(`${API_BASE}/watchlist/ZE2EOVER`);
  });
});
