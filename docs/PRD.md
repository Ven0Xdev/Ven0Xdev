# Product Requirements Document — Nexora AI Financial Intelligence Platform

| Field | Value |
|---|---|
| Document version | 1.0 |
| Status | Approved — living document |
| Product | Ven0X OTC Intelligence Platform |
| Repository | `Ven0Xdev/Ven0Xdev`, branch `claude/otc-ai-trading-platform-7i3zon` |
| Last updated | 2026-07-11 |
| Requirement status legend | ✅ Shipped · 🔶 Partially shipped · 🔷 Planned |

---

## 1. Executive Summary

Ven0X is an AI-powered research platform for the OTC (over-the-counter) equity market — the least transparent, most manipulation-prone corner of US equities. The platform continuously scans the OTC universe, scores every ticker across six analytical dimensions, estimates probabilistic outcomes across multiple time horizons, detects manipulation patterns, generates complete trade plans, explains every conclusion in plain English, grades its own past predictions against realized prices, and exposes all of it through a web dashboard and a conversational research assistant.

Ven0X is **not** a signal service and **not** an execution platform. It is a decision-support system whose core product promise is *calibrated honesty*: every forward-looking statement is a probability, every probability is eventually graded against reality, and the grading is shown to the user.

### 1.1 The problem

OTC/penny-stock traders operate with severely asymmetric information:

- No consolidated analyst coverage; issuer disclosure quality ranges from audited to fraudulent to absent.
- Pump-and-dump campaigns, wash trading, toxic convertible financing, and serial reverse splits are endemic and difficult for retail participants to recognize in real time.
- Liquidity is thin and spreads are wide, so the *cost of being wrong* (and even the cost of being right) is structurally higher than on listed exchanges.
- Existing screeners surface raw indicator values but do not estimate outcome probabilities, do not assess manipulation risk, and never audit their own historical accuracy.

### 1.2 The product thesis

A trader deciding whether to enter an OTC position needs, in one place: (a) an honest probability distribution over outcomes, (b) an explicit manipulation-risk assessment with reasons, (c) a complete risk-managed trade plan, (d) the evidence and reasoning behind all of the above, and (e) proof that the system's past probabilities were meaningful. Ven0X delivers exactly this and deliberately nothing else — no order routing, no "guaranteed winners," no certainty language anywhere in the product.

### 1.3 Guiding principles (non-negotiable, enforced in code)

| # | Principle | Enforcement |
|---|---|---|
| P1 | **Never claim certainty.** All forward-looking outputs are probabilities in (0,1); confidence is capped below 100 (`scorer._confidence_score` clamps to 5–97). | ✅ |
| P2 | **Never fabricate market data.** Data a vendor does not supply is reported as explicitly missing/neutral, never approximated (e.g., `Quote.bid/ask = None` on Finnhub). | ✅ |
| P3 | **Every recommendation is explainable.** SHAP-derived factor attribution + plain-English narrative + itemized manipulation flags accompany every score. | ✅ |
| P4 | **The system grades itself.** Every logged prediction is eventually evaluated against realized prices; calibration reports are a first-class product surface. | ✅ |
| P5 | **Conservative ambiguity resolution.** Wherever data cannot disambiguate (e.g., intrabar sequencing), the interpretation less favorable to the platform is used. | ✅ |
| P6 | **Not financial advice.** Disclaimers are embedded in the UI shell, the chat system prompt, and every trade-plan surface. | ✅ |

---

## 2. Goals and Non-Goals

### 2.1 Goals

- G1. Continuously analyze every ticker in the configured OTC universe on a fixed cadence with zero manual triggering.
- G2. For each ticker, produce the full AI Output Contract (§5.3) — scores, probability matrix, trade plan, explanation, manipulation flags.
- G3. Detect and surface manipulation patterns with itemized, human-readable reasons.
- G4. Maintain an immutable prediction log and grade every matured prediction against realized market data.
- G5. Provide realistic backtesting that models OTC execution frictions (spread, slippage, partial fills, halts).
- G6. Provide a conversational assistant grounded exclusively in the platform's computed analysis.
- G7. Scale to thousands of concurrent users and a universe of thousands of tickers.
- G8. Remain fully runnable end-to-end with zero external API keys (synthetic provider) for development, demo, and CI.

### 2.2 Non-Goals

- NG1. Order execution, brokerage connectivity, or any trade placement. Ven0X never touches user funds or positions at a broker.
- NG2. Personalized financial advice. Position-size outputs are ceilings derived from risk models, not individualized advice.
- NG3. High-frequency/intraday microstructure trading. The platform targets swing horizons (5–20 trading days).
- NG4. Non-US or non-OTC asset classes (crypto, FX, options) — out of scope for v1.x.
- NG5. Social/community features (chat rooms, leaderboards) — explicitly rejected; they incentivize the pump dynamics the product exists to detect.

---

## 3. Users and Personas

### Persona A — "The Self-Directed OTC Swing Trader" (primary)

- Trades $500–$20,000 positions in sub-$5 stocks, holding days to weeks.
- Pain: cannot tell organic momentum from promotion campaigns; has been burned by dilution and reverse splits.
- Uses Ven0X to: screen the daily scan, read manipulation flags before entering, take the suggested stop/target structure, interrogate the assistant ("what would invalidate this?").
- Success moment: avoids a position flagged `toxic_dilution` that collapses a week later; verifies via Prediction History that the platform's probabilities are honest.

### Persona B — "The Quantitative Hobbyist"

- Comfortable with statistics; skeptical of black boxes.
- Uses Ven0X for: the calibration report, SHAP factor attributions, backtest engine with cost modeling, walk-forward validation.
- Success moment: reproduces the platform's claimed hit rates from the outcomes table.

### Persona C — "The Risk-Averse Observer"

- Curious about OTC but unwilling to trade yet.
- Uses Ven0X for: the Risk Monitor, learning what manipulation patterns look like on real charts, paper-tracking via Watchlist + Portfolio (manual entries).
- Success moment: builds intuition by following flagged tickers without capital at risk.

### Persona D — "The Platform Operator" (internal)

- Deploys and operates the system; needs: health endpoints, deterministic CI, provider failover clarity, model-version traceability, and the scan worker running unattended.

---

## 4. System Overview

```
┌────────────────────────────────────────────────────────────────┐
│  Next.js 16 Dashboard (7 screens)                               │
└──────────────────────────┬─────────────────────────────────────┘
                           │ REST /api/v1
┌──────────────────────────┴─────────────────────────────────────┐
│  FastAPI                                                        │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ │
│  │ scoring    │ │ features │ │ ml       │ │backtest│ │ chat   │ │
│  │ (composer) │ │ 6 engines│ │ ensemble │ │ engine │ │ agent  │ │
│  └─────┬──────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ └───┬────┘ │
│        └─────────────┴─────┬──────┴───────────┴──────────┘      │
│                    ┌───────┴────────┐   ┌────────────────────┐  │
│                    │ data providers │   │ evaluation         │  │
│                    │ mock│finnhub│… │   │ (outcome grading)  │  │
│                    └───────┬────────┘   └────────────────────┘  │
├────────────────────────────┴────────────────────────────────────┤
│  PostgreSQL + TimescaleDB (hypertable: ohlcv_bars) · Redis      │
│  Workers: scan_scheduler (continuous scan + outcome evaluation) │
└─────────────────────────────────────────────────────────────────┘
```

Component inventory, all under `backend/app/`:

| Component | Path | Status |
|---|---|---|
| Data provider abstraction | `services/data_providers/base.py` | ✅ |
| Synthetic OTC provider (5 regimes, deterministic) | `services/data_providers/mock_provider.py` | ✅ |
| Finnhub live provider (rate-limited, cached) | `services/data_providers/finnhub_provider.py` | ✅ |
| Polygon / OTC Markets providers | `services/data_providers/real_providers.py` | 🔷 stubs |
| Technical features (RSI, MACD, EMA/SMA, BB, ATR, ADX, OBV, VWAP, RVOL, 52w, HV, gap, spread) | `services/features/technical.py` | ✅ |
| Fundamental scoring (runway, profitability, dilution, ownership, filing quality) | `services/features/fundamental.py` | ✅ |
| Sentiment aggregation (promotion-downweighted) | `services/features/sentiment.py` | ✅ |
| Catalyst scoring (keyword + recency decay) | `services/features/catalyst.py` | ✅ |
| Liquidity scoring | `services/features/liquidity.py` | ✅ |
| Manipulation detection (8 rule engines + IsolationForest blend) | `services/features/manipulation.py`, `services/ml/anomaly.py` | ✅ |
| GBM ensemble (LightGBM+XGBoost+CatBoost ×3 thresholds) | `services/ml/ensemble.py`, `gbm_models.py` | ✅ |
| Isotonic probability calibration | `services/ml/calibration.py` | ✅ |
| SHAP explainability + narrative generation | `services/ml/explainability.py` | ✅ |
| Monte-Carlo forecasting (terminal + barrier-touch) | `services/ml/forecasting.py` | ✅ |
| Training pipeline (point-in-time features, versioned artifacts) | `services/ml/training_pipeline.py` | ✅ |
| Scoring composer (AI Output Contract) | `services/scoring/scorer.py` | ✅ |
| Outcome evaluator + calibration report | `services/evaluation/outcome_evaluator.py` | ✅ |
| Backtest engine (costs, partial fills, halts, tiered exits, walk-forward) | `services/backtest/` | ✅ |
| Chat assistant (template + optional LLM backend, session memory) | `services/chat/` | ✅ |
| Continuous scan worker | `workers/scan_scheduler.py` | ✅ |
| Test suite | `tests/` (47 tests) | ✅ |

---

## 5. Functional Requirements

Requirement IDs are stable and referenced from code review and QA.

### 5.1 Data Acquisition (FR-100)

- **FR-101 ✅** The system SHALL access all market data exclusively through the `MarketDataProvider` interface (universe, meta, OHLCV, quote, fundamentals, news, corporate actions). No service may call a vendor SDK/HTTP API directly.
- **FR-102 ✅** The system SHALL ship a deterministic synthetic provider generating five realistic OTC regimes (clean uptrend, clean downtrend, accumulation-breakout, pump-and-dump, illiquid chop), seeded per symbol, sufficient to run every feature end-to-end with no credentials.
- **FR-103 ✅** The system SHALL support Finnhub as a live data source, activated solely by configuration (`MARKET_DATA_PROVIDER=finnhub` + API key), with: token-bucket rate limiting under the vendor quota; per-fact TTL caching; explicit `ProviderDataUnavailable` errors on 403/429/no-data (never silent empties).
- **FR-104 ✅** Where a vendor does not supply a datum (bid/ask depth, dilution history, filing flags on Finnhub), the system SHALL report it as explicitly missing/neutral and SHALL NOT approximate it. Downstream signals degrade visibly (P2).
- **FR-105 🔷** The system SHALL integrate SEC EDGAR (free, keyless) as the authoritative source for: share-count history → real dilution %; reverse-split history; going-concern language; filing timeliness; insider Forms 3/4/5.
- **FR-106 🔷** The system SHALL support Polygon.io and OTC Markets Group APIs behind the same interface (stubs exist; implementation gated on keys).
- **FR-107 🔷** Provider failover: on repeated primary-provider failure the system SHALL degrade to cached data with a visible staleness banner, never to fabricated data.

### 5.2 Continuous Scanning (FR-200)

- **FR-201 ✅** A standalone worker SHALL re-analyze the full configured universe every `SCAN_INTERVAL_SECONDS` (default 900s), independent of API traffic.
- **FR-202 ✅** Each scan cycle SHALL persist one immutable `Prediction` row per analyzed ticker (full AI Output Contract snapshot).
- **FR-203 ✅** Each scan cycle SHALL run the outcome evaluator (§5.5) after scanning.
- **FR-204 ✅** Analysis results SHALL be served from a short TTL cache (30s) so dashboard fan-out never triggers redundant recomputation; point-in-time callers (backtests) bypass the cache.
- **FR-205 🔷** At >500 tickers, the API SHALL read from persisted scan snapshots (Redis/DB read model) instead of computing on request; the worker becomes the only writer.

### 5.3 AI Output Contract (FR-300)

For every analyzed ticker the system SHALL return **all** of the following (schema: `schemas/stock.py::StockAnalysis`):

- **FR-301 ✅** Identity: ticker, company name, current price, OTC tier, sector.
- **FR-302 ✅** Six 0–100 scores: liquidity, manipulation risk, fundamental, technical, sentiment, catalyst; plus overall AI score and confidence score.
- **FR-303 ✅** Probability matrix: P(touch +5%), P(touch +10%), P(touch +20%) for each horizon in {5, 10, 20 trading days}, each in [0.01, 0.95].
- **FR-304 ✅** P(drawdown before upside): Monte-Carlo probability the path breaches −3% before first touching +5%.
- **FR-305 ✅** Trade plan: entry zone (low/high), ideal entry, stop loss (1.5×ATR), take-profits at 1R/2R/3.5R, maximum portfolio allocation % (risk-scaled, capped at 5%), expected risk/reward (probability-weighted, §5.3.1), estimated holding period.
- **FR-306 ✅** Plain-English explanation naming supporting factors, opposing factors, and manipulation warnings, always containing probabilistic-framing language.
- **FR-307 ✅** Ranked factor attribution (top ~6 features with direction bullish/bearish) derived from SHAP TreeExplainer with deterministic fallback.
- **FR-308 ✅** Itemized manipulation flags, each with machine code, severity 0–100, and a human-readable reason.

**FR-309 ✅ (5.3.1) Expected R:R definition.** Because take-profit levels are fixed R-multiples by construction, expected R:R SHALL be probability-weighted — Σ(tier R-multiple × Monte-Carlo touch probability) ÷ max(P(drawdown-first), 0.05) — so the figure varies with the ticker's actual volatility profile rather than being a structural constant.

**FR-310 ✅ Confidence definition.** Confidence SHALL blend inter-model agreement (45%), liquidity (20%), inverse manipulation risk (20%), and data-history depth (15%), clamped to [5, 97] so the platform can never display 0% or ≥98% certainty.

### 5.4 Manipulation Detection (FR-400)

- **FR-401 ✅** The system SHALL run eight independent, individually explainable rule detectors: pump-and-dump price/volume signature; volume-spike-without-catalyst; wash-trading proxy (volume z-score vs. flat price range); abnormal spread; toxic dilution (>50%/12m) and elevated dilution (>20%/12m); repeated reverse splits (≥2/3y); filing quality (delinquency, going-concern); promotional-news ratio (≥40% of coverage); low-liquidity trap (micro-float + sub-$25k/day).
- **FR-402 ✅** Rule severities SHALL combine via compounding odds — 1 − Π(1 − sᵢ/100) — so co-occurring red flags escalate rather than average out.
- **FR-403 ✅** An unsupervised IsolationForest anomaly score over rolling return/volume statistics SHALL be blended (30%) with the rule score (70%) to catch patterns no rule anticipates.
- **FR-404 ✅** Every active flag SHALL surface verbatim in the API, the stock screen, and assistant answers. A high score with hidden reasons is a product defect.
- **FR-405 🔷** With EDGAR integration, dilution/split/filing detectors SHALL consume real filing data instead of provider-supplied fields.

### 5.5 Prediction Lifecycle & Self-Grading (FR-500)

- **FR-501 ✅** Predictions are immutable once written; there is no update path.
- **FR-502 ✅** A prediction is *matured* when `holding_period_days` **traded bars** (not calendar days) exist after its creation timestamp.
- **FR-503 ✅** The evaluator SHALL grade each matured prediction exactly once (idempotent), recording: realized return at horizon; barrier touches of TP1/TP2/TP3; stop-loss hit; max drawdown. Same-bar stop/target ambiguity SHALL resolve to the stop (P5).
- **FR-504 ✅** `GET /predictions/calibration` SHALL return a bucketed reliability report (predicted P(+10%) vs. realized frequency, with per-bucket gap), overall stop rate, and average realized return.
- **FR-505 ✅** `GET /predictions/model-performance` SHALL summarize totals, TP1 hit rate, and stop rate; explicit empty-state note before outcomes exist.
- **FR-506 🔷** When ≥500 graded outcomes exist, the system SHALL re-fit isotonic calibrators on realized outcomes and register the artifact as a new `ModelVersion`; predictions SHALL always record the model version that produced them.

### 5.6 Machine Learning (FR-600)

- **FR-601 ✅** Probability estimation SHALL use an ensemble of ≥3 heterogeneous GBM families (LightGBM, XGBoost, CatBoost), one trio per return threshold. No single model's output is ever used alone.
- **FR-602 ✅** Ensemble disagreement (σ across the trio) SHALL feed the confidence score.
- **FR-603 ✅** Raw ensemble probabilities SHALL pass through isotonic calibration before display; in cold-start (no trained artifact), a documented feature-driven prior with shrink-toward-0.5 applies.
- **FR-604 ✅** The training pipeline SHALL build point-in-time features and forward-return labels with no lookahead, use a held-out split, report AUC per threshold, and persist versioned artifacts.
- **FR-605 ✅** All models SHALL consume one canonical, ordered feature vector (`ml/feature_vector.py`) shared verbatim between training and inference.
- **FR-606 🔷** Transformer-based text model (FinBERT-class) for news sentiment and promotion classification, replacing provider-supplied/neutral sentiment.
- **FR-607 🔷** Optuna-driven hyperparameter search producing versioned, reproducible study artifacts.
- **FR-608 🔷** Sequence forecaster (e.g., temporal fusion transformer) replacing the EWMA Monte-Carlo when real historical depth justifies it, behind `forecast_horizon_distribution`'s existing signature.

### 5.7 Backtesting (FR-700)

- **FR-701 ✅** The engine SHALL walk bar-by-bar with zero lookahead; indicators are precomputed causally (rolling/EWM) once per symbol.
- **FR-702 ✅** Execution modeling SHALL include: half-spread + slippage (bps) on every fill; commission (bps) per side; partial fills when order size >10% of bar dollar volume; randomized halt on gaps ≥30% (configurable probability); tiered exits 40/30/30 at TP1/2/3; stop-to-breakeven after TP1; stop-priority on same-bar ambiguity; forced close at max-hold or data end (delisting proxy).
- **FR-703 ✅** Reported metrics: Sharpe, Sortino, max drawdown, profit factor, expectancy/trade, win rate, average hold time, total return, trade log with exit reasons.
- **FR-704 ✅** Walk-forward split utility SHALL produce temporally ordered train/test folds.
- **FR-705 ✅** Backtests SHALL be runnable via API (`POST /backtest/run`) with configurable universe size, lookback, hold, position size, commission, slippage.
- **FR-706 🔷** Persist named backtest runs (`BacktestResult`/`BacktestTrade` tables exist) with a run-history screen.
- **FR-707 🔷** AI-strategy backtest mode: signals from the full scorer at sampled frequency (`ai_ensemble_signal` exists; needs a batch-scoring path to be practical).

### 5.8 Conversational Assistant (FR-800)

- **FR-801 ✅** Every answer SHALL be grounded in the same `StockAnalysis` object served to the dashboard — identical numbers on every surface.
- **FR-802 ✅** The assistant SHALL resolve ticker context from cashtags (`$XYZ`) or known-symbol tokens and persist it per session.
- **FR-803 ✅** Session history SHALL persist in the database and reload on reconnect.
- **FR-804 ✅** The assistant SHALL answer at minimum: should-I-buy (probabilistic reframing), biggest risks, catalysts, confidence level, invalidation conditions, similar setups (honest empty-state until history accumulates), position sizing, probability of success, bull case, avoid case.
- **FR-805 ✅** Two backends: deterministic template (default, offline) and Anthropic LLM (config-gated) whose system prompt hard-codes principles P1/P3/P6 and instructs refusal of guarantee requests.
- **FR-806 ✅** The assistant SHALL never output certainty language; guarantee requests are declined with an explanation.
- **FR-807 🔷** "Similar historical setups" SHALL query the outcomes store for nearest-neighbor feature matches once sufficient graded history exists.

### 5.9 Watchlist & Portfolio (FR-900)

- **FR-901 ✅** Users can add/remove tickers to a watchlist (idempotent add, 404 on removing absent).
- **FR-902 ✅** Users can record manual positions (ticker, quantity, average entry); open positions display live mark price and unrealized P/L%.
- **FR-903 ✅** Positions can be closed (status transition; no deletion — audit trail).
- **FR-904 🔷** Watchlist alerts: notify when a watched ticker's manipulation risk crosses a threshold or a new flag activates.
- **FR-905 🔷** Multi-user ownership of watchlists/portfolios (currently single-tenant; see FR-1100).

### 5.10 Dashboard & API (FR-1000)

- **FR-1001 ✅** REST API under `/api/v1` with OpenAPI docs at `/docs`; health endpoint reporting environment and active provider.
- **FR-1002 ✅** Endpoints: stocks (universe, analysis, ohlcv, news, fundamentals), scan (opportunities, heatmap, risk-monitor), predictions (log, history, model-performance, evaluate-outcomes, calibration), backtest (run), chat (message, history), watchlist (CRUD), portfolio (list/open/close), dashboard (summary).
- **FR-1003 ✅** Universe-wide endpoints SHALL parallelize per-ticker analysis (thread pool) and tolerate individual-ticker failures without failing the response.
- **FR-1004 🔷** WebSocket/SSE push for scan-cycle completion and risk-flag changes (currently poll-based).

### 5.11 Identity, Security & Multi-Tenancy (FR-1100) — all 🔷

- **FR-1101** Email+password and OAuth sign-in; JWT sessions (config scaffolding exists: secret, expiry, algorithm).
- **FR-1102** Per-user watchlists, portfolios, chat sessions; role-based admin (operator vs. user).
- **FR-1103** Rate limiting per user/IP on expensive endpoints (scan, backtest).
- **FR-1104** Audit logging of authentication and data-mutating events.
- **FR-1105** Secrets exclusively via environment/secret manager; no secrets in repo (`.env` gitignored; `.env.example` documented).

### 5.12 Operations & Quality (FR-1200)

- **FR-1201 ✅** Full stack SHALL boot via `docker compose up` (TimescaleDB, Redis, API, scan worker, web).
- **FR-1202 ✅** CI SHALL run backend tests and frontend lint+build on every push/PR.
- **FR-1203 ✅** Backend test suite SHALL cover: indicator math, manipulation rules (incl. synthetic pump-and-dump fixture), output-contract bounds, no-certainty invariants, backtest execution mechanics, outcome grading edge cases (same-bar tie, immaturity, idempotency), provider field mapping and failure modes over stubbed HTTP, API surface.
- **FR-1204 ✅** SQLite fallback SHALL allow full local/CI operation without Postgres; Timescale hypertable creation is idempotent and Postgres-only.
- **FR-1205 🔷** Structured logging with request IDs; metrics (Prometheus) for scan duration, provider error rates, cache hit rates; alerting on scan-cycle failure.

---

## 6. Screens

All screens share the app shell: fixed left sidebar (product mark, six navigation entries, permanent risk disclaimer) and a main content pane. Design system: token-driven palette (light/dark via `prefers-color-scheme` + explicit `data-theme` override), system-UI type stack, tabular numerals for all figures, status colors (good/warn/serious/critical) reserved for state — never decoration.

### 6.1 Dashboard (`/`)

**Job:** answer "what does the OTC universe look like right now, and where should I look first?" in under ten seconds.

Layout, top to bottom:

1. **Header** — title + one-line reminder that all scores are probability-based.
2. **Stat tile row (4)** — Universe scanned · Avg model confidence % · Watchlist count · Open positions. Large tabular numerals.
3. **Top opportunities card** — five highest overall-AI-score tickers; each row: ticker link → Stock Detail, confidence %, score pill color-coded by band (≥65 good / ≥45 warn / ≥25 serious / else critical).
4. **Risk monitor card** — five highest manipulation-risk tickers (score ≥50); ticker link + risk pill (≥70 critical / ≥45 serious / ≥20 warn).
5. **Sector rotation heatmap** — one cell per sector: sequential blue fill by average AI score, auto light/dark text by luminance, score + ticker count; legend strip low→high.

**States:** loading ("Scanning OTC universe…"); error (card with API-unreachable explanation + the technical detail); empty risk monitor ("No tickers currently flagged…").

**Interactions:** ticker click → Stock Detail; all data auto-fetched on mount (summary + heatmap in parallel).

### 6.2 Opportunities (`/opportunities`)

**Job:** ranked, filterable table of the entire scanned universe.

1. **Filter bar** — two sliders with live value readouts: *Min AI score* (0–100, default 0) and *Max manipulation risk* (0–100, default 100); **Refresh scan** button (clears table to loading state and refetches).
2. **Results table** — columns: Ticker (link, sector subline) · Price ($, 4dp) · AI score (pill) · Confidence % · Manipulation risk (pill) · P(+10%) at the primary horizon · Expected R:R (×) · Hold (days). Sorted by AI score descending. Horizontal scroll on narrow viewports (table container, never page body).

**States:** loading ("Scanning universe…"); empty after filtering ("No opportunities matched the current filters."); error (message in table region).

**Interactions:** sliders filter client-side instantly (no refetch); row hover highlight; ticker click → Stock Detail.

### 6.3 Stock Detail (`/stock/[ticker]`)

**Job:** the complete research dossier for one ticker; the screen a user reads top-to-bottom before deciding.

Two-column layout on wide screens (main 2/3, assistant rail 1/3):

1. **Header card** — ticker + AI-score pill + manipulation-risk pill; company name · tier · sector; large price; **+ Watchlist** button; the full plain-English explanation paragraph (FR-306).
2. **Component scores card** — six labeled meters (Technical, Fundamental, Sentiment, Catalyst, Liquidity → sequential-blue fills; Confidence → status-colored fill).
3. **Probability matrix card** — 3 horizons × 3 thresholds table + P(drawdown-before-upside) line + "statistical estimates, not guarantees" note (FR-303/304).
4. **Trade plan card** — Entry zone · Ideal entry · Stop loss (critical color) · TP1/TP2/TP3 (good color) · Max allocation · Expected R:R; holding-period + not-advice footnote (FR-305).
5. **Factor attribution card** — top factors as rows: label + ▲ bullish (good) / ▼ bearish (critical) (FR-307).
6. **Manipulation panel** — overall risk pill; each active flag as a sub-card: humanized code, severity, full reason sentence; explicit "No active manipulation flags detected." empty state (FR-308/404).
7. **Assistant rail (sticky)** — embedded chat pre-grounded on this ticker: suggestion chips ("Should I buy this?", "What are the biggest risks?", "How confident are you?", "What would invalidate this setup?", "What position size would you recommend?"), message log, input.

**States:** loading ("Loading analysis for {ticker}…" — also shown while a stale ticker's data is being replaced, guarded by ticker-match check); error (message, no partial render).

**Interactions:** watchlist add (idempotent, disabled while in flight); chip click sends that question; chat scrolls to newest; every number on this screen comes from the same analysis object the API serves (FR-801).

### 6.4 Watchlist (`/watchlist`)

1. **Add bar** — ticker input + **Add** button (uppercases, idempotent).
2. **List** — rows: ticker link · **Remove** (critical-colored text button).

**States:** loading; empty ("Your watchlist is empty."). **Interactions:** add via button; remove refetches list; ticker click → Stock Detail.

### 6.5 Portfolio (`/portfolio`)

1. **Open-position form** — Ticker · Quantity · Avg entry price · **Open position**.
2. **Positions table** — Ticker (link) · Qty · Avg entry · Current (live mark from provider) · Unrealized P/L% (good/critical by sign; "—" when mark unavailable — never invented, P2).

**States:** loading; empty ("No open positions."). **Interactions:** submit clears form and refetches; ticker click → Stock Detail.

### 6.6 Backtest (`/backtest`)

1. **Parameter bar** — Universe limit · Lookback days · Max hold days · Position size ($) · **Run backtest** (label switches to "Running…", disabled while in flight).
2. **Metric tile row (8)** — Sharpe · Sortino · Max drawdown · Profit factor · Win rate · Expectancy/trade · Avg hold · Total return (FR-703).
3. **Equity curve card** — SVG line chart: 2px accent line, 10% area wash, hairline gridlines, end dot with value label; hover → crosshair + point marker + tooltip (value + trade index); min/max footer.
4. **Trade log table** — Symbol (link) · Entry date/price · Exit price · P/L% (signed color) · Exit reason (tp1/tp2/tp3/stop/timeout, with "(halted)"/"(partial)" annotations) · Hold days.

**States:** initial (parameters only, no results section); running; error card. **Interactions:** parameter edits are local until Run; chart hover; symbol click → Stock Detail.

### 6.7 AI Assistant (`/chat`)

Full-screen version of the assistant rail: explanation of ticker grounding (cashtag syntax), message log (user right/accent, assistant left/plane), suggestion chips, input + Send.

**States:** empty-log hint; "Thinking…" placeholder while awaiting reply; error surfaced as an assistant-styled message. **Interactions:** ticker mention switches session context persistently (FR-802/803); Enter submits.

### 6.8 Planned screens 🔷

- **Model Performance (`/performance`)** — calibration reliability chart (predicted vs. realized per bucket, diagonal reference), outcome counts, stop rate, average realized return, model-version history. API already exists (FR-504/505); screen pending.
- **Sign in / Sign up** — email+OAuth; gated on FR-1100.
- **Settings** — provider status (active provider, key state, staleness), scan cadence, theme override, disclaimer re-acknowledgment.
- **Admin/Operator** — scan-cycle log, provider error rates, evaluation backlog, model registry.

---

## 7. Workflows

### 7.1 Continuous scan cycle (system)

1. Worker wakes on cadence → fetches universe from active provider.
2. Thread pool analyzes each ticker: OHLCV+meta+fundamentals+news → six feature engines → manipulation (rules ⊕ anomaly) → canonical feature vector → ensemble → calibration → Monte-Carlo probability matrix + downside-first → trade levels → probability-weighted R:R → SHAP attribution → narrative.
3. One `Prediction` row persisted per ticker (FR-202); analysis cache warmed (FR-204).
4. Outcome evaluator grades matured predictions (§7.3).
5. Cycle duration logged; sleep remainder of interval; individual-ticker failures logged and skipped (FR-1003).

### 7.2 User evaluates an opportunity (primary user journey)

1. Dashboard → notices ticker in Top Opportunities (or Risk Monitor).
2. Opportunities → tightens Max-manipulation-risk slider → confirms ticker survives.
3. Stock Detail → reads explanation → checks probability matrix vs. their own risk appetite → reviews manipulation panel (must be empty or acceptable) → reads trade plan.
4. Interrogates assistant: "what would invalidate this setup?" → receives stop level + dilution/promotion/liquidity invalidators.
5. Adds to Watchlist; optionally records the position in Portfolio after entering at their broker (outside Ven0X — NG1).
6. Later: Prediction History / calibration show how the platform's claims fared (trust loop, P4).

### 7.3 Prediction grading (system)

1. For each ungraded prediction: fetch history → take the first `holding_period_days` bars strictly after creation → if fewer exist, skip as immature.
2. Grade: TP touches by bar highs, stop by bar lows, same-bar tie → stop (P5); realized return from final close; max drawdown from lowest low.
3. Write `Outcome` (exactly once); calibration report updates on next read.

### 7.4 Backtest run (user)

Parameters → POST → engine walks each symbol (§FR-701/702) → report renders (tiles, curve, log) → user inspects exit-reason distribution to understand *why* performance is what it is (e.g., halt losses dominating).

### 7.5 Chat session

Message → ticker resolution (cashtag > known token > session context) → fresh analysis fetch → backend selection (LLM if configured, else template) → intent match → grounded reply persisted to session. History reload on return (FR-803).

### 7.6 Provider activation (operator)

Set `MARKET_DATA_PROVIDER` + key in `.env` → restart API + worker → `/health` reports the provider → on 403 (plan gap) endpoints return explicit `ProviderDataUnavailable` messages naming the endpoint (FR-103); operator verifies universe coverage before relying on it.

### 7.7 Model retraining (operator, partially 🔷)

`python -m app.services.ml.training_pipeline` → point-in-time dataset → train trio per threshold → holdout AUC report → versioned artifact + `ensemble_latest.pkl` → API picks up on restart. 🔷 Planned: scheduled retraining gated on accumulated real outcomes, with `ModelVersion` rows linking every prediction to its producing model (FR-506).

---

## 8. Interaction Catalogue

| Surface | Interaction | Result |
|---|---|---|
| Global | Click sidebar entry | Navigate; active entry highlighted |
| Global | OS theme change / `data-theme` set | Full token-level re-theme, both directions |
| Dashboard | Click ticker anywhere | Stock Detail |
| Opportunities | Drag either slider | Instant client-side refilter; value readout updates |
| Opportunities | Click Refresh scan | Table → loading → refetched results |
| Stock Detail | Click + Watchlist | Adds (idempotent); button disabled in flight |
| Stock Detail | Click suggestion chip | Sends that question to the embedded assistant |
| Backtest | Edit parameter fields | Local state only until Run |
| Backtest | Click Run backtest | Button → "Running…"; results replace on success; error card on failure |
| Charts (equity) | Pointer move | Crosshair + marker + tooltip (value, index) |
| Charts (equity) | Pointer leave | Hover layer hidden |
| Chat | Enter / Send | Message appended; "Thinking…"; reply appended; log autoscrolls |
| Chat | Mention `$TICKER` | Session context switches and persists |
| Watchlist | Add / Remove | List refetches; uppercased symbols; idempotent add |
| Portfolio | Open position / Close | Table refetches; closed positions retained with status (audit) |
| All tables | Hover row | Subtle accent wash |
| All interactive elements | Keyboard focus | Visible focus ring (accent outline) |

---

## 9. Non-Functional Requirements

### 9.1 Performance

- **NFR-P1 ✅** Cached single-ticker analysis: <50ms server time. Cold analysis: <2s.
- **NFR-P2 ✅** Full-universe scan (30 tickers, 8 workers): <15s; backtest of 15 symbols × 300 bars: <1s (O(n) causal indicator precomputation is a hard requirement — the O(n²) growing-window pattern is a regression).
- **NFR-P3 🔷** At 2,000 tickers: scan cycle <10 min on 4 vCPU; dashboard reads served entirely from the persisted read model (FR-205), p95 <300ms.

### 9.2 Scalability

- **NFR-S1 ✅** API is stateless (cache is an optimization, not correctness) → horizontal scaling behind a load balancer.
- **NFR-S2 ✅** Scan worker is a separate process/container from the API.
- **NFR-S3 🔷** Redis-backed shared cache and job queue when replica count >1.

### 9.3 Security & Compliance

- **NFR-SEC1 ✅** No secrets in repo; environment-only configuration.
- **NFR-SEC2 ✅** CORS restricted to configured origins.
- **NFR-SEC3 🔷** AuthN/AuthZ per FR-1100; TLS termination at ingress; per-user rate limits.
- **NFR-C1 ✅** "Not financial advice" + probabilistic framing embedded in: UI shell, trade plan, probability matrix, chat system prompt, README.
- **NFR-C2 ✅** The platform never instructs buy/sell; wording is always "probability-weighted setup for you to size against your own risk tolerance."

### 9.4 Reliability & Observability

- **NFR-R1 ✅** Single-ticker failure never fails a universe endpoint (FR-1003).
- **NFR-R2 ✅** Provider errors are typed and message-rich; health endpoint exposes environment + provider.
- **NFR-R3 🔷** Structured logs w/ request IDs; Prometheus metrics; scan-failure alerting (FR-1205).

### 9.5 Accessibility & UX quality

- **NFR-A1 ✅** Both themes designed (not auto-inverted); text tokens never wear data colors; status severity encoded by form (pill + dot) as well as hue.
- **NFR-A2 ✅** Keyboard-visible focus states; tables scroll within containers; tabular numerals in all numeric columns.
- **NFR-A3 🔷** Full WCAG 2.1 AA audit pass (contrast verification of pill-on-plane combinations, ARIA on charts).

### 9.6 Testing & Data Integrity

- **NFR-T1 ✅** All tests deterministic (seeded); no network in CI (stubbed HTTP transports).
- **NFR-T2 ✅** Grading and manipulation tests use hand-written explicit price paths — test data is a fixture, never a simulation of a simulation.
- **NFR-T3 ✅** Interface-compliance guarantee: every provider satisfies `MarketDataProvider`; adding a vendor cannot change downstream code.

---

## 10. Data Model (summary)

| Table | Purpose | Notes |
|---|---|---|
| `tickers` | Universe registry | tier, float, shares, reverse-split count |
| `ohlcv_bars` | Price time series | **Hypertable**; natural PK (ticker_id, ts, timeframe) |
| `predictions` | Immutable AI snapshots | Time-indexed; full output contract incl. JSON factor/horizon payloads |
| `outcomes` | Realized grades | 1:1 with matured predictions; TP/stop/drawdown/return |
| `model_versions` | Model registry | artifact path, metrics, hyperparameters |
| `news_items` | News/sentiment log | promotional + PR flags |
| `trades` | Live/paper trade log | independent of backtests |
| `backtest_results` / `backtest_trades` | Persisted runs | strategy config JSON + per-trade log |
| `chat_sessions` / `chat_messages` | Assistant memory | session key + ticker context |
| `watchlist_items` / `portfolio_positions` | User lists | single-tenant until FR-1100 |

---

## 11. Roadmap

### Phase 1 — Foundation ✅ (shipped)

Platform skeleton end-to-end: provider abstraction + synthetic data, six feature engines, manipulation detection, GBM ensemble + calibration + SHAP, Monte-Carlo forecasting, scoring contract, realistic backtester, chat assistant, 7-screen dashboard, Docker/CI, 30 tests.

### Phase 2 — Truth Loop ✅ (shipped)

Outcome evaluator + calibration reporting (FR-500); Finnhub live provider with honesty contract (FR-103/104); schema-correctness fixes; 47 tests.

### Phase 3 — Real-World Data Depth 🔷 (next)

1. **SEC EDGAR integration** (FR-105) — company facts XBRL for share-count history → *real* dilution %; filing index → delinquency; full-text going-concern detection; Forms 3/4/5 insider activity; reverse-split extraction. Free and keyless; unlocks manipulation detection on real fundamentals. **The single highest-value next increment.**
2. Finnhub key activation + OTC coverage verification; Polygon provider if coverage is insufficient (FR-106).
3. Provider failover + staleness surfacing (FR-107).
4. Model Performance screen consuming FR-504/505.

### Phase 4 — Learning at Full Depth 🔷

1. Scheduled recalibration on real outcomes + model-version stamping of predictions (FR-506).
2. FinBERT-class news classifier: sentiment + promotion detection (FR-606) feeding the promotional-campaign detector with real signal.
3. Optuna sweeps (FR-607); similar-setups retrieval for the assistant (FR-807).
4. Persisted backtest runs + AI-strategy backtest mode (FR-706/707).

### Phase 5 — Multi-User Product 🔷

1. AuthN/AuthZ, per-user data, rate limits, audit log (FR-1100 block).
2. Read-model architecture for >500-ticker universes (FR-205); Redis shared cache (NFR-S3).
3. Push updates (FR-1004); watchlist alerting (FR-904).
4. Observability stack (FR-1205); WCAG audit (NFR-A3).

### Phase 6 — Scale & Hardening 🔷

Cloud deployment (managed Postgres+Timescale, container orchestration), load testing to thousands of concurrent users, cost-optimized data-vendor tiering, disaster recovery, SOC2-track security review.

### Explicitly deferred / rejected

- Order execution & broker integration — rejected (NG1).
- Social features — rejected (NG5).
- Intraday HFT signals — deferred indefinitely (NG3).
- Mobile native apps — deferred; responsive web is the v1 mobile answer.

---

## 12. Open Questions

| # | Question | Owner | Blocking |
|---|---|---|---|
| Q1 | Finnhub free-tier OTC candle coverage adequate, or move straight to Polygon paid? | Operator (needs key) | Phase 3.2 |
| Q2 | Retention policy for predictions/outcomes at 2,000 tickers × 96 cycles/day? (Partitioning/rollups) | Eng | Phase 5 |
| Q3 | LLM chat backend default-on for all users (cost) or premium tier? | Product | Phase 5 |
| Q4 | Jurisdictional disclaimer review (US vs. non-US users) before public launch | Legal | Phase 6 |

---

## 13. Glossary

| Term | Definition |
|---|---|
| **OTC tier** | OTC Markets classification (QX / QB / Pink / Pink Limited / Expert Market) reflecting disclosure level |
| **Barrier-touch probability** | P(price trades at/through a level at any point in the window) — matches trader experience of a target, vs. terminal-return probability |
| **Calibration** | Agreement between stated probabilities and realized frequencies; a 30% claim should come true ~30% of the time |
| **Matured prediction** | A prediction with ≥ holding-period traded bars after its timestamp — gradable |
| **Same-bar rule** | When one bar spans both stop and target, the stop is deemed hit first (conservative, P5) |
| **Pump-and-dump signature** | Rapid run-up on multi-x volume followed by sharp reversal — detector FR-401 |
| **Toxic financing** | Convertible instruments whose conversion discounts incentivize dilution-driven price collapse |
| **Float** | Shares available for public trading (≤ outstanding); micro-floats enable manipulation |
| **R-multiple** | Profit/loss expressed in units of initial risk (entry − stop) |
| **Expectancy** | Mean P/L per trade: win-rate × avg win + loss-rate × avg loss |
| **Walk-forward validation** | Sequential train→test folds preserving temporal order; prevents lookahead leakage |
| **Read model** | Denormalized, query-optimized projection of scan results serving reads at scale |
