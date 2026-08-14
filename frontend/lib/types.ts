export interface HorizonProbabilities {
  horizon_days: number;
  prob_up_5: number;
  prob_up_10: number;
  prob_up_20: number;
}

export interface ManipulationFlag {
  code: string;
  severity: number;
  reason: string;
}

export interface TopFactor {
  feature: string;
  label: string;
  impact: number;
  direction: "bullish" | "bearish";
}

export interface StockAnalysis {
  ticker: string;
  company_name: string;
  current_price: number;
  tier: string;
  sector: string;
  data_source: string;
  data_mode: "synthetic" | "delayed" | "live" | "cached" | "unspecified";
  as_of: string | null;
  price_as_of: string | null;
  /** Which engine actually produced probability_matrix — "HEURISTIC" means a
   * hand-written feature formula, never a trained model. Never render
   * HEURISTIC numbers as if they came from a trained ML model. */
  engine_mode: "HEURISTIC" | "TRAINED_ML";
  model_version: string | null;
  liquidity_score: number;
  manipulation_risk: number;
  fundamental_score: number;
  technical_score: number;
  sentiment_score: number;
  catalyst_score: number;
  overall_ai_score: number;
  confidence_score: number;
  probability_matrix: HorizonProbabilities[];
  probability_downside_before_upside: number;
  suggested_entry_zone_low: number;
  suggested_entry_zone_high: number;
  ideal_entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  max_allocation_pct: number;
  expected_risk_reward: number;
  estimated_holding_period_days: number;
  explanation: string;
  manipulation_flags: ManipulationFlag[];
  top_factors: TopFactor[];
}

export interface UniverseTicker {
  symbol: string;
  company_name: string;
  tier: string;
  sector: string;
  market_cap: number;
  float_shares: number;
}

export interface NewsArticle {
  published_at: string;
  source: string;
  headline: string;
  url: string;
  sentiment: number;
  is_press_release: boolean;
  is_promotional: boolean;
}

export interface OhlcvBar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WatchlistItem {
  ticker_symbol: string;
  added_at: string;
  note: string | null;
}

export interface PortfolioPosition {
  ticker_symbol: string;
  quantity: number;
  avg_entry_price: number;
  opened_at: string;
  status: string;
  current_price: number | null;
  unrealized_pnl_pct: number | null;
}

export interface PaperAccount {
  cash_balance: number;
  starting_balance: number;
  created_at: string;
}

export interface PaperPosition {
  id: number;
  ticker_symbol: string;
  quantity: number;
  avg_entry_price: number;
  opened_at: string;
  closed_at: string | null;
  exit_price: number | null;
  status: "open" | "closed";
  realized_pnl_dollars: number | null;
  entry_confidence_pct: number | null;
  entry_risk_reward: number | null;
  planned_stop_loss: number | null;
  planned_take_profit: number | null;
  risk_policy_version: string;
  entry_data_source: string;
  entry_data_mode: string;
  current_price: number | null;
  unrealized_pnl_dollars: number | null;
  unrealized_pnl_pct: number | null;
}

export interface BacktestTrade {
  symbol: string;
  entry_ts: string;
  exit_ts: string | null;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  pnl_pct: number | null;
  exit_reason: string | null;
  hold_days: number;
  was_partial_entry: boolean;
  was_halted_entry: boolean;
}

export interface BacktestResult {
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown_pct: number;
  profit_factor: number;
  expectancy_pct: number;
  win_rate_pct: number;
  avg_hold_time_days: number;
  total_return_pct: number;
  num_trades: number;
  equity_curve: number[];
  trades: BacktestTrade[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MarketOverviewStock {
  symbol: string;
  status: "ok" | "unavailable";
  company_name?: string;
  current_price?: number;
  change?: number | null;
  change_percent?: number | null;
  volume?: number | null;
  market_status?: "open" | "closed" | "pre-market" | "after-hours";
  chart_history?: number[];
  data_source?: string;
  data_mode?: string;
  note?: string | null;
}

export interface MarketOverviewResponse {
  stocks: MarketOverviewStock[];
  as_of: string;
  provider: string;
}

export interface DashboardSummary {
  universe_size: number;
  avg_model_confidence: number;
  watchlist_count: number;
  open_positions: number;
  total_predictions_logged: number;
  top_opportunities: { ticker: string; overall_ai_score: number; confidence_score: number }[];
  high_risk_watch: { ticker: string; manipulation_risk: number }[];
}

export interface SectorHeatmapEntry {
  sector: string;
  avg_score: number;
  count: number;
}

export interface SearchMatch {
  symbol: string;
  company_name: string;
  tier: string;
  sector: string;
  in_universe: boolean;
}

export interface SearchResponse {
  query: string;
  valid_format: boolean;
  source: string;
  data_mode: string;
  as_of: string;
  matches: SearchMatch[];
}

export interface DeliberationEvidence {
  agent: string;
  claim: string;
  direction: "bullish" | "bearish" | "neutral";
  strength: number;
  source: string;
}

export interface DeliberationStage {
  stage: string;
  summary: string;
  evidence: DeliberationEvidence[];
  metrics: Record<string, unknown>;
}

export interface Deliberation {
  ticker: string;
  stages: DeliberationStage[];
  verdict: {
    stance: string;
    conviction: number;
    probability_up_10: number;
    probability_downside_first: number;
    key_reasons_for: string[];
    key_reasons_against: string[];
    invalidation_conditions: string[];
    narrative: string;
  };
}

export interface StreamBar {
  symbol: string;
  timeframe: string;
  start: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trade_count: number;
  provider: string;
  data_mode: string;
  last_update: string;
}

export interface SignalPayload {
  signal_id: number;
  ticker: string;
  created_at: string;
  status:
    | "NO_TRADE"
    | "AVOID"
    | "WATCH"
    | "SETUP_FORMING"
    | "POSSIBLE_ENTRY"
    | "POSITION_ACTIVE"
    | "REDUCE"
    | "EXIT"
    | "SIGNAL_INVALIDATED"
    | "NO_SIGNAL_YET";
  ideal_entry: number | null;
  entry_zone: [number | null, number | null];
  stop_loss: number | null;
  targets: number[];
  holding_period_days: number | null;
  risk_reward: number | null;
  calibrated_probability: number | null;
  confidence: number;
  technical_score: number;
  liquidity_score: number;
  manipulation_risk: number;
  data_quality_score: number;
  bullish_reasons: string[];
  bearish_reasons: string[];
  invalidation_conditions: string[];
  rejection_reasons: string[];
  data_source: string;
  data_mode: string;
  model_version: string;
  feature_version: string;
  risk_policy_version: string;
}
