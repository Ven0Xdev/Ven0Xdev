/**
 * API contract tests — do the `api.*` bindings in lib/api.ts actually send
 * what the backend endpoints expect, and correctly parse what they return?
 * A mismatch here (wrong path, wrong method, wrong body shape) is exactly
 * the class of bug that eleven phases of manually re-verifying every new
 * endpoint against a live backend was catching by hand — this makes that
 * check permanent and fast instead of a one-off Playwright script per phase.
 *
 * `global.fetch` is mocked directly rather than an HTTP layer (msw etc.) —
 * these are unit-level contract tests for the request-building/response-
 * parsing logic itself, not a substitute for the real backend integration
 * these bindings are exercised against live throughout this project's phases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("api.me() calls GET /auth/me and returns the parsed user", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 1, email: "op@example.com", role: "operator", created_at: "2026-01-01T00:00:00Z" }));

    const user = await api.me();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/v1/auth/me");
    expect(init?.method).toBeUndefined(); // no method set -> browser default GET
    expect(user).toEqual({ id: 1, email: "op@example.com", role: "operator", created_at: "2026-01-01T00:00:00Z" });
  });

  it("api.createAlertRule() POSTs the exact payload as JSON to /alerts/rules", async () => {
    const rule = { id: 5, ticker_symbol: "AAPL", condition_type: "price", comparison: "above", threshold_value: 200, target_status: null, is_active: true, created_at: "x", last_fired_at: null };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(rule));

    const payload = { ticker_symbol: "AAPL", condition_type: "price" as const, comparison: "above" as const, threshold_value: 200 };
    const result = await api.createAlertRule(payload);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/v1/alerts/rules");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual(payload);
    expect(result).toEqual(rule);
  });

  it("api.setSafeMode() POSTs {override} and returns the updated status", async () => {
    const status = { override: true, env_default: false, effective: true, updated_at: "2026-01-01T00:00:00Z", updated_by_user_id: 1 };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

    const result = await api.setSafeMode(true);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/v1/admin/safe-mode");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ override: true });
    expect(result).toEqual(status);
  });

  it("api.setAlertRuleActive() PATCHes the rule id with is_active as a query param", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 3, is_active: false }));

    await api.setAlertRuleActive(3, false);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/v1/alerts/rules/3?is_active=false");
    expect(init?.method).toBe("PATCH");
  });

  it("attaches a Bearer token from storage, and never sends one when logged out", async () => {
    vi.mocked(fetch).mockImplementation(async () => jsonResponse([]));

    await api.watchlist();
    let headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();

    window.localStorage.setItem("nexora-access-token", "test-token-123");
    await api.watchlist();
    headers = vi.mocked(fetch).mock.calls[1][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token-123");
  });

  it("a structured provider_unavailable 503 throws an ApiError classified correctly, not a generic failure", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ detail: { code: "provider_unavailable", provider: "finnhub", message: "HTTP 302", market_data_available: false } }, 503)
    );

    await expect(api.analysis("AAPL")).rejects.toMatchObject({ code: "provider_unavailable" satisfies ApiError["code"] });
  });

  it("a network-level failure (backend down) is classified as backend_unreachable, never silently swallowed", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(api.me()).rejects.toMatchObject({ code: "backend_unreachable" });
  });
});
