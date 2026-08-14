# Nexora — Beta Hardening Implementation Progress

Continuation ledger for the multi-phase "advanced MVP → safe, verifiable, real-data,
paper-trading-ready beta" effort. Update this file after every completed phase (or
meaningful chunk of one). A new session should read this file before re-auditing
anything.

---

## Current phase

**Phase 5 — frontend reliability** — complete, see below. Ready to start
**Phase 6 — Paper Trading system** next.

Phases 1 (1.1/1.3 implemented, 1.2 honestly blocked), 2 (2.1, 2.2), 3
(3.1, 3.2, 3.3), and 4 (unified risk/signal policy engine) — all done. See
their entries further down for full detail.

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

## Database migrations created (this effort)

- `5b5ab8be5d21_add_risk_policy_version_to_signals.py` (Phase 4) — additive,
  backfill-safe (`server_default='unversioned'`), reversible. Verified
  against a fresh SQLite DB, an existing-DB upgrade from the prior head,
  and a follow-up autogenerate confirming zero remaining model/migration
  drift. Phases 1–3 and 5 needed no schema changes. Phase 6/7's new tables
  (Paper Trading, prediction ledger) are where the next migration appears.

## Verification commands run (after Phase 5)

| Command | Result |
|---|---|
| `cd backend && python3 -m pytest app/tests -q` | **326 passed, 10 skipped** (up from 324+10 at the end of Phase 4; +2 new passing tests in `test_api_stocks.py`) |
| `cd backend && python3 -m pytest app/tests/test_api_stocks.py app/tests/test_p0_slice.py app/tests/test_multi_asset_scanner.py app/tests/test_market_overview.py app/tests/test_reasoning_engine.py -q` | 46/46 passed (isolated, the full blast-radius of the `stocks.py` change) |
| `cd frontend && npx tsc --noEmit && npm run lint && npm run build` | all clean, 12 routes generated |
| Live dev-server check: `curl .../api/v1/stocks/AAPL/analysis` before/after fix | 404 unstructured → **503** `{"code":"provider_unavailable","provider":"mock","market_data_available":false}` |
| Playwright, 8 routes × 2 mobile viewports (375×812, 414×896) | 0 routes with real horizontal page overflow (`scrollWidth === clientWidth` everywhere); full-page screenshots of Dashboard/Watchlist/Portfolio/Stock-Detail visually reviewed |
| `git diff` scanned for secret-shaped strings | none found |
| `git diff \| grep -iE "otc_module_enabled\|enable.*otc"` | no matches — no OTC-enablement regression |

## Remaining tasks (full 13-phase scope, not started unless marked)

- [x] Phase 1 — real data integrity (1.1, 1.2, 1.3 scoped as above)
- [x] Phase 2 — Alembic-in-deploy + production config guards (2.1, 2.2)
- [x] Phase 3 — security hardening (3.1 auth rate limiting, 3.2 monitoring split, 3.3 prompt-injection defenses)
- [x] Phase 4 — unified risk/signal policy engine (RiskPolicy, Safe Mode, POSSIBLE_ENTRY now gated by the same evaluate_risk() the scanner uses)
- [x] Phase 5 — frontend reliability (Watchlist/Portfolio error handling, shared `ErrorState` on 6 routes, a real backend 404-vs-503 bug found+fixed, mobile responsiveness verified via Playwright — no changes needed; component/page-level frontend tests explicitly deferred to Phase 12, no testing-library infra exists yet)
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

Start **Phase 6 — Paper Trading system**:
1. Design the account/position/trade lifecycle on top of the existing
   (partial) DB model — check `backend/app/db/models/` for whatever
   Paper Trading scaffolding already exists (the original audit noted "not
   implemented beyond partial DB model") before adding new tables.
2. Execution safety must reuse Phase 4's `RiskPolicy`/`evaluate_risk()` —
   the same single gate the scanner and Signal Engine already share — so a
   paper trade can't be opened on a setup the platform itself would flag as
   NO_TRADE/AVOID. Reuse the existing `broker_sim`-style fill simulation
   (spread/slippage/partial-fill/halts) already proven in the Backtest
   engine (`services/backtest/`) rather than inventing a second one.
3. New API endpoints (open/close/list positions, account state) + a
   `/paper-trading` frontend route using the same `ErrorState`/loading/
   empty-state patterns just standardized in Phase 5.
4. This phase will need a DB migration (new Paper Trading tables) —
   generate it the same way as `5b5ab8be5d21` (autogenerate against a real
   migrated DB, verify with a second empty-diff autogenerate, hand-check
   `server_default`s for any NOT NULL column added to a non-empty table).
5. Only Paper Trading execution — no real-money broker integration, per
   the standing non-negotiable rule.

Then continue to Phase 7 (prediction ledger + outcome evaluation/
performance proof) per the ledger order above.
