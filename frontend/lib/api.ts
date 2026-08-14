import type {
  AlertConditionType,
  AlertComparison,
  AlertEvent,
  AlertRule,
  BacktestResult,
  CalibrationReport,
  CandlesResponse,
  DashboardSummary,
  Deliberation,
  IndicatorSeriesResponse,
  MarketOverviewResponse,
  ModelVersionOut,
  NewsArticle,
  OhlcvBar,
  PaperAccount,
  PaperPosition,
  PlatformHealthReport,
  PortfolioPosition,
  ProviderHealth,
  SafeModeStatus,
  SchemaStatus,
  SearchResponse,
  SectorHeatmapEntry,
  SignalPayload,
  StockAnalysis,
  StreamBar,
  UniverseAsset,
  UniverseTicker,
  WatchlistItem,
} from "./types";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
// Browsers have no default fetch timeout (a hung/unreachable backend can
// leave a request pending indefinitely), which is exactly what left the
// dashboard stuck on its loading skeleton forever — every request gets an
// AbortController-backed ceiling instead.
const REQUEST_TIMEOUT_MS = 15_000;
// dashboard/summary, scan/opportunities, scan/heatmap, scan/risk-monitor
// analyze the entire universe server-side on a cache miss — a genuinely
// slow (tens-of-seconds) cold start, not a hang. See their call sites below.
const SLOW_SCAN_TIMEOUT_MS = 60_000;

export type ApiErrorCode =
  | "backend_unreachable" // fetch itself failed — server down / wrong URL / CORS
  | "timeout" // no response within REQUEST_TIMEOUT_MS
  | "provider_unavailable" // backend up, market-data vendor down/redirected/blocked
  | "unauthorized" // 401/403 — login or API key problem
  | "rate_limited" // 429
  | "backend_error" // 5xx without a structured provider detail
  | "request_failed"; // other non-2xx

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number; // 0 when the backend was never reached
  readonly detail: string;

  constructor(code: ApiErrorCode, status: number, detail: string, path: string) {
    super(`API ${status || "unreachable"} ${path}: ${detail}`);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** Map a caught error to what the user should actually be told. */
export function classifyApiError(e: unknown): { code: ApiErrorCode; title: string; hint: string } {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "backend_unreachable":
        return { code: e.code, title: "Could not reach the backend API.", hint: "Make sure it is running at NEXT_PUBLIC_API_URL." };
      case "timeout":
        return { code: e.code, title: "The backend took too long to respond.", hint: "It may be slow, restarting, or unreachable. Try again." };
      case "provider_unavailable":
        return { code: e.code, title: "Market data is currently unavailable.", hint: "The backend is running, but the market-data provider is unreachable, redirected, or unauthorized. No substitute data is shown. Check /api/v1/providers/health." };
      case "unauthorized":
        return { code: e.code, title: "Not authorized.", hint: "Your session or API key was rejected. Sign in again or check credentials." };
      case "rate_limited":
        return { code: e.code, title: "Rate limit reached.", hint: "Too many requests — wait a moment and retry." };
      case "backend_error":
        return { code: e.code, title: "The backend hit an internal error.", hint: "The API is reachable but returned 5xx — check backend logs." };
      default:
        return { code: e.code, title: "Request failed.", hint: e.detail };
    }
  }
  return { code: "backend_unreachable", title: "Could not reach the backend API.", hint: String(e) };
}

/** Classify a non-2xx response body/status into an ApiErrorCode. */
export function classifyResponse(status: number, body: string): { code: ApiErrorCode; detail: string } {
  let detail: unknown = null;
  try {
    detail = (JSON.parse(body) as { detail?: unknown }).detail;
  } catch {
    /* non-JSON body */
  }
  const structured = detail as { code?: string; message?: string } | null;
  if (structured && typeof structured === "object" && structured.code === "provider_unavailable") {
    return { code: "provider_unavailable", detail: structured.message ?? "market data provider unavailable" };
  }
  const text = typeof detail === "string" ? detail : body;
  if (status === 401 || status === 403) return { code: "unauthorized", detail: text };
  if (status === 429) return { code: "rate_limited", detail: text };
  if (status >= 500) return { code: "backend_error", detail: text };
  return { code: "request_failed", detail: text };
}

export interface FetchMeta {
  /** true when this response came from the service worker's offline cache
   * (X-Nexora-Cache: offline-fallback), not a live network round-trip. */
  offline: boolean;
  /** when the cached copy was originally fetched, if offline is true. */
  cachedAt: string | null;
}

// Side-channel, keyed by request path: lets callers ask "was my last fetch
// of this path served from cache?" without changing request<T>()'s return
// type or touching the ~20 existing call sites below.
const _fetchMeta = new Map<string, FetchMeta>();

export function getFetchMeta(path: string): FetchMeta | null {
  return _fetchMeta.get(path) ?? null;
}

// Concurrent 401s (e.g. every widget on the dashboard firing at once) must
// only trigger one refresh call, not one per request — every caller awaits
// this same in-flight promise instead of racing the backend.
let _refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (!_refreshInFlight) {
    _refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
          cache: "no-store",
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { access_token: string; refresh_token: string };
        setTokens(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      } finally {
        _refreshInFlight = null;
      }
    })();
  }
  return _refreshInFlight;
}

async function rawFetch(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const token = getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, init?: RequestInit, _retried = false, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let res: Response;
  try {
    res = await rawFetch(path, init, timeoutMs);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError("timeout", 0, `No response within ${timeoutMs / 1000}s`, path);
    }
    throw new ApiError("backend_unreachable", 0, String(e), path);
  }

  // A logged-in session whose access token just expired gets one silent
  // retry via the refresh token before the caller ever sees an error —
  // most 401s a real user hits are just "token aged out mid-session".
  if (res.status === 401 && !_retried && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, init, true, timeoutMs);
    clearTokens();
  }

  if (!res.ok) {
    const body = await res.text();
    const { code, detail } = classifyResponse(res.status, body);
    throw new ApiError(code, res.status, detail, path);
  }
  // Only GET requests are ever served from the service worker cache (see
  // public/sw.js) — a marked response here always means "stale, not live".
  const servedFromCache = res.headers.get("X-Nexora-Cache") === "offline-fallback";
  _fetchMeta.set(path, {
    offline: servedFromCache,
    cachedAt: res.headers.get("X-Nexora-Cached-At"),
  });
  return res.json() as Promise<T>;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthTokens>(`/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    request<AuthTokens>(`/auth/register`, { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<{ id: number; email: string; role: string; created_at: string }>(`/auth/me`),

  universe: (limit = 100) => request<UniverseTicker[]>(`/stocks/universe?limit=${limit}`),
  search: (q: string) => request<SearchResponse>(`/stocks/search?q=${encodeURIComponent(q)}`),
  deliberation: (symbol: string) => request<Deliberation>(`/stocks/${symbol}/deliberation`),
  health: async () => {
    const res = await fetch(API_BASE.replace(/\/api\/v1$/, "") + "/health", { cache: "no-store" });
    if (!res.ok) throw new Error(`health check failed: ${res.status}`);
    return res.json() as Promise<{ status: string; environment: string; data_provider: string }>;
  },
  analysis: (symbol: string) => request<StockAnalysis>(`/stocks/${symbol}/analysis`),
  ohlcv: (symbol: string, lookbackDays = 250) =>
    request<{ symbol: string; bars: OhlcvBar[] }>(`/stocks/${symbol}/ohlcv?lookback_days=${lookbackDays}`),
  candles: (symbol: string, timeframe: string, limit = 500) =>
    request<CandlesResponse>(`/stocks/${symbol}/candles?timeframe=${timeframe}&limit=${limit}`),
  indicators: (symbol: string, timeframe: string) =>
    request<IndicatorSeriesResponse>(`/stocks/${symbol}/indicators?timeframe=${timeframe}`),
  news: (symbol: string, limit = 20) => request<NewsArticle[]>(`/stocks/${symbol}/news?limit=${limit}`),

  // These three run a full ML pass (ensemble + SHAP + Monte Carlo) across
  // the whole universe server-side on a cache miss — a legitimately slow
  // cold-start (tens of seconds), not a hang. They get a longer timeout
  // ceiling than everything else so a real-but-slow first load doesn't
  // trip the retry card at the same threshold as an actually-hung request;
  // subsequent loads hit the backend's 30s analysis cache and are fast.
  opportunities: (limit = 20) => request<StockAnalysis[]>(`/scan/opportunities?limit=${limit}`, undefined, false, SLOW_SCAN_TIMEOUT_MS),
  heatmap: () => request<SectorHeatmapEntry[]>(`/scan/heatmap`, undefined, false, SLOW_SCAN_TIMEOUT_MS),
  riskMonitor: () =>
    request<{ ticker: string; manipulation_risk: number; top_flags: string[] }[]>(`/scan/risk-monitor`, undefined, false, SLOW_SCAN_TIMEOUT_MS),

  dashboardSummary: () => request<DashboardSummary>(`/dashboard/summary`, undefined, false, SLOW_SCAN_TIMEOUT_MS),
  marketOverview: (symbols?: string[]) =>
    request<MarketOverviewResponse>(`/dashboard/market-overview${symbols ? `?symbols=${symbols.join(",")}` : ""}`),
  aiStatus: () => request<{ available: boolean; message: string; backend: string }>(`/chat/ai-status`),

  watchlist: () => request<WatchlistItem[]>(`/watchlist`),
  addToWatchlist: (ticker_symbol: string, note?: string) =>
    request<WatchlistItem>(`/watchlist`, { method: "POST", body: JSON.stringify({ ticker_symbol, note }) }),
  removeFromWatchlist: (symbol: string) => request<{ status: string }>(`/watchlist/${symbol}`, { method: "DELETE" }),

  portfolio: () => request<PortfolioPosition[]>(`/portfolio`),
  openPosition: (ticker_symbol: string, quantity: number, avg_entry_price: number) =>
    request<PortfolioPosition>(`/portfolio`, {
      method: "POST",
      body: JSON.stringify({ ticker_symbol, quantity, avg_entry_price }),
    }),

  calibrationReport: () => request<CalibrationReport>(`/predictions/calibration`),

  alertRules: () => request<AlertRule[]>(`/alerts/rules`),
  createAlertRule: (payload: {
    ticker_symbol: string;
    condition_type: AlertConditionType;
    comparison: AlertComparison;
    threshold_value?: number;
    target_status?: string;
  }) => request<AlertRule>(`/alerts/rules`, { method: "POST", body: JSON.stringify(payload) }),
  setAlertRuleActive: (ruleId: number, isActive: boolean) =>
    request<AlertRule>(`/alerts/rules/${ruleId}?is_active=${isActive}`, { method: "PATCH" }),
  deleteAlertRule: (ruleId: number) => request<{ status: string }>(`/alerts/rules/${ruleId}`, { method: "DELETE" }),
  alertEvents: (unacknowledgedOnly = false) =>
    request<AlertEvent[]>(`/alerts/events?unacknowledged_only=${unacknowledgedOnly}`),
  acknowledgeAlertEvent: (eventId: number) =>
    request<AlertEvent>(`/alerts/events/${eventId}/acknowledge`, { method: "POST" }),

  paperAccount: () => request<PaperAccount>(`/paper-trading/account`),
  paperPositions: (status: "open" | "closed" = "open") =>
    request<PaperPosition[]>(`/paper-trading/positions?status=${status}`),
  openPaperPosition: (ticker_symbol: string, quantity: number) =>
    request<PaperPosition>(`/paper-trading/positions`, {
      method: "POST",
      body: JSON.stringify({ ticker_symbol, quantity }),
    }),
  closePaperPosition: (positionId: number) =>
    request<PaperPosition>(`/paper-trading/positions/${positionId}/close`, { method: "POST" }),

  runBacktest: (params: {
    universe_limit?: number;
    lookback_days?: number;
    max_hold_days?: number;
    position_size_dollars?: number;
  }) => request<BacktestResult>(`/backtest/run`, { method: "POST", body: JSON.stringify(params) }),

  streamBars: (symbol: string, limit = 500) =>
    request<{ symbol: string; timeframe: string; bars: StreamBar[] }>(`/stream/${symbol}/bars?limit=${limit}`),
  streamHealth: (symbol: string) =>
    request<{ symbol: string; streaming: boolean; stale: boolean; staleness_seconds: number | null }>(
      `/stream/${symbol}/health`
    ),
  evaluateSignal: (symbol: string) => request<SignalPayload>(`/stream/${symbol}/evaluate-signal`, { method: "POST" }),
  currentSignal: (symbol: string) => request<SignalPayload>(`/stream/${symbol}/signal`),
  signalHistory: (symbol: string, limit = 20) =>
    request<{
      signals: SignalPayload[];
      events: { signal_id: number; at: string; type: string; from: string | null; to: string | null; reason: string | null }[];
    }>(`/stream/${symbol}/signal-history?limit=${limit}`),

  // Admin/Operator — Phase 11. Reads are operator-only server-side; the
  // frontend additionally hides the /admin route client-side for UX, but
  // that hiding is not the enforcement (see AdminGate in app/admin/page.tsx).
  safeMode: () => request<SafeModeStatus>(`/admin/safe-mode`),
  setSafeMode: (override: boolean | null) =>
    request<SafeModeStatus>(`/admin/safe-mode`, { method: "POST", body: JSON.stringify({ override }) }),
  providerHealth: () => request<ProviderHealth>(`/providers/health`),
  platformHealth: () => request<PlatformHealthReport>(`/monitoring/health`),
  schemaStatus: async () => {
    const res = await fetch(API_BASE.replace(/\/api\/v1$/, "") + "/health/ready", { cache: "no-store" });
    if (!res.ok) throw new Error(`schema status check failed: ${res.status}`);
    return res.json() as Promise<SchemaStatus>;
  },
  models: () => request<ModelVersionOut[]>(`/models`),
  trainChallenger: () => request<ModelVersionOut>(`/models/train-challenger`, { method: "POST" }),
  promoteModel: (versionId: number) => request<ModelVersionOut>(`/models/${versionId}/promote`, { method: "POST" }),
  assetUniverse: (includeInactive = true) =>
    request<UniverseAsset[]>(`/universe?include_inactive=${includeInactive}`),
  addUniverseAsset: (payload: { symbol: string; asset_type: string; name: string; exchange: string }) =>
    request<UniverseAsset>(`/universe`, { method: "POST", body: JSON.stringify(payload) }),
  setUniverseAssetActive: (symbol: string, isActive: boolean) =>
    request<UniverseAsset>(`/universe/${symbol}`, { method: "PATCH", body: JSON.stringify({ is_active: isActive }) }),

  sendChatMessage: (session_key: string, message: string, ticker?: string) =>
    request<{ reply: string; ticker: string | null; session_key: string }>(`/chat/message`, {
      method: "POST",
      body: JSON.stringify({ session_key, message, ticker }),
    }),
  chatHistory: (session_key: string) =>
    request<{ session_key: string; ticker: string | null; messages: { role: string; content: string }[] }>(
      `/chat/history/${session_key}`
    ),
};
