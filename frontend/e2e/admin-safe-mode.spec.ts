import { test, expect } from "@playwright/test";

/**
 * Formalizes the manual Safe Mode verification run by hand in Phase 11:
 * forcing Safe Mode on via the Admin UI must genuinely block a paper
 * trade (not just flip a visual switch), and clearing it must let trades
 * resume on their own risk-gate merit. Requires a live backend at
 * NEXT_PUBLIC_API_URL with AUTH_REQUIRED=false (the local dev default,
 * which serves every request as the dev operator principal — see
 * backend/app/api/deps.py's _get_or_create_dev_user).
 */

const API_BASE = "http://localhost:8000/api/v1";

test.describe("Admin — Safe Mode kill switch", () => {
  test.afterEach(async ({ request }) => {
    // However this test ends, never leave every other test on this shared
    // dev backend unable to trade.
    await request.post(`${API_BASE}/admin/safe-mode`, { data: { override: null } });
  });

  test("forcing Safe Mode on blocks a trade; clearing it restores normal risk-gate evaluation", async ({ page, request }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await expect(page.getByText("Inactive", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Force ON" }).click();
    // "ACTIVE" is a substring of "Inactive" (Playwright's default text
    // match is case-insensitive substring) — exact: true is required here,
    // not just style, or this assertion would pass even while still Inactive.
    await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();

    const blocked = await request.post(`${API_BASE}/paper-trading/positions`, {
      data: { ticker_symbol: "AXNT", quantity: 1 },
    });
    expect(blocked.status()).toBe(400);
    expect((await blocked.json()).detail).toContain("Safe Mode is active platform-wide");

    await page.getByRole("button", { name: "Clear override" }).click();
    await expect(page.getByText("Inactive", { exact: true })).toBeVisible();

    const afterClear = await request.post(`${API_BASE}/paper-trading/positions`, {
      data: { ticker_symbol: "AXNT", quantity: 1 },
    });
    // No longer blocked by Safe Mode specifically — whatever happens next
    // is that trade's own risk-gate merit, which is exactly the point:
    // the override must never leak into unrelated rejection reasons.
    if (!afterClear.ok()) {
      expect((await afterClear.json()).detail).not.toContain("Safe Mode");
    }
  });
});
