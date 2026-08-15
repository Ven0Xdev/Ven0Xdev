import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ holds Playwright specs (test/expect from @playwright/test, a
    // different runner entirely) — must never be collected by Vitest.
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
