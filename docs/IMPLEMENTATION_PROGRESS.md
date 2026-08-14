# Nexora — Beta Hardening Implementation Progress

Continuation ledger for the multi-phase "advanced MVP → safe, verifiable, real-data,
paper-trading-ready beta" effort. Update this file after every completed phase (or
meaningful chunk of one). A new session should read this file before re-auditing
anything.

---

## Current phase

**Phase 1 — Real market data and data integrity** — 1.1 and 1.3 done (scoped, see below), 1.2 blocked by missing credentials. Ready to start **Phase 2 — Alembic-in-deploy + production config guards** next.

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

- `docs/IMPLEMENTATION_PROGRESS.md` (new — this file)
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
- New tests: `backend/app/tests/test_production_guards.py`,
  `test_live_provider_smoke.py`, `test_ensemble_provenance.py`; one new
  test added to `test_scorer.py`

## Database migrations created (this effort)

- None yet. (Phase 1 needed no schema changes — Phase 2's Alembic-in-deploy
  work and Phase 6/7's new tables are where migrations will next appear.)

## Verification commands run (after Phase 1)

| Command | Result |
|---|---|
| `cd backend && python3 -m pytest app/tests -q` | **290 passed, 10 skipped** (baseline 280 + 10 new passing + 10 new honestly-skipped live tests = 300 collected total, confirmed via `--collect-only`) |
| `cd backend && python3 -m pytest app/tests/test_production_guards.py -v` | 6/6 passed (isolated) |
| `cd backend && python3 -m pytest app/tests/test_live_provider_smoke.py -v` | 10/10 skipped (isolated, confirms honest self-skip) |
| `cd frontend && npm run lint` | clean |
| `cd frontend && npx tsc --noEmit` | clean |
| `cd frontend && npm run build` | succeeds |
| `git diff` scanned for secret-shaped strings | none found |
| `git diff \| grep -i otc` | only pre-existing `MockOTCProvider` test-infra reuse in a new test; no user-facing OTC regression |

## Remaining tasks (full 13-phase scope, not started unless marked)

- [x] Phase 1 — real data integrity (1.1, 1.2, 1.3 scoped as above)
- [ ] Phase 2 — Alembic-in-deploy + production config guards
- [ ] Phase 3 — security hardening (auth rate limiting, monitoring split, prompt-injection defense)
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

Start **Phase 2 — Alembic-in-deploy + production config guards**:
1. Wire `alembic upgrade head` into the real startup flow (Dockerfile entrypoint or
   an explicit pre-start step), replacing/supplementing `Base.metadata.create_all()`
   for non-fresh databases; make deploy fail if migrations fail; guard against
   multiple replicas racing the same migration.
2. Extend `app/main.py`'s production boot guard with the still-missing checks from
   the spec: `DEBUG=false` required, sane `ALLOW_REGISTRATION` posture, and
   validate `CORS_ORIGINS`/database config are non-default in production.
3. Verify: fresh DB migrate, existing DB migrate, `alembic current` matches head,
   a distinct schema-readiness check separate from the plain liveness probe.

Then continue to Phase 3 (security hardening: auth rate limiting, `/monitoring`
split, prompt-injection defenses) per the ledger order above.
