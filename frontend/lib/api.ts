import type {
  BacktestResult,
  DashboardSummary,
  Deliberation,
  NewsArticle,
  OhlcvBar,
  PortfolioPosition,
  SearchResponse,
  SectorHeatmapEntry,
  SignalPayload,
  StockAnalysis,
  StreamBar,
  UniverseTicker,
  WatchlistItem,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export type ApiErrorCode =
  | "backend_unreachable" // fetch itself failed — server down / wrong URL / CORS
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch (e) {
    throw new ApiError("backend_unreachable", 0, String(e), path);
  }
  if (!res.ok) {
    const body = await res.text();
    const { code, detail } = classifyResponse(res.status, body);
    throw new ApiError(code, res.status, detail, path);
  }
  return res.json() as Promise<T>;
}

export const api = {
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
  news: (symbol: string, limit = 20) => request<NewsArticle[]>(`/stocks/${symbol}/news?limit=${limit}`),

  opportunities: (limit = 20) => request<StockAnalysis[]>(`/scan/opportunities?limit=${limit}`),
  heatmap: () => request<SectorHeatmapEntry[]>(`/scan/heatmap`),
  riskMonitor: () =>
    request<{ ticker: string; manipulation_risk: number; top_flags: string[] }[]>(`/scan/risk-monitor`),

  dashboardSummary: () => request<DashboardSummary>(`/dashboard/summary`),

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
