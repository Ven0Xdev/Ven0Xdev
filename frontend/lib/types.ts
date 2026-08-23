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

/** Bar granularity (chart Interval control). "1Y"/"ALL" used to live here
 * too, back when this array conflated interval and range — they're
 * ChartRange values now (see below); kept in this union only so existing
 * API calls built before the split still type-check unchanged. */
export type ChartTimeframe = "1m" | "5m" | "15m" | "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";

/** How far back the chart looks (chart Range control) — independent of
 * ChartTimeframe. Valid values depend on the selected interval: intraday
 * intervals (1m/5m/15m/1H) accept 1D/5D/1M; daily+ intervals (1D/1W/1M)
 * accept 1M/3M/6M/YTD/1Y/5Y/ALL. See backend bars_for_timeframe's
 * docstring (services/signals/engine.py) for the authoritative mapping. */
export type ChartRange = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";

export interface CandlesResponse {
  symbol: string;
  timeframe: string;
  range?: string | null;
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
  range?: string | null;
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
  autonomous_trading_enabled: boolean;
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
  opened_by: "manual" | "autonomous";
  ncs_signal_id: number | null;
}

/** NEXORA INTERNAL PAPER order — never a real broker order. See
 * backend/app/db/models/paper_order.py for the full lifecycle. */
export interface PaperOrderRecord {
  id: number;
  ticker_symbol: string;
  side: "buy" | "sell";
  order_type: "market" | "limit" | "stop" | "take_profit" | "stop_loss";
  quantity: number;
  limit_price: number | null;
  stop_price: number | null;
  bracket_take_profit: number | null;
  bracket_stop_loss: number | null;
  status: "pending" | "accepted" | "partially_filled" | "filled" | "cancelled" | "rejected" | "expired" | "triggered";
  regular_hours_only: boolean;
  created_at: string;
  updated_at: string;
  filled_at: string | null;
  filled_price: number | null;
  rejected_reason: string | null;
  cancelled_reason: string | null;
  origin: "manual" | "autonomous";
  position_id: number | null;
  oco_group_id: string | null;
  ncs_signal_id: number | null;
  data_source: string;
  data_mode: string;
}

export interface PaperTradeRecord {
  id: number;
  ticker_symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executed_at: string;
  status: string;
  account_id: number | null;
  position_id: number | null;
  data_source: string;
  data_mode: string;
}

/** One persisted chart drawing (trendline/hline/vline/ray/rectangle/
 * fibonacci/text/arrow) — see backend/app/db/models/chart_drawing.py.
 * `data` is the type-specific payload (see components/charts/drawings/
 * types.ts's DrawingPayload on the frontend side); anchors inside it are
 * always real {time, price}, never screen pixels. */
export interface ChartDrawingRecord {
  id: number;
  ticker_symbol: string;
  timeframe: string;
  drawing_type: string;
  data: Record<string, unknown>;
  locked: boolean;
  hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface DecisionAuditRow {
  id: number;
  ticker: string;
  timeframe: string;
  bar_ts: string;
  evaluated_at: string;
  raw_verdict: string;
  confirmed_verdict: string | null;
  state: "fired" | "vetoed" | "awaiting_confirmation" | "no_trade";
  fired: boolean;
  confidence_pct: number;
  composite_score: number;
  risk_score: number;
  version: string;
  data_source: string;
  data_mode: string;
  components: NcsComponent[];
  vetoed: boolean;
  veto_reason: string | null;
  shadow_status: "OPEN" | "CLOSED" | null;
  shadow_maturity_bar_ts: string | null;
  shadow_pnl_pct: number | null;
  shadow_exit_reason: string | null;
  paper_position_id: number | null;
  paper_order_id: number | null;
}

/** Top-of-book quote for the chart Order Ticket. bid/ask/spread are null,
 * never invented, when the provider doesn't supply quote depth. */
export interface QuoteTicket {
  symbol: string;
  last: number;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  timestamp: string;
  data_source: string;
  data_mode: string;
}

export interface DecisionAuditResponse {
  symbol: string;
  timeframe: string;
  current_drift_status: string;
  eligibility_progress: {
    candidate_signals: number;
    open_observations: number;
    closed_outcomes: number;
    progress_pct: number;
    win_rate_pct: number | null;
    eligible: boolean;
    blockers: string[];
  };
  rows: DecisionAuditRow[];
}

export interface AutonomousTradingStatus {
  paused: boolean;
  updated_at: string | null;
  updated_by_user_id: number | null;
  drift_status: "insufficient_history" | "stable" | "moderate" | "significant";
  drift_blocking: boolean;
  safe_mode_active: boolean;
  /** The one honest "can this actually open a position right now?"
   * summary — false means every autonomous entry is refused platform-wide
   * regardless of `paused` alone. Never infer "operational" from
   * `!paused` — see admin.py's AutonomousTradingOut docstring. */
  operational: boolean;
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

export interface WhyNoTradeGate {
  name: string;
  passed: boolean;
  detail: string;
}

/** Paper Trading's "Why no trade?" diagnostic — mirrors every gate
 * autonomous paper trading itself checks (services/paper_trading/
 * autonomous.py) without opening or closing anything. See
 * backend/app/services/paper_trading/why_no_trade.py. */
export interface WhyNoTrade {
  ticker: string;
  timeframe: string;
  market_state: string;
  provider: string;
  data_mode: string;
  data_freshness: string;
  ncs_state: string;
  ncs_fired: boolean;
  ncs_vetoed: boolean;
  red_team_result: string;
  shadow_sample_size: number;
  shadow_win_rate_pct: number | null;
  drift_status: string;
  risk_gate_passed: boolean;
  risk_gate_reasons: string[];
  gates: WhyNoTradeGate[];
  permitted: boolean;
  blockers: string[];
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

/** A single shadow position — passive, hypothetical tracking of what a
 * fired NCS signal would have returned, using real closed-bar prices
 * only. Never the paper trading engine, never "NEXORA INTERNAL PAPER". */
export interface ShadowPosition {
  id: number;
  ncs_signal_id: number;
  ticker_symbol: string;
  timeframe: string;
  direction: "LONG" | "SHORT";
  entry_bar_ts: string;
  entry_price: number;
  status: "OPEN" | "CLOSED";
  holding_bars_elapsed: number;
  mfe_pct: number;
  mae_pct: number;
  exit_bar_ts: string | null;
  exit_price: number | null;
  exit_reason: "max_holding_period" | "ncs_reversal" | null;
  pnl_pct: number | null;
  version: string;
}

export interface ShadowStats {
  count_closed: number;
  count_open: number;
  win_rate_pct: number | null;
  avg_pnl_pct: number | null;
  avg_mfe_pct: number | null;
  avg_mae_pct: number | null;
}

/** One ticker's progress toward autonomous-trading eligibility — see
 * backend/app/services/shadow/engine.py's shadow_learning_progress(). */
export interface ShadowTickerProgress {
  ticker: string;
  timeframe: string;
  ncs_version: string;
  candidate_signals: number;
  open_observations: number;
  closed_outcomes: number;
  progress_pct: number;
  win_rate_pct: number | null;
  last_evaluation: string | null;
  eligible: boolean;
  blockers: string[];
}

export interface ShadowProgressResponse {
  timeframe: string;
  tickers: ShadowTickerProgress[];
}

// --- Historical Research pipeline (Phase 1-7) --------------------------

export interface ResearchBarCoverage {
  ticker_symbol: string;
  timeframe: string;
  data_source: string;
  feed: string;
  coverage_start: string | null;
  coverage_end: string | null;
  row_count: number;
}

export interface ResearchBackfillCheckpoint {
  provider: string;
  dataset: string;
  ticker_symbol: string;
  status: "pending" | "in_progress" | "done" | "failed";
  rows_ingested: number;
  last_error: string | null;
  updated_at: string | null;
}

export interface ResearchCoverageResponse {
  bars: ResearchBarCoverage[];
  fundamentals_rows_by_symbol: Record<string, number>;
  news_rows_by_symbol: Record<string, number>;
  corporate_actions_rows_by_symbol: Record<string, number>;
  news_honestly_unavailable: boolean;
  backfill_checkpoints: ResearchBackfillCheckpoint[];
  horizons: string[];
}

export type ResearchModelState =
  | "RESEARCH" | "HISTORICALLY_QUALIFIED" | "REJECTED_OVERFIT" | "LIVE_SHADOW" | "LIVE_QUALIFIED" | "RETIRED";

export interface ResearchModelSummary {
  id: number;
  family: string;
  horizon: string;
  version: string;
  state: ResearchModelState;
  rejection_reason: string | null;
  trained_at: string;
  qualified_at: string | null;
  retired_at: string | null;
  dataset_summary: {
    horizon: string;
    n_samples: number;
    n_symbols_with_data: number;
    date_range: [string, string] | null;
    label_distribution: { BUY: number; SELL: number; NO_TRADE: number };
  };
}

export interface ResearchFamilyResult {
  family: string;
  n_train: number;
  n_test: number;
  buy_auc: number | null;
  sell_auc: number | null;
  buy_brier: number | null;
  buy_calibration_gap: number | null;
  n_trades: number;
  total_return_pct: number;
  sharpe_per_trade: number;
  sortino_per_trade: number;
  max_drawdown_pct: number;
  max_drawdown_duration_trades: number;
  calmar: number;
  profit_factor: number;
  expectancy_pct: number;
  win_rate_pct: number;
  turnover: number;
}

export interface ResearchFoldReport {
  train_through_year: number;
  test_year: number;
  n_train_before_purge: number;
  n_train_after_purge: number;
  families: ResearchFamilyResult[];
}

export interface ResearchModelDetail extends ResearchModelSummary {
  walk_forward_report: {
    folds: ResearchFoldReport[];
    selected_family: string | null;
    selection_rationale: string | null;
    deflated_sharpe_probability: number | null;
    n_trials_for_dsr: number | null;
  };
  holdout_report: {
    train_through: string;
    holdout_range: [string, string];
    family: string;
    result: ResearchFamilyResult;
    note: string;
  } | Record<string, never>;
  stress_test_report: {
    normal_costs: ResearchFamilyResult;
    doubled_costs: ResearchFamilyResult;
  } | Record<string, never>;
  leakage_checks: Record<string, unknown>;
}

export interface CanaryPositionSummary {
  id: number;
  ticker_symbol: string;
  horizon: string;
  quantity: number;
  avg_entry_price: number;
  opened_at: string;
  stop_loss: number;
  take_profit: number | null;
  max_holding_until: string;
}

export interface CanaryDecisionSummary {
  id: number;
  ticker_symbol: string;
  horizon: string;
  evaluated_at: string;
  verdict: "BUY" | "SELL" | "NO_TRADE";
  probability: number;
  fired: boolean;
  no_trade_reason: string | null;
  drift_status: string | null;
  data_stale: boolean;
}

export interface CanaryStatusResponse {
  enabled: boolean;
  auto_paused: boolean;
  auto_pause_reason: string | null;
  cash_balance: number;
  starting_balance: number;
  peak_equity: number;
  positions_opened_today: number;
  realized_pnl_today_dollars: number;
  open_positions: CanaryPositionSummary[];
  recent_decisions: CanaryDecisionSummary[];
}
