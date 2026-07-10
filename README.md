# Ven0X — OTC AI Intelligence Platform

An AI-powered research platform for OTC (over-the-counter) stocks: continuous
scanning, probability-based opportunity ranking, manipulation detection,
explainable ML, realistic backtesting, and a conversational research
assistant. Every output is probabilistic — the platform never claims
certainty about future price movement.

This is not a signal service. It's a decision-support tool: it scores,
explains, and estimates risk; it never promises an outcome.

## What's here

```
backend/    FastAPI + SQLAlchemy + LightGBM/XGBoost/CatBoost + SHAP backend
frontend/   Next.js 16 (App Router) + TypeScript + Tailwind dashboard
docs/       Architecture notes
docker-compose.yml   Full stack: TimescaleDB, Redis, API, scanner, web
```

## Quickstart (local, no Docker)

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload  # http://localhost:8000, docs at /docs

# Frontend (separate shell)
cd frontend
npm install
npm run dev  # http://localhost:3000
```

No API keys are required to run the full platform end to end — see
"Data providers" below.

## Quickstart (Docker Compose)

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

This starts TimescaleDB, Redis, the API (`:8000`), a continuous background
scanner worker, and the web dashboard (`:3000`).

## Data providers — mock vs. real

OTC market data (Level II, SEC EDGAR filings, OTC Markets disclosures,
licensed news/sentiment) requires paid vendor API keys this environment
doesn't have. The platform ships with `MockOTCProvider`
(`backend/app/services/data_providers/mock_provider.py`): a deterministic
synthetic data generator that produces statistically realistic penny-stock
behavior — clean uptrends/downtrends, accumulation breakouts, pump-and-dump
patterns, and illiquid chop — seeded per symbol so results are reproducible.

Every other service (feature engineering, ML scoring, manipulation
detection, backtesting, the chat assistant) talks only to the
`MarketDataProvider` interface in `base.py`. To go live:

1. Get an API key from Polygon.io, Finnhub, or OTC Markets Group.
2. Implement the corresponding class in `services/data_providers/real_providers.py`
   (stubs are already wired into the factory).
3. Set `MARKET_DATA_PROVIDER` and the matching `*_API_KEY` in `.env`.

No other code changes are required — scoring, backtesting, and the API
contract are provider-agnostic.

## AI output contract

Every analyzed ticker (`GET /api/v1/stocks/{symbol}/analysis`) returns:

- Ticker, company name, current price
- Liquidity, manipulation risk, fundamental, technical, sentiment, catalyst,
  overall AI, and confidence scores (0–100)
- A probability matrix: P(+5%/+10%/+20%) across 5/10/20 trading-day horizons
- Probability of downside before upside
- Suggested entry zone, ideal entry, stop loss, take-profit 1/2/3
- Max suggested portfolio allocation, expected risk/reward, holding period
- A plain-English explanation, ranked bullish/bearish factors (SHAP-derived),
  and any active manipulation flags with reasons

See `backend/app/schemas/stock.py` for the exact contract and
`backend/app/services/scoring/scorer.py` for how it's assembled.

## Machine learning

- **Ensemble**: LightGBM + XGBoost + CatBoost per return-threshold (+5/+10/+20%),
  averaged and isotonic-calibrated (`services/ml/ensemble.py`,
  `services/ml/calibration.py`). Falls back to a feature-driven heuristic
  prior before any model has been trained on real outcomes (cold start).
- **Explainability**: SHAP `TreeExplainer` over the LightGBM leg, with a
  deterministic fallback if `shap` isn't available (`services/ml/explainability.py`).
- **Anomaly detection**: `IsolationForest` over rolling return/volume
  statistics, blended into the manipulation-risk score (`services/ml/anomaly.py`).
- **Forecasting**: EWMA-volatility Monte Carlo for horizon return
  distributions and barrier-touch probabilities (`services/ml/forecasting.py`).
- **Training pipeline**: `python -m app.services.ml.training_pipeline` builds
  point-in-time features + forward-return labels from the data provider's
  history and trains/persists a versioned ensemble artifact.

Manipulation detection is deliberately **not** a single black-box score: rule-based
flags (pump-and-dump pattern, wash-trading heuristic, abnormal spread, toxic
dilution, repeated reverse splits, delinquent filings, promotional news
ratio, low-liquidity traps — `services/features/manipulation.py`) are
combined with the statistical anomaly score, and every flag carries a
plain-English reason.

## Backtest engine

`services/backtest/engine.py` walks bar-by-bar with no lookahead (all
indicators are precomputed once per symbol using causal rolling/EWM series —
see `technical.compute_technical_series`), simulating tiered take-profit
exits (40%/30%/30% across TP1/TP2/TP3, stop moved to breakeven after TP1),
spread + slippage + commission costs, partial fills when order size exceeds
~10% of bar dollar volume, and randomized trading halts on large gaps
(`services/backtest/broker_sim.py`). Reports Sharpe, Sortino, max drawdown,
profit factor, expectancy, win rate, and average hold time
(`services/backtest/metrics.py`), plus a walk-forward split utility.

Run via `POST /api/v1/backtest/run` or the **Backtest** page in the dashboard.

## Chat assistant

`services/chat/assistant.py` grounds every answer in the same
`StockAnalysis` object the API and dashboard use — it narrates real computed
scores, never invents numbers. Two backends:

- `template` (default): fully offline, deterministic, pattern-matches the
  question against the analysis object.
- `llm`: routes to Anthropic (`ANTHROPIC_API_KEY` + `CHAT_MODEL`) with the
  analysis JSON as grounding context and hard guardrails against certainty
  claims, baked into the system prompt.

Session history persists via `ChatSession`/`ChatMessage` in the database.

## Continuous scanning

`app/workers/scan_scheduler.py` runs a loop (`SCAN_INTERVAL_SECONDS`,
default 900s) that re-analyzes the full OTC universe and logs a `Prediction`
snapshot per ticker per cycle — this is what prediction-history and
model-performance tracking (`GET /api/v1/predictions/model-performance`) are
built on, and what future outcome-based recalibration will consume. The API
also keeps a short in-process TTL cache (30s) on `analyze_ticker` so
dashboard/scan endpoints hitting the same universe don't redundantly rerun
the full feature + ensemble + Monte Carlo pipeline.

## Database

PostgreSQL via SQLAlchemy models in `app/db/models/`; `OHLCVBar`,
`Prediction`, and `NewsItem` are converted to TimescaleDB hypertables at
startup (`db/session.py::init_timescale_hypertables`, a no-op on the SQLite
dev/test fallback). Tables: tickers, OHLCV bars, predictions, outcomes,
model versions, news, trades, backtest results/trades, chat sessions/messages,
watchlist, portfolio positions.

## Testing

```bash
cd backend
source .venv/bin/activate
pytest app/tests -q
```

30 tests cover technical indicators, manipulation detection (including a
synthetic pump-and-dump fixture), the scoring pipeline's full AI-output
contract, the backtest engine's execution mechanics, and the API surface.

## Tech stack

**Backend**: Python, FastAPI, SQLAlchemy, Pydantic
**ML**: LightGBM, XGBoost, CatBoost, scikit-learn, SHAP, PyTorch/Transformers
(text-model plug point), Optuna (hyperparameter tuning plug point)
**Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4
**Database**: PostgreSQL + TimescaleDB, Redis
**Infra**: Docker Compose, GitHub Actions CI

## Disclaimer

This platform produces probabilistic research output, not investment advice.
OTC micro-caps carry elevated manipulation, dilution, and liquidity risk.
Nothing here should be treated as a guarantee of any outcome.
