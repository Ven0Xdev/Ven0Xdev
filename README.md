# Nexora — AI Financial Intelligence Platform

An AI-powered multi-asset market research platform covering stocks, ETFs,
indices, commodities, and precious metals: continuous scanning,
probability-based opportunity ranking, manipulation detection, explainable
ML, realistic backtesting, and a conversational research assistant. Every
output is probabilistic — the platform never claims certainty about future
price movement.

An optional, disabled-by-default OTC/micro-cap module (see "Optional: OTC
module" below) preserves the platform's original OTC penny-stock research
tooling for future re-activation.

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
cp .env.example .env
uvicorn app.main:app --reload  # http://localhost:8000, docs at /docs

# Frontend (separate shell)
cd frontend
npm install
cp .env.example .env.local
npm run dev  # http://localhost:3000
```

### Windows (Git Bash)

Same steps, two differences: the venv activation script lives under `Scripts/`
(not `bin/`, which is the Linux/macOS layout), and `python3` is usually just
`python` on Windows.

```bash
# Backend
cd nexora/backend
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload

# Frontend (separate Git Bash window)
cd nexora/frontend
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. No API keys are required — it runs on
synthetic demo data out of the box (see "Data providers" below). If `python`
isn't found, try `python3` or `py -3` instead, depending on how Python was
installed.

No API keys are required to run the full platform end to end — see
"Data providers" below.

## Quickstart (Docker Compose)

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

This starts TimescaleDB, Redis, the API (`:8000`), and the web dashboard
(`:3000`). The optional OTC-module scanner worker does **not** start by
default — see "Optional: OTC module" below.

## Asset universe

The mainstream platform tracks a configurable universe of symbols managed
through the **Asset Universe Manager** (`GET/POST/PATCH/DELETE
/api/v1/universe`, backed by `services/universe/manager.py` and the `assets`
DB table), seeded by default with:

`AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA, AMD, NFLX, AVGO, SPY, VOO, QQQ,
DIA, IWM, GLD, IAU, SLV, XLK, XLE`

Supported asset types today: `STOCK`, `ETF`, `INDEX`, `COMMODITY`,
`PRECIOUS_METAL`. `FOREX`, `CRYPTO`, and `OTC_STOCK` are recognized taxonomy
members reserved for future expansion — the universe API rejects creating
entries with those types for now. The universe is never hardcoded into
individual endpoints; every mainstream surface (`/dashboard/summary`,
`/scan/opportunities`, `/scan/heatmap`, `/scan/risk-monitor`,
`/scan/multi-asset/prescan`) reads it from the database at request time.

## Data providers — mock vs. real

Real market data (quotes, OHLCV history, fundamentals, news) requires paid
vendor API keys this environment doesn't have. The platform ships with
`MockOTCProvider` (`backend/app/services/data_providers/mock_provider.py`):
a deterministic synthetic data generator that produces statistically
realistic penny-stock behavior — clean uptrends/downtrends, accumulation
breakouts, pump-and-dump patterns, and illiquid chop — seeded per symbol so
results are reproducible. It only recognizes its own ~30 fictional demo
tickers, not mainstream symbols like AAPL — the platform never fabricates
data for a real-market ticker it can't actually price.

Every other service (feature engineering, ML scoring, manipulation
detection, backtesting, the chat assistant) talks only to the
`MarketDataProvider` interface in `base.py`. To go live on the mainstream
asset universe:

1. Get a free API key from [Twelve Data](https://twelvedata.com/pricing)
   (primary) and, optionally, [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
   (automatic fallback on any Twelve Data failure).
2. Set `TWELVE_DATA_API_KEY` and `ALPHA_VANTAGE_API_KEY`, and
   `MARKET_DATA_PROVIDER=twelvedata`, in `.env`. Keys are backend-only —
   never sent to or read by the frontend.
3. Every response is labeled with its `data_mode`: `live`/`delayed` (fresh
   vendor call), `cached` (served from the local TTL cache), or the
   endpoint returns a structured 503 (`provider_unavailable`) if every
   configured vendor fails — never fabricated data.

No other code changes are required — scoring, backtesting, and the API
contract are provider-agnostic. `services/data_providers/real_providers.py`
also has unimplemented Polygon/OTC Markets stubs for future providers.

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

Manipulation detection is deliberately **not** a single black-box score:
rule-based flags — pump-and-dump pattern, wash-trading heuristic, abnormal
spread, delinquent filings/going-concern, low-liquidity traps
(`services/features/manipulation.py`) — are combined with the statistical
anomaly score, and every flag carries a plain-English reason. OTC-specific
flags (toxic dilution, repeated reverse splits, promotional-news campaigns)
live separately in `services/otc/manipulation.py`, part of the optional OTC
module below — diagnostic for thinly-traded penny stocks, but essentially
always-inactive noise for mainstream large-cap stocks/ETFs.

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

## Scanning

The mainstream platform scans the Asset Universe Manager's active assets
on demand: `GET /scan/opportunities`, `/scan/heatmap`, `/scan/risk-monitor`,
and `/scan/multi-asset/prescan` (the deterministic two-stage scanner +
quality gates) all read live. The API also keeps a short in-process TTL
cache (30s) on `analyze_ticker` so requests hitting the same universe don't
redundantly rerun the full feature + ensemble + Monte Carlo pipeline.

The original **continuous background scanner** (`app/workers/scan_scheduler.py`,
a loop on `SCAN_INTERVAL_SECONDS`, default 900s, that logs a `Prediction`
snapshot per ticker per cycle) is part of the optional OTC module — see
below.

## Optional: OTC module

Nexora's original product surface was an OTC/micro-cap penny-stock scanner.
That tooling still exists, isolated and **disabled by default**, so it can
be re-activated for a future OTC product surface without being part of the
mainstream experience:

- `services/otc/manipulation.py` — toxic-dilution, repeated-reverse-split,
  and promotional-news-campaign detection.
- `app/workers/scan_scheduler.py` — the continuous scanner loop, gated
  behind `OTC_MODULE_ENABLED` (exits immediately on start if unset/false).
- The docker-compose `scanner` service, gated behind the `otc` Compose
  profile (`docker compose --profile otc up`).
- `MockOTCProvider`, the `Ticker`/`OHLCVBar` DB tables, and the
  `/scan/run-cycle` · `/scan/cycles` · `/scan/cycles/{id}/decisions`
  endpoints (still reachable, but only meaningful once the module is
  enabled and driven by the scanner above).

Set `OTC_MODULE_ENABLED=true` in `backend/.env` to re-enable the worker.
No data or endpoints were deleted in the move to a mainstream-first
platform — everything above remains fully functional, just off by default.

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
All securities carry manipulation, liquidity, and market risk — OTC/
micro-cap names (when the optional OTC module is enabled) carry
elevated versions of all three. Nothing here should be treated as a
guarantee of any outcome.
