# Nexora — Beta Hardening Implementation Progress

Continuation ledger for the multi-phase "advanced MVP → safe, verifiable, real-data,
paper-trading-ready beta" effort. Update this file after every completed phase (or
meaningful chunk of one). A new session should read this file before re-auditing
anything.

---

## Current phase

**Phase 3 — security hardening** — complete (3.1, 3.2, 3.3, see below). Ready
to start **Phase 4 — unified risk/signal policy engine** next.

Phase 1 (1.1/1.3 implemented, 1.2 honestly blocked) and Phase 2 (2.1, 2.2) —
both done. See their entries further down for full detail.

## Baseline (Phase 0 — completed 2026-08-14)

- Branch: `claude/otc-ai-trading-platform-7i3zon`
- HEAD at start of this effort: `b4ab461` (exactly the last audited commit — `git diff --stat b4ab461 HEAD` was empty, `git log b4ab461..HEAD` was empty). Working tree was clean.
- Repo instruction files checked: `frontend/CLAUDE.md` → `frontend/AGENTS.md` ("this is not the Next.js you know, read `node_modules/next/dist/docs/` before writing code"). No root or backend `CLAUDE.md`/`AGENTS.md`.
- Confirmed audit findings still hold against current source (spot-checked `backend/app/core/config.py` line numbers match the prior audit exactly — no drift).
- Environment: fresh container, no Python/Node deps pre-installed. Installed `backend/requirements.txt` (pip) and `frontend` (`npm install`) once — this was a first install, not a reinstall (`pip list`/`node_modules` were empty beforehand).
- **No live market-data credentials available in this environment** (`env | grep -iE "TWELVE_DATA|ALPHA_VANTAGE|FINNHUB|POLYGON"` → empty, no `backend/.env`/`frontend/.env.local` present). Phase 1.2 (live provider verification against AAPL/NVDA/SPY/GLD) is therefore **BLOCKED by missing credentials**, not skipped — the integration code and its mocked-transport test suites are being kept/extended regardless.

### Baseline verification results

| Command | Result |
|---|---|
| `cd backend && python3 -m pytest app/tests -q` | **280 passed**, 0 failed, 151.00s |
| `cd frontend && npm run lint` | clean, 0 errors |
| `cd frontend && npx tsc --noEmit` | clean, 0 errors |
| `cd frontend && npm run build` | succeeds, 12 routes generated |
| `cd frontend && npm test` (vitest) | **14 passed** (2 files) |

This is the baseline every subsequent phase's verification is measured against — a regression is anything that drops below these numbers without an explicit, documented reason (e.g. a test intentionally moved/renamed).

---

## Completed tasks

- [x] Phase 0 — baseline check, ledger created.
- [x] Phase 1.1 — production guard against silently booting on synthetic/mock market data.
  - New `Settings.allow_synthetic_data: bool = False` (`backend/app/core/config.py`).
  - `app/main.py`'s existing production boot-guard block extended: builds the
    configured provider at boot and refuses to start if
    `environment=="production"` and the resolved provider's `data_mode ==
    "synthetic"` unless `ALLOW_SYNTHETIC_DATA=true` is explicitly set. A
    misconfigured *real* provider (missing API key) is deliberately NOT
    caught by this guard — it already fails loudly per-request via the
    existing `ProviderDataUnavailable` -> 503 path, which is itself the
    "clearly labelled unavailable mode" the spec asks for, so gating it at
    boot too would be redundant, not safer.
  - Updated `DEPLOYMENT.md` and `backend/.env.example` to document the new
    variable; the documented Railway quick-start still works, it now needs
    one extra explicit line (`ALLOW_SYNTHETIC_DATA=true`) to keep using the
    mock demo provider in `ENVIRONMENT=production` — this is the intended
    fix, not a regression (that undocumented-silent-mock-in-prod path was
    audit finding #2).
  - New test file `backend/app/tests/test_production_guards.py` (6 tests,
    all real subprocess boots — `python -c "import app.main"` with a
    controlled env — since the guard is top-level module code and can only
    be honestly exercised from a fresh process, not by monkeypatching the
    already-imported, `lru_cache`d settings the rest of the test session
    shares). Covers: default-SECRET_KEY refusal, AUTH_REQUIRED refusal,
    silent-mock refusal (new), explicit-opt-in success (new), misconfigured
    real-provider is NOT blocked (new), dev/test environments unaffected
    (new).
- [x] Phase 1.2 — live provider verification: **BLOCKED, reported honestly, not
  fabricated.** No `TWELVE_DATA_API_KEY`/`ALPHA_VANTAGE_API_KEY` (or any
  other vendor key) exists in this environment. Added
  `backend/app/tests/test_live_provider_smoke.py` — a real (not mocked)
  end-to-end smoke test against AAPL/NVDA/SPY/GLD (quote, OHLCV, invalid
  symbol, no-secrets-in-error-message) that self-`skipif`s when no vendor
  key is present, so it is honestly reported as **10 skipped**, never as
  passed. Will run for real the moment a future session has real
  credentials — no code changes needed, just set the env vars and run
  `pytest app/tests/test_live_provider_smoke.py -v -s`. The mocked-transport
  provider test suites (`test_twelvedata_provider.py`,
  `test_alphavantage_provider.py`, `test_market_data_fallback.py` — all
  pre-existing, all still green) already cover this phase's other required
  scenarios (fallback, cache, rate-limit, timeout, both-unavailable) at the
  logic level.
- [x] Phase 1.3 — engine_mode / model_version provenance (scoped: the
  HEURISTIC-vs-TRAINED_ML labeling specifically, not yet the full
  analysis_id/asset_type/feature_version/risk_policy_version/warnings field
  set the spec eventually wants — those depend on infrastructure Phases 4
  and 8 build, e.g. a versioned risk policy and a real dataset/training
  pipeline; adding empty version-stub fields for systems that don't exist
  yet would itself be a form of fabricated precision, so they're deferred
  to when Phase 4/8 give them real values).
  - `EnsemblePrediction.is_trained: bool` (`backend/app/services/ml/ensemble.py`)
    — true only if every requested horizon threshold was served by an
    actually-fitted LightGBM/XGBoost/CatBoost trio; false the moment even
    one threshold falls back to `_heuristic_prior()`.
  - `EnsembleModel.version: str | None`, set by
    `training_pipeline.save_model()`'s existing timestamp version tag (was
    computed before but never attached to the model object itself).
  - `StockAnalysis.engine_mode: "HEURISTIC" | "TRAINED_ML"` and
    `.model_version: str | None` (`backend/app/schemas/stock.py`), populated
    in `scorer.py`'s `_analyze_ticker_uncached()`.
  - Frontend: `frontend/lib/types.ts`'s `StockAnalysis` type extended;
    `DataBadge` component (`frontend/components/ui/DataBadge.tsx`) grew an
    optional second badge ("HEURISTIC ENGINE" / "TRAINED ML MODEL") wired
    into the stock detail page's existing provenance strip and its
    sources-and-timestamps footer — the one place in the UI a heuristic
    number could plausibly be read as a trained-model number now says
    otherwise explicitly.
  - New tests: `backend/app/tests/test_ensemble_provenance.py` (3 tests:
    untrained→heuristic, fully-fitted→trained, partially-fitted→still
    heuristic — the "partial" case is the one that actually matters, since
    a half-trained ensemble silently reporting TRAINED_ML would be exactly
    the dishonest labeling this field exists to prevent) and one new
    assertion added to the existing `test_scorer.py` confirming today's
    real, current state: every live analysis is honestly `HEURISTIC` with
    `model_version=None`, because no trained artifact exists in this repo.

## Files changed (this effort, cumulative)

Phase 1:
- `backend/app/core/config.py` — `allow_synthetic_data` setting
- `backend/app/main.py` — production synthetic-data boot guard
- `backend/.env.example`, `DEPLOYMENT.md` — document `ALLOW_SYNTHETIC_DATA`
- `backend/app/schemas/stock.py` — `engine_mode`, `model_version` fields
- `backend/app/services/scoring/scorer.py` — populates the two new fields
- `backend/app/services/ml/ensemble.py` — `EnsemblePrediction.is_trained`, `EnsembleModel.version`
- `backend/app/services/ml/training_pipeline.py` — tags saved artifacts with their version
- `frontend/lib/types.ts` — `StockAnalysis.engine_mode`/`.model_version`
- `frontend/components/ui/DataBadge.tsx` — engine-mode badge
- `frontend/app/stock/[ticker]/page.tsx` — wires the badge + footer copy
- `backend/app/tests/test_production_guards.py`, `test_live_provider_smoke.py`,
  `test_ensemble_provenance.py` (new); one new test added to `test_scorer.py`

Phase 2:
- `backend/scripts/run_migrations.py` (new) — `alembic upgrade head` as a
  distinct pre-start deploy step, Postgres-advisory-lock-protected against
  concurrent replicas, SQLite passthrough for dev.
- `backend/Dockerfile` — `CMD` now runs the migration script before `exec uvicorn`.
- `backend/app/main.py` — lifespan's `create_all()` now SQLite-only (Postgres
  is exclusively Alembic-managed); production boot guard extended with
  `DEBUG`, `CORS_ORIGINS`-default, `DATABASE_URL`-default refusals and an
  `ALLOW_REGISTRATION` warning (not a refusal — bootstrap needs it open once).
- `backend/app/services/deployment/__init__.py`,
  `backend/app/services/deployment/schema_status.py` (new) — schema
  readiness (Alembic head vs. applied revision), separate from liveness.
- New `GET /health/ready` route in `backend/app/main.py`.
- `docker-compose.yml` — `api` service gets a real `/health/ready`
  healthcheck; `web` now waits on `api` being healthy, not just started.
- `docs/DATABASE.md` §5 rewritten to describe the now-implemented (not just
  planned) migration strategy; `DEPLOYMENT.md` verification checklist
  mentions `/health/ready`.
- `backend/app/tests/test_production_guards.py` — extended with 5 new
  tests (DEBUG, CORS default, DATABASE_URL default, full-valid-config
  success, ALLOW_REGISTRATION warning-not-refusal) and `BASE_ENV` fixed to
  set `DEBUG=false` so the pre-existing success-case tests keep passing
  under the new guard.
- `backend/app/tests/test_schema_readiness.py` (new, 6 tests) — exercises
  `schema_status.py`'s Postgres-branch logic (missing/stale/matching
  `alembic_version`) against a real throwaway SQLite engine via the
  module's `url`/`db_engine` override parameters, since no live Postgres
  instance exists in this environment; the SQLite branch and the
  `/health/ready` route itself are tested directly, no override needed.

Phase 3:
- `backend/app/core/config.py` — new `auth_rate_limit_per_minute` setting
  (default 10/min, deliberately stricter than the existing
  `rate_limit_expensive_per_minute`).
- `backend/app/api/v1/endpoints/auth.py` — `login_rate_limit`/
  `register_rate_limit`/`refresh_rate_limit` dependencies wired onto
  `/auth/login`, `/auth/register`, `/auth/refresh`. Two independent
  token-bucket keys per login/register attempt (per-source-IP, per-targeted-
  email) so neither a single-IP brute force nor a distributed attack against
  one account slips through; refresh is IP-only (no credential pair to key
  on). Reuses the existing `RATE_LIMIT_ENABLED` flag and `check_rate_limit`
  primitive — no new infrastructure. The 429 body is identical regardless of
  which bucket tripped, so it can't be used to enumerate accounts. (First
  attempt read the request body as a second differently-named Pydantic
  parameter, which silently broke the wire contract — FastAPI embeds
  multiple distinctly-named body params as separate JSON keys. Fixed by
  reading the raw body directly via `await request.json()` instead.)
- `backend/app/api/v1/endpoints/monitoring.py` — `GET /monitoring/health`
  (drift/calibration/provider-failure/latency detail) now requires
  `require_operator`, matching every other operator-only route's pattern.
  The app-root `GET /health` (already minimal, no internals) stays public;
  confirmed nothing in the frontend calls `/monitoring/*` at all.
- `backend/app/services/chat/sanitize.py` (new) — `sanitize_untrusted_text()`
  (control-character stripping, length capping, logged-not-blocked
  suspicious-instruction-phrase detection) and `wrap_untrusted()` (explicit
  structural "this is data, not instructions" framing). Applied in
  `backend/app/services/chat/tools.py` to every untrusted external string a
  tool can return: news headlines/sources (`get_recent_news`, whose whole
  result is now `wrap_untrusted()`-wrapped) and vendor company names
  (`get_stock_analysis`, `search_universe`).
- `backend/app/services/chat/assistant.py` — `SYSTEM_PROMPT` gained an
  explicit rule 8: tool-result content (especially anything marked
  `untrusted_external_content`) is data to summarize, never a command;
  only the user's own messages are instructions. Added a 30s request
  timeout to the Anthropic `messages.create()` call (the 6-round tool-loop
  bound and 900-token cap already existed).
- New `backend/app/tests/test_chat_sanitize.py` (8 tests) — includes a
  from-scratch adversarial `MarketDataProvider` stub whose news content
  embeds real prompt-injection phrasing ("ignore all previous
  instructions", "you are now DAN", control characters, a 1000-char
  headline) run through the actual `execute_tool("get_recent_news", ...)`
  path, not just the sanitizer in isolation.
- `backend/app/tests/test_auth.py` — new `auth_rate_limit_on` fixture + 6
  tests (disabled-by-default, blocks after threshold, never reveals which
  bucket tripped, register/refresh also covered, recovery after reset).
- `backend/app/tests/test_monitoring.py` — 2 new tests: anonymous/regular-
  user 401/403, and a DB-promoted operator account getting 200 (mirrors
  `test_auth.py::test_revocation_via_token_version`'s direct-DB-mutation
  pattern, since registration order alone can't guarantee an "operator"
  account on the shared test DB).

## Database migrations created (this effort)

- None. Phases 1–3 needed no new *schema*. Phase 6/7's new tables (Paper
  Trading, prediction ledger) are where the next new migration will appear.

## Verification commands run (after Phase 3)

| Command | Result |
|---|---|
| `cd backend && python3 -m pytest app/tests -q` | **317 passed, 10 skipped** (327 collected — up from 301+10 at the end of Phase 2; +16 new passing tests: 6 auth rate-limit + 2 monitoring operator-gate + 8 chat sanitize) |
| `cd backend && python3 -m pytest app/tests/test_auth.py app/tests/test_monitoring.py app/tests/test_chat_sanitize.py -v` | all passed (isolated) |
| `cd frontend && npm run lint && npx tsc --noEmit && npm run build` | all clean (Phase 3 touched no frontend files — verified `git diff --stat frontend/` is empty) |
| `git diff` scanned for secret-shaped strings | none found |
| `git diff \| grep -i otc` | no matches |
| `git status --short` after `git add -A` | only the expected 9 files (7 modified + 2 new) |

## Remaining tasks (full 13-phase scope, not started unless marked)

- [x] Phase 1 — real data integrity (1.1, 1.2, 1.3 scoped as above)
- [x] Phase 2 — Alembic-in-deploy + production config guards (2.1, 2.2)
- [x] Phase 3 — security hardening (3.1 auth rate limiting, 3.2 monitoring split, 3.3 prompt-injection defenses)
- [ ] Phase 4 — unified risk/signal policy engine
- [ ] Phase 5 — frontend reliability (Watchlist/Portfolio error handling, shared states, mobile)
- [ ] Phase 6 — Paper Trading system
- [ ] Phase 7 — prediction ledger + outcome evaluation/performance proof
- [ ] Phase 8 — ML dataset + training + Champion/Challenger promotion gate
- [ ] Phase 9 — chart timeframes + technical indicators
- [ ] Phase 10 — user alerts
- [ ] Phase 11 — Admin/Operator UI
- [ ] Phase 12 — frontend/E2E testing expansion
- [ ] Phase 13 — commercial beta readiness (entitlements, disclosures)

## Known blockers

- **No live market-data API keys in this environment** → Phase 1.2's live AAPL/NVDA/SPY/GLD verification cannot be executed here. Code + mocked-transport tests will be completed regardless; live verification stays explicitly reported as blocked until credentials are supplied.
- **No Anthropic API key in this environment** → the LLM chat backend cannot be live-verified either (template backend, the default, needs no key and is verifiable).

## Exact next action

Start **Phase 4 — unified risk/signal policy engine**. Context (from the
original audit, re-confirmed still true): `services/risk/engine.py`'s
`evaluate_risk()` reads config-driven thresholds
(`risk_min_confidence_pct=65.0`, `risk_min_reward_risk_ratio=2.0`,
`risk_max_portfolio_risk_per_trade_pct=1.0`) but is only wired into the
**scanner** (`services/scanner/multi_asset.py`). The **per-ticker** status
machine that actually produces a stock page's BUY/SELL/WATCH/NO_TRADE-style
signal (`services/signals/engine.py`) uses its own separate, hardcoded
constants (`MIN_CONFIDENCE = 30.0` and inline thresholds in `_status_for()`)
— so a ticker can show `POSSIBLE_ENTRY` on its own page at 30% confidence
while the scanner would reject the same ticker at its 65% floor.

1. Design one authoritative `RiskPolicy` (confidence floor, reward:risk floor,
   max per-trade risk %, stale-data cutoff, liquidity/spread floor, event-risk
   rule, Safe Mode flag) — likely a small dataclass/Pydantic model sourced from
   `Settings`, with an explicit version string (`risk_policy_version`) so every
   signal/prediction can record which policy produced it (ties into Phase 1.3's
   provenance work and Phase 7's prediction ledger).
2. Rewrite `signals/engine.py` to import and enforce this same `RiskPolicy`
   instead of its own local constants — remove the duplicated thresholds.
3. Confirm the scanner, the stock-page signal endpoint, and (once built)
   Paper Trading and Alerts all resolve the SAME policy instance/version —
   no second hardcoded copy anywhere.
4. Missing/stale critical data must resolve to WATCH or NO_TRADE, never a
   fabricated confident status. Invalid trade levels (violating
   stop < entry < tp1 < tp2 < tp3) must be rejected outright.
5. Add deterministic tests for every threshold boundary (exactly-at-floor
   passes, one-below-floor rejects) and every rejection condition, plus a
   regression test proving the scanner and the per-ticker endpoint now agree
   on the same ticker/confidence/reward-risk combination (the exact
   inconsistency this phase closes).

Then continue to Phase 5 (frontend reliability: Watchlist/Portfolio error
handling, shared loading/error/offline states, mobile responsiveness across
all 9 routes) per the ledger order above.
