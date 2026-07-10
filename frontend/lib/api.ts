import type {
  BacktestResult,
  DashboardSummary,
  NewsArticle,
  OhlcvBar,
  PortfolioPosition,
  SectorHeatmapEntry,
  StockAnalysis,
  UniverseTicker,
  WatchlistItem,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  universe: (limit = 100) => request<UniverseTicker[]>(`/stocks/universe?limit=${limit}`),
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
