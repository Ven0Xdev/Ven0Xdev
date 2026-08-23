import { describe, expect, it } from "vitest";
import { ApiError, classifyApiError, classifyResponse } from "./api";

describe("classifyResponse", () => {
  it("classifies a structured provider-unavailable 503", () => {
    const body = JSON.stringify({
      detail: {
        code: "provider_unavailable",
        provider: "finnhub",
        message: "Finnhub /stock/symbol failed: HTTP 302",
        market_data_available: false,
      },
    });
    expect(classifyResponse(503, body)).toEqual({
      code: "provider_unavailable",
      detail: "Finnhub /stock/symbol failed: HTTP 302",
    });
  });

  it("classifies 401/403 as unauthorized", () => {
    expect(classifyResponse(401, JSON.stringify({ detail: "bad token" })).code).toBe("unauthorized");
    expect(classifyResponse(403, "forbidden").code).toBe("unauthorized");
  });

  it("classifies 429 as rate limited", () => {
    expect(classifyResponse(429, "").code).toBe("rate_limited");
  });

  it("classifies plain 5xx as backend error", () => {
    expect(classifyResponse(500, "Internal Server Error").code).toBe("backend_error");
  });

  it("classifies other non-2xx as request failed", () => {
    expect(classifyResponse(404, JSON.stringify({ detail: "not found" })).code).toBe("request_failed");
  });

  it("survives non-JSON bodies", () => {
    expect(classifyResponse(502, "<html>bad gateway</html>").code).toBe("backend_error");
  });
});

describe("classifyApiError", () => {
  it("distinguishes backend-unreachable from provider-unavailable", () => {
    const unreachable = classifyApiError(new ApiError("backend_unreachable", 0, "fetch failed", "/x"));
    expect(unreachable.title).toContain("Could not reach the backend");

    const provider = classifyApiError(new ApiError("provider_unavailable", 503, "HTTP 302", "/x"));
    expect(provider.title).toContain("Market data is currently unavailable");
    expect(provider.hint).toContain("backend is running");
  });

  it("treats unknown errors as unreachable (fetch threw before any response)", () => {
    expect(classifyApiError(new TypeError("NetworkError")).code).toBe("backend_unreachable");
  });

  it("labels backend 5xx distinctly", () => {
    expect(classifyApiError(new ApiError("backend_error", 500, "boom", "/x")).title).toContain("internal error");
  });
});
