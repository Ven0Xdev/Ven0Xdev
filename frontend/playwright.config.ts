import { defineConfig, devices } from "@playwright/test";

/**
 * Formalizes the ad-hoc Playwright scripts this project has run by hand
 * from the scratchpad throughout every phase since Phase 5 (login, alert
 * firing, the Admin Safe Mode toggle, chart rendering, ...) into permanent,
 * repeatable specs under e2e/.
 *
 * Requires a real backend already running at NEXT_PUBLIC_API_URL (default
 * http://localhost:8000/api/v1) — these are full-stack flows, not
 * component tests, and this project has no synthetic-data fallback to
 * fake that with (see the standing "never substitute fake data" rule).
 * Not wired into CI yet: doing that honestly needs the backend + a seeded
 * DB running as CI services too, which is a real, separate infra decision
 * — see docs/IMPLEMENTATION_PROGRESS.md's Phase 12 entry.
 */
export default defineConfig({
  testDir: "./e2e",
  // All specs share ONE live backend and ONE dev-mode frontend (no
  // per-test isolation like the pytest suite's throwaway DB) — running
  // spec files concurrently strains the dev server's first-compile step
  // and can time out an unrelated navigation. One worker keeps this
  // deterministic; each spec file that touches shared state (e.g.
  // alerts.spec.ts's AAPL rules) still runs test.describe.configure({
  // mode: "serial" }) internally for the same reason.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
