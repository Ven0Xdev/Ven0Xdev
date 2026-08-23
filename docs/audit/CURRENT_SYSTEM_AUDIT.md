# Current System Audit

Audit date: 2026-07-12 · Branch `claude/otc-ai-trading-platform-7i3zon` · 107 backend tests
Method: repository inspection + grep verification + test-suite state. Nothing below is claimed from memory; frontend gaps were verified by searching for actual API consumers.

Legend — **E2E**: wired from UI to backend to data layer. **Data**: real / synthetic / static / generated. **Prod-ready**: could serve real users as-is.

| # | Area | Works | E2E | Data | Provider | Source+timestamp in output | Tests | Prod-ready | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Ticker search & validation | ❌ | ❌ | — | — | — | ❌ | ❌ | **No search endpoint, no UI search box, no validation.** Worse: mock provider *fabricates* meta for any unknown symbol (`get_ticker_meta` auto-creates) → analysis of nonsense tickers succeeds. P0. |
| 2 | Stock information card | ✅ | ✅ | per provider | mock / finnhub+edgar | ❌ **no `as_of`, no `data_source`, no data-mode label** | ✅ (API) | ⚠️ | UI works but user cannot tell synthetic from live data — violates "never silently use demo data". P0. |
| 3 | Interactive chart | ❌ | ❌ | — | — | — | ❌ | ❌ | `GET /stocks/{s}/ohlcv` exists and is tested, but **no frontend consumer** — the app has no price chart (only the backtest equity curve). Entry/stop/targets shown as numbers only. |
| 4 | Market-data providers | ✅ | ✅ | mixed | registry: mock ✅, finnhub ✅ (user key verified live), polygon/otc_markets/alpaca = registered-unimplemented (fail loud), EDGAR ✅ ingester | provider name not propagated into analysis responses | ✅ 15 | ⚠️ | Registry clean; honest failures. Gap: no failover, no staleness banner (FR-107). |
| 5 | AI Assistant | ✅ | ✅ | derived from provider | scoring pipeline | partial (epistemic footer, no timestamps) | ✅ | ⚠️ | Template backend: deterministic, zero hallucination. LLM backend: implemented, **never run against live Anthropic API** (no key) — untested path, must not be claimed working. |
| 6 | Tool calling | ✅ | backend-only | live services | 6 local tools | in tool payloads partially | ✅ 6 | ⚠️ | Executors tested; agentic loop logic tested only structurally. |
| 7 | OTC scanner | ✅ | backend-only | per provider | scorer + gates | cycle timestamps ✅ | ✅ 6 | ⚠️ | Cycles+decisions with reasons persisted. **No UI for scanner history.** |
| 8 | Risk engine | ✅ | partial | derived | scorer/agents | ❌ | ✅ | ⚠️ | Composite risk, invalidations, sizing ceilings all computed+tested; surfaced in UI only as numbers on stock page. |
| 9 | Manipulation detection | ✅ | ✅ | derived (8 rules + IsolationForest) | price/volume/news/fundamentals | ❌ | ✅ 7 | ⚠️ | Real strength depends on real inputs: with Finnhub, promo-news flag runs on `is_promotional=False` placeholders (classifier not built) and dilution comes from EDGAR only after worker runs. |
| 10 | Entry / stop / targets | ✅ | ✅ (numbers) | derived (ATR-based) | scorer | ❌ | ✅ | ⚠️ | Strict-ordering DB constraint; sub-penny rounding fixed. Not drawn on any chart (see #3). |
| 11 | News | ✅ API | ❌ UI | mock: generated; finnhub: real | provider | per-article timestamps ✅, sentiment on finnhub = neutral placeholder (honest) | ✅ | ⚠️ | **No frontend news display anywhere.** |
| 12 | Filings (EDGAR) | ✅ | backend-only | **real** (sec.gov, keyless) | EDGAR ingester | `fetched_at` ✅, filing dates ✅ | ✅ 8 | ✅ backend | Real dilution %, delinquency. Runs in worker; not surfaced in UI. |
| 13 | Database | ✅ | ✅ | — | Postgres+Timescale / SQLite fallback | — | ✅ | ⚠️ | Alembic (2 migrations, drift-checked), CHECK constraints, unique outcome. Dev default is SQLite — fine; compose Postgres path not re-verified in this sandbox. |
| 14 | Prediction history | ✅ API | ❌ UI | own store | predictions/outcomes tables | `created_at` ✅ | ✅ | ⚠️ | Log/history/calibration/model-performance endpoints tested; no UI page. |
| 15 | Backtesting | ✅ | ✅ | per provider | engine + walkforward | ❌ run timestamps not persisted (results not saved to DB) | ✅ 6 | ⚠️ | Costs/halts/partial fills/delisting/walk-forward/calibration all real. Runs are not persisted (tables exist, unused). |
| 16 | Paper trading | ⚠️ | ✅ | manual entries + live marks | portfolio tables | opened_at ✅ | ✅ | ⚠️ | Manual position log with live marks + P/L — not simulated fills/orders. Honest label: position tracker, not paper-trading engine. |
| 17 | Authentication | ❌ | — | — | — | — | ❌ | ❌ | **None.** Single-tenant, open API. Acceptable for localhost only. Design exists (SYSTEM-ARCHITECTURE §6). |
| 18 | API security | ⚠️ | — | — | — | — | ❌ | ❌ | CORS restricted to localhost:3000; secrets via env (good). No auth, no rate limits, no request size caps, docs endpoint open. See SECURITY_GAPS.md. |
| 19 | Deployment readiness | ⚠️ | — | — | — | — | CI ✅ | ⚠️ | Compose (timescale/redis/api/scanner/web) + Dockerfiles + CI exist. Compose stack not end-to-end verified inside this sandbox; alembic not wired into compose startup (uses create_all). |
| 20 | Logging & monitoring | ✅ | backend-only | own store | monitoring service | report `generated_at` ✅ | ✅ 8 | ⚠️ | PSI drift, calibration alerts, provider counters, scanner freshness, latency p50/p95, DB ping. Plain-text logs (no request IDs); no UI. |

## Known bugs (open)

1. **Mock fabricates unknown tickers** (mock_provider.py:85) — any string becomes a "company". Fix in P0 slice.
2. **Backtest `start_date/end_date` config clips data but UI never sends them; delisting is modeled only as data-end** — documented behavior, not a crash.
3. `chat` ticker detection can capture generic uppercase words if they collide with a real symbol (low impact).
4. Prediction rows written by `/predictions/log/{symbol}` for tickers outside the universe (with mock fabrication) pollute history — resolved by fix #1.

## Verified-working test summary

`pytest app/tests -q` → **107 passed** (indicators, manipulation, scorer contract, backtest mechanics, outcome grading, EDGAR, providers/registry, reasoning engine, scanner v2, champion/challenger, chat tools, walk-forward, portfolio intel, monitoring). Frontend: `next build` + eslint clean. LLM live path and docker-compose stack are explicitly **not** covered by tests.
