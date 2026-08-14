# Nexora — Beta Hardening Implementation Progress

Continuation ledger for the multi-phase "advanced MVP → safe, verifiable, real-data,
paper-trading-ready beta" effort. Update this file after every completed phase (or
meaningful chunk of one). A new session should read this file before re-auditing
anything.

---

## Current phase

**Phase 7 — prediction ledger + performance proof** — complete, see below.
Ready to start **Phase 8 — ML dataset + training + Champion/Challenger**
next.

Phases 1 (1.1/1.3 implemented, 1.2 honestly blocked), 2 (2.1, 2.2), 3
(3.1, 3.2, 3.3), 4 (unified risk/signal policy engine), 5 (frontend
reliability), and 6 (Paper Trading) — all done. See their entries further
down for full detail.

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

- [x] Phase 5 — frontend reliability.
  - **Watchlist & Portfolio stuck-loading bug (the originally-audited
    issue)**: both pages' `load()` had zero `.catch()` — a failed
    `GET /watchlist`/`GET /portfolio` left the page on its skeleton
    forever, with no way out for the user. Rewrote both
    (`frontend/app/watchlist/page.tsx`, `frontend/app/portfolio/page.tsx`)
    with the same pattern already established on Dashboard/Stock-Detail:
    `useCallback`-wrapped `load()` with a real `.catch()`, an 8s
    `loadingTooLong` fallback independent of the network-layer timeout, a
    `retry()` handler, `useResyncListener(load)` for PWA-reconnect refetch,
    and mutation handlers (`add`/`remove`/`openPosition`) that route
    failures into the same `error` state instead of throwing unhandled.
  - **Shared `ErrorState` component** (new,
    `frontend/components/ui/ErrorState.tsx`) — extracted from a
    Dashboard-only local function so every page shows the identical,
    correctly-classified message for the identical failure (network
    unreachable / timeout / provider unavailable / unauthorized /
    rate-limited / backend 5xx), via the existing `classifyApiError`.
    Standardized onto Watchlist, Portfolio, Dashboard (was already using
    its own copy — now the shared one), Opportunities, Backtest, and Stock
    Detail — six of eight data-fetching routes now render errors through
    one component instead of five different one-off inline blocks. Chat
    and Login/Register were left as-is: Chat already degrades per-message
    (a failed send shows inline in the transcript, not a page-level
    error), and the auth forms' inline field-level error text is the
    correct UX for a login/register failure, not a full-page error state.
  - **Real bug found and fixed while verifying this phase in a live
    browser** (backend, not originally in this phase's file list, but a
    direct instance of exactly what "shared error states" is for): opening
    any of the platform's real 20-asset-universe tickers (e.g. `AAPL`)
    from the Stock Detail page — the Dashboard's own Market Overview
    widget links directly to it — showed a confusing, unclassified
    `ApiError: API 404 ... Unknown symbol 'AAPL'` dump instead of the
    already-correct, already-tested "Market data is currently unavailable"
    message the Dashboard's sector-heatmap widget shows for the identical
    root cause. Root cause: `backend/app/main.py` already registers a
    global `@app.exception_handler(ProviderDataUnavailable)` that answers
    with a proper structured 503 (`{code: "provider_unavailable", ...}`) —
    but `backend/app/api/v1/endpoints/stocks.py`'s `get_stock_analysis`,
    `get_stock_deliberation`, and `get_stock_candles` each wrapped their
    logic in a local `except Exception` that caught `ProviderDataUnavailable`
    *before* it reached that handler and converted it into an unstructured
    404 instead. This was **not** a case of "make the mock provider
    fabricate large-cap data" — `MockOTCProvider.get_ticker_meta()`
    correctly refusing to invent a company for a real-market ticker it
    doesn't carry is itself audited, deliberate, tested behavior (see
    `test_multi_asset_scanner.py::test_mock_provider_correctly_refuses_symbols_outside_its_universe`,
    left untouched). The fix only changes *which HTTP status/shape* an
    already-honest refusal is reported with, and only for symbols that are
    real, tracked assets: added `_is_tracked_asset(symbol, db)` (checks
    Asset Universe Manager membership) to `stocks.py`; a `ProviderDataUnavailable`
    now only escalates to the app-level 503 handler when the symbol is a
    tracked asset (a provider capability gap, honestly reported as
    degraded service) — a genuinely unknown symbol (e.g. `ZZZZZZ`, not in
    any universe) still gets 404 ("this doesn't exist"), preserving every
    existing test's behavior for that case exactly.
  - **Mobile responsiveness — verified, not just asserted**: ran a real
    dev-server + Playwright check (`/opt/pw-browsers/chromium`) across all
    8 static routes at two mobile viewports (375×812, 414×896), asserting
    `document.documentElement.scrollWidth === clientWidth` (no horizontal
    page overflow) plus a manual visual screenshot review of
    Dashboard/Watchlist/Portfolio/Stock-Detail. Result: **zero routes had
    real horizontal overflow** — the only elements flagged by a naive
    per-element `scrollWidth` scan were the intentionally-horizontally-
    scrolling ticker tape and decorative ambient-background blobs, both
    already contained by their own `overflow:hidden` wrappers. `Sidebar`/
    `MobileNav` (`frontend/components/layout/`) already implement a proper
    responsive nav pattern (persistent left rail ≥`sm`, top bar + slide-in
    drawer with focus trap below it); every table (`OpportunityTable`,
    Backtest's trade table, Portfolio's position table) already wraps in
    `overflow-x-auto`; every stat/card grid already collapses via
    `grid-cols-2 sm:grid-cols-4`-style breakpoints. The prior ledger note
    calling this "not addressed" was based on the original text audit, not
    a live check — corrected here. **Not changed**: base `.btn`/`.btn-sm`
    touch-target heights (40px/32px, under the 44px WCAG-recommended
    minimum) — left as-is deliberately; this is an existing, deliberately-
    designed premium desktop-first density (matches the `ui-ux-pro-max`
    skill's own design-system output for this product), and a global
    control-sizing change is a design-system-wide visual change outside
    this phase's "fix what's broken" scope, not a "mobile is broken" bug.
  - **Explicitly deferred, not silently skipped**: component/page-level
    frontend tests for the fixed error paths. The frontend test suite
    today (`lib/motion.test.ts`, `lib/apiError.test.ts`) is pure
    utility-function tests under plain `vitest run` — no
    `@testing-library/react`, no DOM test environment, no `vitest.config.ts`
    exist yet. Standing up real component-render testing (choosing a DOM
    environment, installing testing-library, mocking `fetch`/routing) is
    itself meaningful infrastructure work that belongs to **Phase 12**
    (frontend/E2E testing expansion) as originally scoped in this ledger's
    own 13-phase list, not a two-line addition here — adding a shallow
    test now just to check a box would not meaningfully verify anything
    beyond what `classifyApiError`'s existing unit tests already do.

- [x] Phase 6 — Paper Trading system. The platform's **only** trading
  execution mode — no real-money broker integration exists or is planned.
  - **New DB tables**: `PaperTradingAccount` (one virtual cash account per
    user, `paper_trading_starting_balance` setting, default $100,000) and
    `PaperPosition` (open/closed simulated long positions). Extended the
    existing, previously-unused `Trade` model (`db/models/trade.py` —
    audit finding: "no trading beyond a partial DB model") with
    `account_id`/`position_id` linkage and `data_source`/`data_mode`
    provenance, reusing it as the immutable fill log rather than adding a
    redundant parallel table.
  - **Execution safety — the actual point of this phase**:
    `services/paper_trading/engine.py`'s `open_position()` calls the exact
    same `evaluate_risk()` function (`services/risk/engine.py`) the
    scanner and Signal Engine already use for the POSSIBLE_ENTRY gate —
    including the platform-wide Safe Mode kill switch. A setup the
    platform's own analysis would flag NO_TRADE/AVOID cannot be paper-
    traded either. This is also the **first real caller** of
    `evaluate_risk()`'s `position_risk_pct` parameter (every existing
    caller only has a candidate, not a sized order, so it was always
    omitted before) — computed as `quantity * |fill_price - stop_loss| /
    account.cash_balance * 100` and checked against
    `risk_max_portfolio_risk_per_trade_pct`.
  - **Fill pricing**: a market buy fills at the provider's current best
    ask, a market sell/close fills at the current best bid — the real
    cost of crossing the spread. When bid/ask depth isn't available
    (`Quote.bid`/`.ask` are `None` for some vendors), honestly falls back
    to `last` rather than inventing a spread.
  - **Cash-only v1**: no shorting, no margin, no fees — a position can
    never cost more than the account's current cash balance (checked
    *after* the risk gate, since a refused setup shouldn't even reach the
    affordability check).
  - **Explicitly out of scope, documented, not silently missing**:
    automatic stop-loss/take-profit-triggered position closing. This
    version closes only on an explicit user action; `planned_stop_loss`/
    `planned_take_profit`/entry-time confidence/reward:risk are captured
    on every position for a **future** periodic outcome-evaluation job —
    which Phase 7 (prediction ledger) is building anyway, so building a
    second, duplicate background-evaluation mechanism here would be
    wasted, divergent infrastructure.
  - New endpoints (`api/v1/endpoints/paper_trading.py`, prefix
    `/paper-trading`): `GET /account`, `GET /positions?status=open|closed`
    (mark-to-market unrealized P/L computed live from a fresh quote, never
    stored/stale), `POST /positions` (open, 400 with the risk gate's exact
    named reason on refusal), `POST /positions/{id}/close`.
  - New frontend route `frontend/app/paper-trading/page.tsx` (added to
    the sidebar nav) — account summary stat tiles, open-positions table
    with live unrealized P/L and a Close action, closed-positions history
    with realized P/L, using the same `ErrorState`/loading-too-long/retry
    pattern Phase 5 standardized. Verified live in a real browser (not
    just unit tests): opened a position that clears the risk gate (cash
    debited, position appears, live mark-to-market shown), attempted one
    that fails it (refused with the exact reason inline, account state
    unchanged), and closed the open position (moved to history, cash
    credited back, realized P/L computed correctly).
  - **Real dev-environment issue found and worked around while verifying
    this phase, not a code bug**: SQLite's `create_all()` (the documented
    dev-only path, distinct from Alembic which is what actually runs in
    production per Phase 2) only creates *missing* tables — it never
    alters an existing table's columns. A stale local `ven0x_dev.db` left
    over from before this phase's `Trade` model change caused a real
    "table trades has no column named account_id" error the first two
    times the dev server was restarted (some orphaned prior uvicorn
    processes from rapid successive manual restarts kept serving stale
    schema). Deleting the gitignored local dev DB file and confirming
    exactly one server process was running resolved it; this has no
    bearing on real deployments, which are exclusively Alembic-managed.
  - New `backend/app/tests/test_paper_trading.py` (12 tests): account
    creation/reuse; open succeeds against a real generated analysis that
    clears the risk gate (found deterministically by iterating the mock
    provider's fixed universe once — not hardcoded/fabricated); open is
    refused (cash unchanged, no position created) for one that fails it;
    non-positive quantity rejected; insufficient-cash refusal isolated
    from the position-sizing gate (they'd otherwise always co-trigger
    under the default 1% risk-per-trade policy, since both scale with
    quantity identically — monkeypatches a permissive risk policy to
    isolate the affordability check specifically); close realizes P&L and
    credits cash correctly; closing an unknown/already-closed/someone-
    else's position is refused; entry-time provenance
    (stop/target/confidence/reward:risk) is captured for the future
    Phase 7 evaluation job; and 3 full API-level lifecycle tests
    (open→list→account→close, a risk-gate refusal via the API returning
    400 with the exact reason, and an invalid status-filter 400).

- [x] Phase 7 — prediction ledger + performance proof. **Major discovery
  before writing any code**: this phase's core scaffolding — `Prediction`/
  `Outcome` models with DB-enforced honesty CHECK constraints,
  `build_prediction_row()`, `services/evaluation/outcome_evaluator.py`
  (`evaluate_due_predictions`, `build_calibration_report`), and
  `/predictions/*` endpoints — **already existed**, not flagged in the
  original audit. It was a smaller, more targeted job than a from-scratch
  build: audit what exists, find and close the real gaps, wire it into the
  mainstream product.
  - **The critical gap**: the only code path that ever called
    `build_prediction_row()` was `app/workers/scan_scheduler.py`, which is
    gated behind `otc_module_enabled` (false by default) — meaning in the
    actual running mainstream platform (real 20-asset universe), **nothing
    was ever logged into the prediction ledger automatically**. The
    calibration report and any future Champion/Challenger comparison would
    have had zero data to work with in a real deployment. Fixed with a new
    **`app/workers/prediction_scheduler.py`** — a periodic worker for the
    mainstream multi-asset universe specifically (not OTC-gated, runs by
    default), snapshotting every active asset's analysis into the ledger
    on a `prediction_log_interval_seconds` interval (default 3600s —
    hourly, deliberately slow: a prediction logged every few minutes
    against slow-moving fundamentals is noise, not signal) and then
    calling the existing `evaluate_due_predictions()`. Wired into
    `docker-compose.yml` as `prediction-logger` (unlike the OTC `scanner`
    service, **not** profile-gated) and documented in `DEPLOYMENT.md`.
  - **Missing provenance, closed**: `Prediction` had no `engine_mode`/
    `model_version`/`risk_policy_version` columns — meaning even once
    predictions started being logged, there'd be no way to ever compare
    "how did HEURISTIC do vs. TRAINED_ML historically," the exact
    capability Phase 8's Champion/Challenger gate needs. Added all three
    (`build_prediction_row()` now stamps them from `StockAnalysis.
    engine_mode`/`.model_version`, Phase 1's fields, and
    `RiskPolicy.from_settings().version`, Phase 4's).
  - **Missing a real Brier score**: the existing calibration report had
    bucket-level "calibration gap" but no single honest reliability
    number. Added `_brier_score()` (mean squared error between predicted
    probability and the realized binary outcome) to
    `build_calibration_report()`'s output, computed both overall and
    **broken down by `engine_mode`** — the direct, load-bearing input to
    Phase 8's promotion rule ("a trained model may only be promoted if it
    beats the heuristic's Brier score here, out-of-sample").
  - New frontend route `frontend/app/performance/page.tsx` (added to the
    sidebar nav, using Phase 5's `ErrorState`/loading pattern) — stat
    tiles (predictions scored, Brier score, stop rate, avg realized
    return), a predicted-vs-realized calibration bar per probability
    bucket, and a per-`engine_mode` comparison section. No such page or
    API integration existed before this phase (verified: `grep`ping
    `frontend/lib/api.ts` for "prediction"/"calibration" before this
    phase returned nothing).
  - **Explicitly out of scope, documented, not silently deferred**: wiring
    Phase 6 Paper Trading's planned automatic stop/target-triggered
    closing into this same periodic cycle. The hook point (this worker
    now runs regularly and already touches every active asset's fresh
    analysis) is real, but adding it now would have expanded this phase's
    surface into Paper Trading's again; left as a clearly-named follow-up
    rather than rushed in.
  - New Alembic migration (`predictions` table's 3 new provenance
    columns, `server_default`s for the two NOT NULL ones since the table
    may be non-empty). New tests: `test_prediction_log.py` (2),
    `test_prediction_scheduler.py` (4, including a test-isolation fix
    identical in spirit to `test_multi_asset_scanner.py`'s — scoped
    assertions to the 20 seed symbols specifically, not raw
    active-universe counts, after the full suite surfaced a shared-DB
    flake other test files' uncommitted-rollback client fixtures cause),
    and 3 new assertions in `test_outcome_evaluator.py` (Brier score
    rewards confident-correct predictions, per-engine-mode breakdown is a
    real split not a shared number, and the empty-report shape always
    carries the `by_engine_mode` key so the frontend never has to guard
    against its absence).
  - Verified live: `GET /predictions/calibration` returns the correct
    honest empty shape on a fresh deployment (never fabricates a
    number to fill the gap); `POST /predictions/log/{symbol}` correctly
    stamps `engine_mode: "HEURISTIC"`, `model_version: null`,
    `risk_policy_version: "risk-policy-v1"` on a real logged row; the new
    `/performance` page renders the empty state correctly with no crash.
    Populating and visually verifying the *matured*-outcome rendering
    path wasn't practical live (the mock provider's synthetic history
    treats "now" as the last bar, so nothing matures without manipulating
    system time) — covered instead by the 10 backend tests that construct
    exact scripted price paths and assert the graded result precisely.

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

Phase 4:
- `backend/app/core/config.py` — 7 new settings bundling every threshold
  the scanner and Signal Engine each need:
  `risk_min_signal_confidence_pct` (30.0 — the loose "trust this signal at
  all" floor), `risk_max_spread_pct` (12.0), `risk_min_liquidity_score`
  (25.0), `risk_min_dollar_volume` (10,000), `risk_max_manipulation_risk`
  (60.0), `risk_min_bars_for_signal` (20) — all previously hardcoded only
  inside `signals/engine.py` — plus `safe_mode_enabled` (new kill switch).
- `backend/app/services/risk/policy.py` (new) — `RiskPolicy` dataclass
  bundling every threshold above plus the existing
  `risk_min_confidence_pct`/`risk_min_reward_risk_ratio`/
  `risk_max_portfolio_risk_per_trade_pct`, with an explicit
  `POLICY_VERSION` ("risk-policy-v1") persisted on every `Signal` row.
- `backend/app/services/risk/engine.py` — `evaluate_risk()` now checks
  `settings.safe_mode_enabled` first and rejects unconditionally when set,
  before any other threshold — the platform-wide kill switch, enforced in
  the one function both the scanner and Signal Engine already call.
- `backend/app/services/signals/engine.py` — **the actual fix**: removed
  its own separately-hardcoded `MAX_SPREAD_PCT`/`MIN_LIQUIDITY`/
  `MIN_DOLLAR_VOLUME`/`MAX_MANIPULATION`/`MIN_CONFIDENCE`/
  `MIN_BARS_FOR_SIGNAL` constants; `apply_safety_rules()` now takes an
  optional `policy: RiskPolicy` (defaults to the live one) and reads every
  threshold from it. More importantly, `_status_for()`'s `POSSIBLE_ENTRY`
  tier — which previously only checked its own ad-hoc `reward_risk >= 1.5`
  with no confidence floor beyond the weak 30% signal-trust gate — now
  additionally calls `evaluate_risk()` (the exact same function
  `services/scanner/multi_asset.py` calls) and requires it to pass. A
  setup strong by score/probability but too weak by confidence/reward:risk
  now downgrades to `SETUP_FORMING`/`WATCH` with the risk engine's own
  named rejection reason folded into `rejection_reasons`, instead of
  reaching `POSSIBLE_ENTRY` on a bar the scanner would have rejected. Also
  now stamps `risk_policy_version` on every persisted `Signal`.
- `backend/app/db/models/signal.py` — new `risk_policy_version` column
  (`default="unversioned"` for any row from before this migration).
- `backend/alembic/versions/5b5ab8be5d21_add_risk_policy_version_to_signals.py`
  (new) — additive, `server_default='unversioned'` (backfill-safe on a
  non-empty table, matching the established pattern from
  `aceab66d1590`). Autogenerated against a real migrated SQLite DB, then
  hand-verified with a second autogenerate pass reporting an empty diff
  (model and migration confirmed in sync) before the throwaway check file
  was deleted.
- `backend/app/api/v1/endpoints/stream.py` / `frontend/lib/types.ts` — the
  live-signal SSE payload and its frontend type both gained
  `risk_policy_version` for full provenance visibility.
- `backend/app/tests/test_risk_policy.py` (new, 7 tests) — `RiskPolicy`
  bundles every setting correctly; Safe Mode rejects an otherwise-perfect
  setup unconditionally; **the core regression test**: a synthetic
  "strong by score (90/100), weak by risk gate (40% confidence)" analysis
  can no longer reach `POSSIBLE_ENTRY` (it could have under the old, looser
  local threshold); the mirror-image "strong by score AND clears the risk
  gate" case does reach `POSSIBLE_ENTRY`; and a direct assertion that
  `scanner.multi_asset.evaluate_risk is signals.engine.evaluate_risk` — not
  two separate implementations, the literal same function object.
- `backend/app/tests/test_signal_engine.py` — one new assertion that every
  persisted signal carries a non-empty `risk_policy_version`.
- Re-ran `test_signal_engine.py`, `test_risk_engine.py`,
  `test_signal_ai_indicator.py`, `test_multi_asset_scanner.py`,
  `test_multi_asset_scan_endpoint.py`, `test_scanner_v2.py`,
  `test_streaming.py` together (53 tests) to confirm the tightened
  `POSSIBLE_ENTRY` gate caused zero regressions in existing scanner/signal
  behavior — none of them hardcode an exact expected status for specific
  synthetic data, only valid-status-set / not-POSSIBLE_ENTRY-style
  assertions, so all 53 passed unchanged.

Phase 5:
- `frontend/components/ui/ErrorState.tsx` (new) — shared error card, used
  by six routes now.
- `frontend/app/watchlist/page.tsx`, `frontend/app/portfolio/page.tsx` —
  rewritten with real error handling (see above); the originally-audited
  stuck-on-skeleton bug.
- `frontend/app/page.tsx` — now imports the shared `ErrorState` instead of
  its own local copy (behavior unchanged, duplication removed).
- `frontend/app/stock/[ticker]/page.tsx` — error state now holds the raw
  `unknown` error (was `String(e)`, discarding classification) and renders
  via `ErrorState` with a working retry button.
- `frontend/app/opportunities/page.tsx`, `frontend/app/backtest/page.tsx`
  — same standardization (raw error + `ErrorState` + retry) applied for
  consistency across every data-fetching route.
- `backend/app/api/v1/endpoints/stocks.py` — `_is_tracked_asset()` helper;
  `get_stock_analysis` (now takes `db`), `get_stock_deliberation`,
  `get_stock_candles` (now takes `db`) distinguish "tracked asset, provider
  can't serve it" (503, structured, honest) from "genuinely unknown
  symbol" (404) — see the bug writeup above.
- `backend/app/tests/test_api_stocks.py` — 2 new tests
  (`test_get_stock_analysis_for_a_real_tracked_asset_is_503_not_404`,
  `test_get_stock_candles_for_a_real_tracked_asset_is_503_not_404`) proving
  the fix; existing `test_get_stock_analysis_unknown_symbol_handles_gracefully`
  (genuinely-unknown-symbol case) untouched and still passing.

Phase 6:
- `backend/app/core/config.py` — `paper_trading_starting_balance` setting
  ($100,000 default).
- `backend/app/db/models/paper_trading.py` (new) — `PaperTradingAccount`,
  `PaperPosition`.
- `backend/app/db/models/trade.py` — extended with `account_id`,
  `position_id`, `data_source`, `data_mode`.
- `backend/app/db/models/__init__.py` — registers the two new models.
- `backend/app/services/paper_trading/engine.py` (new) —
  `get_or_create_account`, `open_position`, `close_position`,
  `list_open_positions`, `list_closed_positions`, `PaperTradingError`.
- `backend/app/schemas/paper_trading.py` (new) — `PaperAccountOut`,
  `PaperPositionOut`, `PaperOpenRequest`.
- `backend/app/api/v1/endpoints/paper_trading.py` (new) — `/paper-trading`
  routes; registered in `backend/app/api/v1/api.py`.
- `backend/alembic/versions/6f1d3edac330_paper_trading_accounts_and_positions.py`
  (new) — see migrations section below.
- `backend/app/tests/test_paper_trading.py` (new, 12 tests).
- `frontend/lib/types.ts` — `PaperAccount`, `PaperPosition` interfaces.
- `frontend/lib/api.ts` — `paperAccount`, `paperPositions`,
  `openPaperPosition`, `closePaperPosition`.
- `frontend/app/paper-trading/page.tsx` (new route).
- `frontend/components/layout/Sidebar.tsx` — nav entry for the new route.

Phase 7:
- `backend/app/db/models/prediction.py` — `Prediction` gains
  `engine_mode`, `model_version`, `risk_policy_version`.
- `backend/app/services/scoring/prediction_log.py` — `build_prediction_row()`
  stamps the three new provenance fields.
- `backend/app/services/evaluation/outcome_evaluator.py` — `_brier_score()`,
  `_bucket_report()` (extracted, reused per-mode), `build_calibration_report()`
  now returns `brier_score` and `by_engine_mode`.
- `backend/app/workers/prediction_scheduler.py` (new) — mainstream (non-OTC)
  periodic prediction logger + outcome evaluator; `run_prediction_cycle()`.
- `backend/app/core/config.py` — `prediction_log_interval_seconds` (3600).
- `backend/app/schemas/prediction.py`,
  `backend/app/api/v1/endpoints/predictions.py` — `PredictionOut` and its
  two construction sites carry the new provenance fields.
- `backend/alembic/versions/2f065e542a7c_prediction_provenance_fields.py`
  (new) — see migrations section below.
- `backend/app/tests/test_prediction_log.py` (new, 2 tests),
  `backend/app/tests/test_prediction_scheduler.py` (new, 4 tests),
  `backend/app/tests/test_outcome_evaluator.py` (+3 tests).
- `docker-compose.yml` — new `prediction-logger` service (default-on, not
  profile-gated).
- `DEPLOYMENT.md`, `backend/.env.example` — document the new worker/setting.
- `frontend/lib/types.ts` — `CalibrationBucket`, `CalibrationBucketReport`,
  `CalibrationReport`.
- `frontend/lib/api.ts` — `calibrationReport()`.
- `frontend/app/performance/page.tsx` (new route).
- `frontend/components/layout/Sidebar.tsx` — nav entry.

## Database migrations created (this effort)

- `5b5ab8be5d21_add_risk_policy_version_to_signals.py` (Phase 4) — additive,
  backfill-safe (`server_default='unversioned'`), reversible. Verified
  against a fresh SQLite DB, an existing-DB upgrade from the prior head,
  and a follow-up autogenerate confirming zero remaining model/migration
  drift. Phases 1–3 and 5 needed no schema changes.
- `6f1d3edac330_paper_trading_accounts_and_positions.py` (Phase 6) — new
  tables `paper_trading_accounts`/`paper_positions`; adds
  `account_id`/`position_id`/`data_source`/`data_mode` to the existing
  `trades` table (`server_default='unknown'`/`'unspecified'` on the two
  new NOT NULL string columns — backfill-safe on a non-empty table).
  Named the new FK constraints explicitly (`fk_trades_account_id`,
  `fk_trades_position_id`) after autogenerate's default unnamed
  constraints failed SQLite's batch-alter mode ("Constraint must have a
  name") — matches the existing `fk_<table>_<column>` convention from
  `9b1a60567a48`. Verified: fresh-DB upgrade, upgrade-from-prior-head
  (`5b5ab8be5d21`), downgrade back one revision, and a follow-up
  autogenerate confirming zero remaining model/migration drift.
- `2f065e542a7c_prediction_provenance_fields.py` (Phase 7) — adds
  `engine_mode`/`model_version`/`risk_policy_version` to the existing
  `predictions` table (`server_default='HEURISTIC'`/`'unversioned'` on the
  two new NOT NULL columns). Verified: fresh-DB upgrade, upgrade-from-
  prior-head (`6f1d3edac330`), downgrade back one revision, and a
  follow-up autogenerate confirming zero remaining drift. Phase 8's model
  training/registry is where the next migration is likely to appear.

## Verification commands run (after Phase 7)

| Command | Result |
|---|---|
| `cd backend && python3 -m pytest app/tests -q` | **347 passed, 10 skipped** (up from 338+10 at the end of Phase 6; +9 new passing tests) |
| `cd backend && python3 -m pytest app/tests/test_prediction_log.py app/tests/test_prediction_scheduler.py app/tests/test_outcome_evaluator.py -q` | 16/16 passed (isolated) |
| Full-suite run surfaced a test-isolation flake in the new scheduler test (exact-count assertion collided with another file's uncommitted test-only asset on the shared in-memory test DB) | fixed by scoping assertions to the 20 seed symbols specifically (same discipline as `test_multi_asset_scanner.py`); re-ran full suite clean afterward |
| `SQLITE_PATH=sqlite:////tmp/... alembic upgrade head` (fresh DB) | applies all 10 migrations in order, exit 0 |
| same, upgrading from prior head (`6f1d3edac330`) only | applies only the new migration, exit 0 |
| `alembic downgrade -1` from the new head | clean downgrade, exit 0 |
| `alembic revision --autogenerate` after upgrading to the new head | generates an **empty** migration — model/migration confirmed in sync; throwaway file deleted |
| `cd frontend && npx tsc --noEmit && npm run lint && npm run build` | all clean, 14 routes generated |
| Live dev-server check: `GET /predictions/calibration` (fresh DB), `POST /predictions/log/{symbol}` | correct honest empty shape; logged row carries `engine_mode: "HEURISTIC"`, `model_version: null`, `risk_policy_version: "risk-policy-v1"` |
| Live dev-server + Playwright: `/performance` empty state | renders correctly, no crash, no fabricated numbers |
| `git diff` scanned for secret-shaped strings | none found |
| `git diff \| grep -iE "otc_module_enabled\|enable.*otc"` | only the new worker's own comment explaining it is *not* OTC-gated — no regression |

## Remaining tasks (full 13-phase scope, not started unless marked)

- [x] Phase 1 — real data integrity (1.1, 1.2, 1.3 scoped as above)
- [x] Phase 2 — Alembic-in-deploy + production config guards (2.1, 2.2)
- [x] Phase 3 — security hardening (3.1 auth rate limiting, 3.2 monitoring split, 3.3 prompt-injection defenses)
- [x] Phase 4 — unified risk/signal policy engine (RiskPolicy, Safe Mode, POSSIBLE_ENTRY now gated by the same evaluate_risk() the scanner uses)
- [x] Phase 5 — frontend reliability (Watchlist/Portfolio error handling, shared `ErrorState` on 6 routes, a real backend 404-vs-503 bug found+fixed, mobile responsiveness verified via Playwright — no changes needed; component/page-level frontend tests explicitly deferred to Phase 12, no testing-library infra exists yet)
- [x] Phase 6 — Paper Trading system (PaperTradingAccount/PaperPosition, execution gated by the same evaluate_risk() the scanner/Signal Engine use, cash-only realistic bid/ask fill pricing, /paper-trading UI, full lifecycle verified live; automatic stop/target-triggered closing explicitly deferred to Phase 7's outcome-evaluation job)
- [x] Phase 7 — prediction ledger + performance proof (existing Prediction/Outcome/evaluator scaffolding audited and found disconnected from the mainstream universe — fixed with a new non-OTC-gated prediction_scheduler worker; added engine_mode/model_version/risk_policy_version provenance and a real Brier score broken down by engine_mode; new /performance frontend page)
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

Start **Phase 8 — ML dataset + training + Champion/Challenger promotion
gate**:
1. Check `backend/app/services/ml/` for existing scaffolding before
   assuming a blank slate — Phases 6 and 7 both found substantial
   pre-existing infrastructure (`ensemble.py`, `training_pipeline.py`,
   `calibration.py`, `feature_vector.py`, `explainability.py` were all
   referenced earlier in this effort) that just needed auditing and
   wiring up, not rebuilding.
2. Point-in-time-correct, leakage-resistant dataset construction: the
   Phase 7 prediction ledger (`predictions`/`outcomes` tables, now with
   `engine_mode` provenance) is the natural label source —
   `outcome.max_runup_pct >= threshold` is literally documented as "the
   label source for retraining" in `db/models/prediction.py`'s `Outcome`
   docstring. Verify no future information leaks into a training row's
   features (a feature computed from data that wouldn't have been
   available at `prediction.created_at`).
3. Baselines required before any trained model can be discussed
   seriously: logistic regression, momentum, buy-and-hold. Walk-forward
   (not k-fold — this is time series) validation.
4. **The promotion gate itself, using Phase 7's new infrastructure
   directly**: `build_calibration_report()`'s `by_engine_mode` breakdown
   already gives HEURISTIC's real historical Brier score. A trained
   model may only flip `EnsembleModel`'s trained-vs-heuristic behavior in
   production once its own out-of-sample Brier score (computed the exact
   same way, via the same ledger, once it's been running long enough to
   accumulate matured predictions under `engine_mode="TRAINED_ML"`) is
   demonstrably better — never promoted on training-set metrics alone.
5. This phase will likely need a DB migration (model registry / training
   run metadata) — same autogenerate-then-verify-empty-diff discipline as
   every prior phase's migration.
6. Do not activate a trained model in production regardless of any
   internal metric until this out-of-sample, ledger-based comparison
   exists and favors it — the standing non-negotiable rule.

Then continue to Phase 9 (chart timeframes + technical indicators) per
the ledger order above.
