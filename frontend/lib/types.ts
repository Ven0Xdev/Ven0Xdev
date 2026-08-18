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

export type ChartTimeframe = "1m" | "5m" | "15m" | "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";

export interface CandlesResponse {
  symbol: string;
  timeframe: string;
  bars: OhlcvBar[];
  bar_count: number;
  data_source: string;
  data_mode: string;
  market_status: string;
  as_of: string;
  note: string | null;
}

export interface IndicatorSeriesResponse {
  symbol: string;
  timeframe: string;
  timestamps: string[];
  series: Record<string, (number | null)[]>;
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
  id: number;
  simulation_number: number;
  label: string | null;
  cash_balance: number;
  starting_balance: number;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  equity: number | null;
  unrealized_pnl_dollars: number | null;
}

export interface PaperSimulationSummary {
  id: number;
  simulation_number: number;
  label: string | null;
  starting_balance: number;
  is_active: boolean;
  created_at: string;
  archived_at: string | null;
  closed_trade_count: number;
  realized_pnl_dollars: number;
  win_rate_pct: number | null;
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

export interface ChatMetadata {
  backend: "template" | "llm";
  model: string | null;
  data_source: string | null;
  data_mode: string | null;
  engine_mode: "HEURISTIC" | "TRAINED_ML" | null;
  as_of: string | null;
  safe_mode_active: boolean;
  drift_status: "insufficient_history" | "stable" | "moderate" | "significant";
  confidence_score: number | null;
  confidence_note: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  metadata?: ChatMetadata | null;
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

export interface CalibrationBucket {
  range: [number, number];
  count: number;
  avg_predicted_prob?: number;
  realized_frequency?: number;
  calibration_gap?: number;
}

export interface CalibrationBucketReport {
  total_scored: number;
  buckets: CalibrationBucket[];
  overall_stop_rate: number;
  avg_realized_return_pct: number;
  brier_score: number;
}

export interface CalibrationReport extends Partial<CalibrationBucketReport> {
  total_scored: number;
  buckets: CalibrationBucket[];
  by_engine_mode: Record<string, CalibrationBucketReport>;
  note?: string;
}

export type AlertConditionType = "price" | "ai_score" | "manipulation_risk" | "signal_status";
export type AlertComparison = "above" | "below" | "equals";

export interface AlertRule {
  id: number;
  ticker_symbol: string;
  condition_type: AlertConditionType;
  comparison: AlertComparison;
  threshold_value: number | null;
  target_status: string | null;
  is_active: boolean;
  created_at: string;
  last_fired_at: string | null;
}

export interface AlertEvent {
  id: number;
  rule_id: number;
  ticker_symbol: string;
  fired_at: string;
  message: string;
  observed_value: number | null;
  observed_status: string | null;
  acknowledged: boolean;
}

export interface SafeModeStatus {
  override: boolean | null;
  env_default: boolean;
  effective: boolean;
  updated_at: string | null;
  updated_by_user_id: number | null;
}

export interface ProviderHealth {
  provider: string;
  data_mode: string;
  ok: boolean;
  latency_ms: number;
  sample_symbols: string[];
  error: string | null;
  checked_at: string;
}

export interface SchemaStatus {
  ready: boolean;
  schema_managed_by: string;
  expected_revision?: string;
  applied_revision?: string | null;
  detail: string;
}

export interface PlatformHealthAlert {
  severity: string;
  code: string;
  message: string;
}

export interface PlatformHealthReport {
  generated_at: string;
  drift: Record<string, unknown>;
  prediction_accuracy: Record<string, unknown>;
  provider: Record<string, unknown>;
  scanner: Record<string, unknown>;
  api_latency: Record<string, unknown>;
  database: { status: string; ping_ms?: number; error?: string };
  alerts: PlatformHealthAlert[];
}

export interface ModelVersionOut {
  id: number;
  name: string;
  version: string;
  model_type: string;
  trained_at: string;
  is_active: boolean;
  metrics: Record<string, unknown> | null;
  hyperparameters: Record<string, unknown> | null;
}

export interface UniverseAsset {
  symbol: string;
  asset_type: string;
  name: string;
  exchange: string;
  currency: string;
  provider: string;
  is_active: boolean;
  tradable: boolean;
  trading_hours: string;
  data_delay: string;
  supported_timeframes: string[];
}

export type PlanName = "free" | "pro";

export interface UsageOut {
  watchlist_items: number;
  max_watchlist_items: number;
  alert_rules: number;
  max_alert_rules: number;
}

export interface BillingStatus {
  plan: string;
  usage: UsageOut;
  billing_configured: boolean;
  billing_message: string;
}

export interface PlanCatalog {
  plans: Record<string, Record<string, number>>;
}

export interface AdminUser {
  id: number;
  email: string;
  role: string;
  plan: string;
  is_active: boolean;
  created_at: string;
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

export interface NcsComponent {
  name: string;
  score: number; // -1..+1
  weight: number;
  detail: string;
}

/** Nexora Conviction Signal — Nexora's own versioned composite indicator.
 * Distinct from SignalPayload's POSSIBLE_ENTRY/WATCH/... ladder above. */
export interface NcsSignal {
  id: number;
  ticker: string;
  timeframe: string;
  bar_ts: string;
  computed_at: string;
  raw_verdict: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
  confirmed_verdict: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL" | null;
  fired: boolean;
  composite_score: number;
  confidence_pct: number;
  risk_score: number;
  explanation: string;
  components: NcsComponent[];
  vetoed: boolean;
  veto_reason: string | null;
  version: string;
  data_source: string;
  data_mode: string;
}

export interface NcsNoSignalYet {
  raw_verdict: "NO_SIGNAL_YET";
  ticker: string;
}

/** A single article from the Alpaca-backed news pipeline (services/news) —
 * deduplicated, persisted, and deterministically classified (sentiment/
 * category/reliability/novelty/relevance/impact are keyword-lexicon
 * heuristics, never an ML or LLM claim). Distinct from the older, simpler
 * `NewsArticle` above (live pass-through via GET /stocks/{symbol}/news,
 * no persistence/dedup/novelty/impact scoring) — kept separate rather than
 * merged since the two power different, still-independently-used features. */
export interface NewsPipelineArticle {
  id: number;
  provider: string;
  external_id: string;
  source: string;
  headline: string;
  summary: string | null;
  url: string;
  symbols: string[];
  published_at: string;
  received_at: string;
  update_count: number;
  sentiment: number; // -1..+1
  sentiment_label: "positive" | "negative" | "neutral" | "uncertain";
  novelty: number; // 0..1
  relevance: number; // 0..1
  reliability: number; // 0..1
  impact: number; // 0..1
  category: string | null;
  is_press_release: boolean;
  is_promotional: boolean;
}

export interface NewsHealth {
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  note?: string;
}
