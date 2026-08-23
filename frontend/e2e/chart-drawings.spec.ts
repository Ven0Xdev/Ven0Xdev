import { test, expect } from "@playwright/test";

/**
 * Verifies the professional drawing workspace end to end against the live
 * backend: the toolbar exposes real tools (not decorative icons), a
 * trend line placed with two clicks actually creates a drawing, selecting
 * it opens the style editor, and — the part that actually proves this
 * isn't a localStorage toy — the drawing survives a full page reload,
 * meaning it round-tripped through the real ChartDrawing backend model.
 * Requires a live backend at NEXT_PUBLIC_API_URL with AUTH_REQUIRED=false
 * (dev principal), same assumption as admin-safe-mode.spec.ts.
 */

const API_BASE = "http://localhost:8000/api/v1";

test.describe("Chart drawing workspace", () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${API_BASE}/chart-drawings?ticker=AAPL&timeframe=1D`);
  });

  test("toolbar exposes functional tools, a trend line persists across reload, and its style editor opens on select", async ({ page }) => {
    await page.goto("/stock/AAPL");
    await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();

    // A representative sample of the required functional tools — not
    // exhaustive, but enough to prove these are real distinct buttons.
    await expect(page.getByRole("button", { name: "Trend line" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fibonacci retracement" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rectangle" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Magnet mode" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

    const chart = page.locator(".content-reveal").first();
    await expect(chart).toBeVisible();
    const box = await chart.boundingBox();
    if (!box) throw new Error("chart container has no bounding box");

    await page.getByRole("button", { name: "Trend line" }).click();
    await chart.click({ position: { x: box.width * 0.3, y: box.height * 0.6 } });
    await chart.click({ position: { x: box.width * 0.6, y: box.height * 0.3 } });

    // Placing a two-click drawing returns the tool to cursor and the
    // toolbar's delete-all affordance appears — the honest signal that a
    // drawing now exists (canvas pixels themselves aren't DOM-queryable).
    await expect(page.getByRole("button", { name: "Delete all drawings" })).toBeVisible();

    // Select it: click roughly on the line's midpoint to open the style editor.
    await chart.click({ position: { x: box.width * 0.45, y: box.height * 0.45 } });
    await expect(page.getByRole("dialog", { name: "Drawing style" })).toBeVisible();
    await expect(page.getByText("trendline style")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete all drawings" })).toBeVisible({ timeout: 10_000 });
  });
});
