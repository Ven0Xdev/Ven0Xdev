# Architecture

## Layering

```
┌─────────────────────────────────────────────────────────────┐
│ frontend/ (Next.js)                                          │
│   pages fetch from lib/api.ts -> FastAPI JSON                │
└─────────────────────────────────────────────────────────────┘
                              │ HTTP (NEXT_PUBLIC_API_URL)
┌─────────────────────────────────────────────────────────────┐
│ backend/app/api/v1/endpoints/*  (FastAPI routers, DI only)   │
├─────────────────────────────────────────────────────────────┤
│ backend/app/services/scoring/scorer.py                       │
│   the single composition point: features + ML -> AI output   │
├───────────────┬───────────────┬───────────────┬──────────────┤
│ services/      │ services/ml/  │ services/     │ services/    │
│ features/      │ ensemble,     │ backtest/     │ chat/        │
│ technical,     │ calibration,  │ engine,       │ assistant,   │
│ fundamental,   │ explainability│ broker_sim,   │ memory       │
│ sentiment,     │ anomaly,      │ metrics       │              │
│ catalyst,      │ forecasting,  │               │              │
│ manipulation,  │ training_     │               │              │
│ liquidity      │ pipeline      │               │              │
├───────────────┴───────────────┴───────────────┴──────────────┤
│ services/data_providers/  (MarketDataProvider interface)      │
│   mock_provider.py (default) | real_providers.py (stubs)      │
├─────────────────────────────────────────────────────────────┤
│ db/models/  (SQLAlchemy, TimescaleDB hypertables on Postgres) │
└─────────────────────────────────────────────────────────────┘
```

Every router depends only on `services/*` and `db/session.py` via FastAPI
`Depends`. No router touches SQLAlchemy models or the data-provider layer
directly except through those services — this is what keeps a real data
vendor swap, or a new ML model, a one-directory change.

## Why a mock data provider

OTC market data — Level II quotes, SEC EDGAR full-text search, OTC Markets
Group tier/disclosure data, licensed news/social sentiment — is behind paid
APIs this environment has no credentials for. Building the whole platform
against `MarketDataProvider` (an abstract interface: `get_universe`,
`get_ohlcv`, `get_quote`, `get_fundamentals`, `get_news`,
`get_corporate_actions`) means the mock and a real vendor are
interchangeable at a single factory function
(`services/data_providers/factory.py`). The mock provider is not random
noise — it's a seeded generator with named regimes (clean uptrend,
downtrend, accumulation breakout, pump-and-dump, illiquid chop) so the
manipulation detector, backtest engine, and ML pipeline all have realistic,
reproducible structure to work against.

## Why the ensemble is 3 GBMs, not 1

LightGBM, XGBoost, and CatBoost are trained independently per return
threshold (+5/+10/+20%) and averaged; the *disagreement* between the three
(`EnsemblePrediction.agreement_score`) directly feeds the platform's
confidence score. A single model can be confidently wrong; measuring
inter-model disagreement is a cheap, real signal for "the models don't
actually agree here, discount the probability."

## Why manipulation risk is rule-based + statistical, not one score

A single learned "manipulation score" is an unauditable black box in a
domain where false negatives have real financial consequences. Instead,
`services/features/manipulation.py` runs eight independent, individually
inspectable heuristics (pump-and-dump price/volume pattern, wash-trading
proxy, abnormal spread, toxic dilution, repeated reverse splits, filing
delinquency/going-concern, promotional-news ratio, low-liquidity trap), each
producing a severity and a plain-English reason. These combine with an
`IsolationForest` anomaly score (`services/ml/anomaly.py`) via a
non-linear "compounding risk" formula (`1 - Π(1 - severity_i)`), so multiple
co-occurring red flags compound rather than average out. Every flag that
fires is surfaced to the user and the chat assistant verbatim.

## Why the backtest engine precomputes indicators once per symbol

Indicators built on `.rolling()`/`.ewm()` are causal by construction — the
value at row *i* only ever depends on rows `<= i`. The engine used to
recompute all indicators from scratch on `df.iloc[:i+1]` at every bar
(`O(n^2)` per symbol); `technical.compute_technical_series` computes the
same causal indicators for the whole series in one vectorized pass, and the
engine indexes into it (`O(n)`). This is a 100x+ speedup with byte-identical
backtest results (see git history), not a behavior change — it does not
introduce lookahead bias, since the indicators were already causal.

## Why `expected_risk_reward` is probability-weighted, not price-ratio

The tiered take-profit levels are fixed R-multiples (1R / 2R / 3.5R) by
construction, so a plain price-ratio "reward / risk" is mathematically
*constant* across every ticker — it would look like an AI-derived number
but actually be structural geometry. `scorer._expected_risk_reward` instead
weights each tier's R-multiple by its own Monte-Carlo barrier-touch
probability (how likely *this* ticker's volatility is to actually reach
that target within the holding period) divided by the probability of
drawdown-before-upside, so it varies meaningfully per ticker and is honestly
"expected," not just geometric.

## Continuous scanning vs. on-demand scoring

`analyze_ticker` runs the full feature + ensemble + SHAP + Monte Carlo
pipeline — too expensive to run synchronously on every dashboard request
against the whole universe. Two mitigations, matching how this would run in
production:

1. A 30-second in-process TTL cache in `scorer.py`, keyed by symbol, active
   only for calls against the live singleton provider (backtests and other
   point-in-time callers always bypass it).
2. `app/workers/scan_scheduler.py`: a standalone process (its own
   docker-compose service) that continuously re-scans the universe on
   `SCAN_INTERVAL_SECONDS` and logs `Prediction` snapshots — the dashboard
   should eventually read from these persisted snapshots rather than
   triggering computation on read, at real scale (Redis-cached read model).

## The outcome evaluation loop (learning from predictions)

`services/evaluation/outcome_evaluator.py` closes the prediction →
realized-outcome loop. Once a logged `Prediction`'s horizon has fully
matured (measured in traded bars, not calendar days), the evaluator replays
actual price history over that window and grades it: did price *touch*
+5/10/20% (matching how the probabilities are defined), did the stop get
hit first (same-bar ties conservatively go to the stop, identical to the
backtest engine's rule), realized return and max drawdown. It runs
automatically each scan cycle, is idempotent (one Outcome per prediction),
and feeds `GET /api/v1/predictions/calibration` — a reliability report of
predicted probability vs. realized frequency per bucket, which is the
honest measure of whether the platform's probabilities mean anything. As
real outcomes accumulate, this is also the dataset for re-fitting the
isotonic calibrators on reality instead of training data.

## Real market data: Finnhub provider

`services/data_providers/finnhub_provider.py` is a complete
`MarketDataProvider` over Finnhub's REST API, behind a token-bucket rate
limiter (default 55 calls/min, under the free tier's 60) and a per-fact TTL
cache so the full scan pipeline can point at it without tripping 429s.
Activate with `MARKET_DATA_PROVIDER=finnhub` + `FINNHUB_API_KEY`.

Its honesty contract matters more than its plumbing: bid/ask depth,
dilution history, going-concern and filing-delinquency flags are **not
available** from Finnhub, so they are reported as explicitly-neutral
defaults and `Quote.bid/ask` are `None` — never approximated. Per the
platform's no-fabricated-market-data rule, spread- and filing-based signals
degrade visibly rather than silently running on invented numbers. The SEC
EDGAR integration is the designated source for those fields.

## What's still stubbed for a production deployment

- **Polygon / OTC Markets providers**
  (`services/data_providers/real_providers.py`): interfaces defined, vendor
  calls not implemented (needs API keys).
- **SEC EDGAR filings / insider Form 3/4/5**: the designated real source for
  dilution history, going-concern and delinquency flags, float vs.
  outstanding, and reverse-split history; a real EDGAR full-text-search +
  XBRL parser is not implemented.
- **Text/transformer sentiment model**: `services/features/sentiment.py`
  consumes provider-supplied per-article sentiment; a real deployment would
  run a FinBERT-style classifier over live news/social text. The Finnhub
  provider deliberately reports neutral sentiment rather than keyword-guessing.
- **Automatic recalibration**: outcomes now accumulate via the evaluator;
  the remaining step is a scheduled job that re-fits
  `services/ml/calibration.py` on realized outcomes once enough have
  accumulated, and versions the result via `ModelVersion`.
