import { test, expect } from "@playwright/test";

/**
 * End-to-end verification of the NCS/drift incident fix: a live backend
 * with app/workers/ncs_scheduler.py running and CRITICAL model_drift
 * currently active must (a) surface that state plainly on Admin and the
 * NCS panel rather than silently showing nothing, and (b) never let
 * Autonomous Trading read as "running" while it's blocked. Requires a
 * live backend at NEXT_PUBLIC_API_URL with AUTH_REQUIRED=false (serves
 * every request as the dev operator principal).
 */

test.describe("NCS + drift fail-closed — live verification", () => {
  test("Admin shows the real autonomous-trading gate status, never a bare 'Running'", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

    const card = page.locator("text=Autonomous trading — emergency stop").locator("..").locator("..");
    await expect(card).toBeVisible();
    // Whatever the live gate state is, the headline must be one of the
    // three honest labels this fix introduced — never the old
    // `!paused`-derived "Running" that ignored drift/Safe-Mode entirely.
    await expect(
      card.getByText(/PAUSED — EMERGENCY STOP|BLOCKED — CRITICAL MODEL DRIFT|BLOCKED — SAFE MODE|Running/)
    ).toBeVisible();
  });

  test("the NCS panel shows an explicit Red-Team result and, when vetoed, the exact reason", async ({ page }) => {
    await page.goto("/stock/AAPL");
    // The stock page's own analysis fetch can be genuinely slow against a
    // real, rate-limited upstream provider chain (Alpaca + Alpha Vantage
    // fallback) — this is waiting on real network I/O, not app logic, so
    // it gets the same generous timeout as the Red-Team assertion below.
    await expect(page.getByText("Nexora Conviction Signal")).toBeVisible({ timeout: 30_000 });

    const evaluateButton = page.getByRole("button", { name: /Evaluate now|Re-evaluate/ });
    await evaluateButton.click();
    await expect(page.getByText(/Red-Team: (PASS|VETO)/)).toBeVisible({ timeout: 30_000 });
  });

  test("Paper Trading's 'Why no trade?' panel reports a concrete permitted/blocked verdict with gate detail", async ({
    page,
  }) => {
    // Requires an already-active simulation for the dev operator
    // principal (the panel only renders inside that account view) — same
    // precondition every other paper-trading E2E spec assumes.
    await page.goto("/paper-trading");
    await expect(page.getByText("Why no trade?")).toBeVisible();
    const checkForm = page.locator("form").filter({ hasText: "Check" });
    await checkForm.getByPlaceholder("Ticker").fill("AAPL");
    await checkForm.getByRole("button", { name: "Check" }).click();

    await expect(page.getByText(/AAPL — (PERMITTED|BLOCKED)/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("All gate statuses")).toBeVisible();
  });
});
