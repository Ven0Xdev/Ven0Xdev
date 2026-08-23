# Nexora — Final Production Readiness Audit

**Date:** 2026-08-15
**Method:** Read-only code audit against the actual repository at commit `f04c3de` (branch `claude/otc-ai-trading-platform-7i3zon`), followed by live execution of every available verification command. No claim below is taken from prior session summaries — every PASS/PARTIAL/FAIL was re-derived from the file paths and line numbers cited.

**Important scope note, stated up front rather than buried:** this audit request describes a much larger system than what was actually built in this repository's history — a Strategy Registry, a Meta-Strategy Selector, an Independent Red Team Agent with `HARD_VETO` power, a "Strategy Lab" frontend, a locked/immutable final holdout, and drawdown-triggered `REDUCE`/`DEFENSIVE`/`HALT` portfolio states. **None of these exist anywhere in the codebase.** A full-repository grep for every one of these terms returned zero matches outside this new audit document. What exists instead is a single-model (not multi-strategy) research and paper-trading platform: one heuristic/ML ensemble scoring engine, one deterministic risk policy, a Champion/Challenger promotion gate for that one model, Paper Trading, monitoring/drift/Safe-Mode, and — as of the two most recent phases — an Admin console and beta-plan entitlements. The matrix below reports each requested item honestly against what is actually present, not what the requirements imply should exist.

---

## 1. Requirement Matrix

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Strategy Registry and all implemented strategies | **FAIL** | No registry abstraction exists anywhere (`grep -rli "strategy.registry\|StrategyRegistry" backend/app` → 0 hits). Exactly two hardcoded strategy functions exist, not registered/pluggable: `simple_momentum_signal` (`backend/app/services/backtest/strategy.py:27-53`) and `ai_ensemble_signal` (`backend/app/services/backtest/strategy.py:56-75`). The backtest engine imports one of them directly (`backend/app/services/backtest/engine.py:21`) — there is no mechanism to list, add, or select among strategies at runtime. |
| 2 | Point-in-time and lookahead protection | **PASS** | `backend/app/services/backtest/engine.py:1-9` (docstring: "no lookahead: every signal is computed only on data up to and including the current bar"); enforced concretely at `engine.py:145` — `entry_bar_idx = signal_idx + 1` (signal computed on bar *i*, filled on bar *i+1*, never the signal's own bar). `backend/app/services/backtest/walkforward.py:38-44` — features built only from `df.iloc[:end_idx+1]`, labels look strictly forward from `end_idx`. |
| 3 | Walk-forward validation | **PASS** | `backend/app/services/backtest/walkforward.py` (151 lines) — real expanding-window walk-forward: per-fold train-strictly-on-past / test-strictly-on-future split (`walkforward.py:96-121`), AUC + 4-bucket calibration reporting. Exposed via `POST /backtest/walk-forward` (`backend/app/api/v1/endpoints/backtest.py:11-23`). Verified passing: `test_walkforward.py` (part of the 13-test run cited in §2). |
| 4 | Locked final holdout | **PARTIAL** | A temporal holdout exists and is genuinely never touched during training: `champion_challenger.py:55` (`HOLDOUT_FRACTION = 0.25`), split at `champion_challenger.py:217-220`, and `challenger.fit(X_train, y_train, ...)` (`champion_challenger.py:223`) never receives `X_hold`/`y_hold`. But it is **not locked** in any formal sense — no immutable file, no checksum, no access control; it is a fresh 25%-newest slice recomputed from whatever graded outcomes exist at training time. A future change to `train_challenger()` could start using it for tuning with no technical barrier stopping that. |
| 5 | Realistic execution costs | **PASS** | `backend/app/services/backtest/broker_sim.py` — spread half-cost, slippage in bps, participation-based partial fills, gap-triggered halts (`broker_sim.py:20-50`). Config surface: `commission_bps`/`slippage_bps`/`halt_gap_threshold_pct`/`halt_prob_given_gap` (`backend/app/services/backtest/engine.py:27-30`). |
| 6 | Robustness and overfitting tests | **FAIL** | No dedicated robustness/overfitting/sensitivity-analysis suite exists. All "Monte Carlo" hits in the codebase (`backend/app/services/ml/forecasting.py:43,63`) are price-path probability forecasting for the scoring engine, not a strategy-robustness stress test. Walk-forward validation (#3) partially substitutes by testing out-of-sample, but there is no parameter-perturbation, noise-injection, or bootstrap-resampling robustness suite anywhere. |
| 7 | Strategy promotion gates | **PARTIAL** | No *strategy* promotion gate exists (there is no Strategy Registry to gate). A real, hard-enforced **model** promotion gate exists instead: `champion_challenger.py:277-284` (`PromotionRefused` exception) and `promote_model()` (`champion_challenger.py:287-332`), which re-derives the pass/fail verdict from stored metrics on every call (never trusts a cached boolean) and refuses promotion unless the challenger beats the heuristic **and** three baselines (logistic regression, single-indicator momentum, "always take the trade") on out-of-sample AUC (`champion_challenger.py:235-251`). Verified passing: `test_champion_challenger.py` (13/13, see §2). |
| 8 | Meta-Strategy Selector | **FAIL** | Does not exist. Zero matches for `meta.strategy`, `MetaStrategy`, or `strategy.selector` anywhere in `backend/app`. |
| 9 | Independent Red Team Agent | **FAIL** | Does not exist. Zero matches for `red.team`, `RedTeam`, or `HARD_VETO` anywhere. The closest adjacent system, `backend/app/services/agents/oversight.py` (`ManipulationDetective`, `ContrarianAnalyst`, `RiskManager`, `PortfolioManager`), is advisory-only: it feeds the `/deliberation` narrative endpoint and is never imported by `services/risk/engine.py` or `services/paper_trading/engine.py` (confirmed by grep — no reference to `judge.py`/`oversight.py` in either file). It has no veto power over any execution path. |
| 10 | Unified Conservative Growth risk profile | **PARTIAL** | A genuine unified risk policy exists and is shared correctly: `backend/app/services/risk/policy.py` (`RiskPolicy`, versioned via `POLICY_VERSION`), consumed identically by the scanner (`services/scanner/multi_asset.py`), the Signal Engine (`services/signals/engine.py`), and Paper Trading (`services/paper_trading/engine.py:95`). But it is a single fixed policy, never named "Conservative Growth" anywhere in the codebase, and there is no multi-profile system (Conservative/Moderate/Aggressive) to select between. |
| 11 | Champion/Challenger and rollback | **PARTIAL** | Champion/Challenger: **PASS**, see #7. Rollback: **FAIL** — `backend/app/api/v1/endpoints/models.py` has exactly three routes (`list_models`, `train-challenger`, `{version_id}/promote`; confirmed by grep, no fourth route). There is no endpoint or service function to revert an already-promoted champion back to a prior `ModelVersion`; the only path back is training a new challenger that happens to beat the current champion. |
| 12 | Paper Trading | **PASS** | `backend/app/services/paper_trading/engine.py:2` and `backend/app/db/models/paper_trading.py:11` both state explicitly: "No real-money broker integration exists or is planned." Every open is gated through the same `evaluate_risk()` used by the scanner (`paper_trading/engine.py:86`, passing `db=db` so the live Safe Mode override applies — added Phase 11). Live-verified this session: forcing Safe Mode on via `/admin` genuinely blocked a paper-trade `POST /paper-trading/positions` with `400 "Safe Mode is active platform-wide"`; clearing it let the trade proceed to its own risk-gate merit. Automated coverage: `e2e/admin-safe-mode.spec.ts` (passing, see §2). |
| 13 | Monitoring, drift detection and SAFE_MODE | **PASS** | `backend/app/services/monitoring/service.py` (155 lines) — `build_health_report()` covers drift, prediction accuracy/calibration, provider failures, scanner freshness, API latency, database health, and named-threshold alerts. `backend/app/services/monitoring/drift.py` (106 lines) — PSI-based population-stability drift. Safe Mode: env-level kill switch in `services/risk/engine.py`, promoted to a live-togglable DB-backed override in `services/platform_settings.py` (Phase 11), exposed at `GET/POST /admin/safe-mode` (`api/v1/endpoints/admin.py:41-53`). Live-verified end-to-end this session (see #12) and via `e2e/admin-safe-mode.spec.ts`. |
| 14 | Experiment tracking and auditability | **FAIL** | No experiment-tracking system exists (no MLflow-equivalent; zero matches for `experiment.track`/`ExperimentTrack`/`mlflow`). No general-purpose audit log exists (zero matches for `AuditLog`/`audit_trail`). Partial attribution only: successful training runs persist their full comparison in `ModelVersion.training_metrics` (`champion_challenger.py:238-252`), and Safe Mode changes record `updated_by_user_id`/`updated_at` (`db/models/platform_setting.py:23-24`). **Failed training attempts are not recorded anywhere** — `NotEnoughHistory` (`champion_challenger.py:92-97`) is raised and logged transiently only; no DB row is ever written for a failed/refused training or promotion attempt. |
| 15 | Strategy Lab frontend | **FAIL** | Does not exist. `frontend/app/backtest/page.tsx` is a single-strategy backtest-run page (form → one run → one result), not a "Strategy Lab" — no strategy browser, no multi-strategy comparison, no registry UI. Zero matches for `strategy.lab`/`StrategyLab` in `frontend/`. |
| 16 | Backend, frontend and E2E tests | **PASS** | Backend: 396 passed, 10 skipped, 0 failed. Frontend (vitest): 40 passed, 0 failed, 8 files. E2E (Playwright): 5 passed, 0 failed. Full commands and output in §2. |
| 17 | Database migrations | **PASS** | 13 Alembic revisions (`backend/alembic/versions/`), verified this session: fresh-DB upgrade-from-scratch succeeds end to end, and `alembic revision --autogenerate` immediately after produces an **empty** diff (`pass` / `pass`) — no drift between the ORM models and the migration history. |
| 18 | Deployment configuration | **PASS** | `docker-compose.yml` (TimescaleDB + Redis + api + two worker services), `DEPLOYMENT.md`, `backend/Dockerfile:35` — `CMD python scripts/run_migrations.py && exec uvicorn app.main:app ...` (migrations run and must succeed before the app process ever starts serving traffic). Production boot guards in `backend/app/main.py:19-77` refuse to start with: the default dev `SECRET_KEY`, `AUTH_REQUIRED=false`, a synthetic/mock data provider (unless `ALLOW_SYNTHETIC_DATA=true` is explicit), `DEBUG=true`, the default localhost `CORS_ORIGINS`, or the default localhost `DATABASE_URL`. |
| 19 | Live-data readiness | **PARTIAL — documented infrastructure blocker, not a code gap** | Real provider adapters exist (`backend/app/services/data_providers/real_providers.py`, `alphavantage_provider.py`, and others per `registry.py`), but no market-data API key is configured in this sandbox; `market_data_provider` defaults to `"mock"` (`backend/app/core/config.py:80`). This has been an explicitly documented, unchanged blocker since Phase 1 of this project's ledger — implementation is complete, credentials are not available in this environment. |
| 20 | ML model artifact readiness | **PASS (honestly labeled, currently un-trained)** | No `.pkl` artifact is committed or present anywhere in the repo (`find . -iname "*.pkl"` → empty). `load_latest_model()` returns `None` when the artifact file is absent (`backend/app/services/ml/training_pipeline.py:158-164`), which makes every `EnsembleModel()` instance run untrained and fall back to `_heuristic_prior()`. This state is **honestly surfaced**, not hidden: every prediction is stamped `engine_mode: "HEURISTIC" | "TRAINED_ML"` (`services/ml/ensemble.py`), and the frontend Performance page renders this distinction explicitly with an explanation of what each mode means (`frontend/app/performance/page.tsx:85-86`). Today, the platform is running 100% on `HEURISTIC` until an operator accumulates ≥40 graded outcomes and successfully trains+promotes a challenger. |

---

## 2. Verification Commands Run

All commands were executed against the actual repository in this session; no result below is copied from an earlier summary.

### Backend

| Command | Result |
|---|---|
| `python3 -m pytest app/tests/ -q` | **396 passed, 10 skipped, 0 failed** (215.5s) |
| `python3 -m pytest app/tests/test_champion_challenger.py app/tests/test_walkforward.py app/tests/test_backtest_engine.py -q` | 13 passed, 0 failed (cited standalone for §1 items 3 & 7) |
| Backend lint/type-check (`ruff`, `mypy`) | **NOT CONFIGURED** — `pip show ruff mypy` reports both not installed; no `pyproject.toml`/`.flake8`/`mypy.ini` exists; `.github/workflows/ci.yml` runs `pytest` only for the backend job, never a linter or type-checker. This is a genuine, standing gap, reported honestly rather than fabricated as a passing run. |
| `pip-audit` / `safety` (Python dependency vulnerability scan) | **NOT RUN** — neither tool is installed in this environment. |

### Frontend

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run lint` | Clean, 0 errors/warnings |
| `npm test` (vitest) | **40 passed, 0 failed**, 8 test files |
| `npm run build` | Successful production build. Route table lists 16 entries: `/`, `/_not-found`, `/admin`, `/alerts`, `/backtest`, `/billing`, `/chat`, `/login`, `/manifest.webmanifest`, `/opportunities`, `/paper-trading`, `/performance`, `/portfolio`, `/register`, `/stock/[ticker]` (dynamic), `/watchlist` |
| `npx playwright test` (E2E, live backend) | **5 passed, 0 failed** — `admin-safe-mode.spec.ts` (1), `alerts.spec.ts` (3), `billing.spec.ts` (1) |
| `npm audit --omit=dev` (production dependency vulnerabilities) | **4 high-severity advisories**, all in `next@16.2.10` (Server Actions DoS/SSRF, Turbopack middleware bypass, cache-response confusion, unauthenticated internal-endpoint disclosure) and its transitive `postcss`/`sharp`. Fix available via upgrade to `next@16.3.1` — **not applied in this audit**; a minor-version framework bump is a deliberate, testable change outside this read-only audit's scope, not something to slip in as a side effect. Flagged as the top remaining action in §5. |

### Database migrations

| Check | Result |
|---|---|
| Fresh-DB `alembic upgrade head` | Applies all 13 revisions in order, exit 0 |
| `alembic revision --autogenerate` immediately after | Generates an **empty** migration (`pass`/`pass`) — model/migration state confirmed in sync, no drift |
| Deployment wiring | `backend/Dockerfile:35` runs migrations before the app boots; fails the deploy (non-zero exit) if they fail |

### Security checks

| Check | Result |
|---|---|
| Committed secrets (`sk-...`, AWS keys, PEM private keys) | **0 found** — `git grep` across all tracked files |
| Hardcoded secret-shaped assignments (`api_key = "..."`, `secret_key = "..."`) outside test fixtures/docs | **0 found** |
| API key exposure to logs/errors | Protected — `sanitize_url()` strips `token`/`apikey`/`api_key`/`key` query params before any URL reaches a log line or error message (`backend/app/services/data_providers/http_base.py:19-24`, used at lines 125/130/136) |
| API key exposure to the browser | Protected — the frontend's only environment variable is `NEXT_PUBLIC_API_URL` (a URL, not a secret) (`frontend/lib/api.ts:37`, `frontend/.env.example:5`); no market-data API key is ever read by frontend code |
| TODO/FIXME/XXX/HACK markers in production source | **0 found** (backend and frontend, excluding tests) |
| Placeholder/"coming soon"/lorem-ipsum content in production components | **0 found** |
| "Fabricat.../fake_/dummy_data" hits in production backend source | All 18 matches are **anti-fabrication guardrail comments** (e.g. `market_data_fallback.py:9` "...never fabricated data", `mock_provider.py:85-86` "Fabricating a company for an arbitrary string is fabricated financial data") — none are actual fabrication code |
| `git status` at audit start and end | Clean both times — no uncommitted changes; this audit made no code changes (no confirmed defect was found that required a fix) |

---

## 3. The 15 Specific Verification Items

1. **Production provider cannot silently fall back to mock/synthetic data.** **PASS.** `backend/app/main.py:19-45` refuses to boot in `environment=production` if the resolved provider's `data_mode == "synthetic"`, unless `ALLOW_SYNTHETIC_DATA=true` is explicitly set. A misconfigured *real* provider (bad/missing key) is handled separately and correctly: it raises `ProviderDataUnavailable` per request → structured `503`, never silent synthetic substitution.
2. **No API key can reach the browser or logs.** **PASS.** See §2 Security checks.
3. **The ML layer clearly identifies trained artifact vs. heuristic fallback.** **PASS.** `engine_mode: "HEURISTIC" | "TRAINED_ML"` stamped on every analysis/prediction and rendered distinctly in the frontend (`frontend/app/performance/page.tsx:85-86`; also `frontend/lib/types.ts` `StockAnalysis.engine_mode`).
4. **Backtests cannot use future data.** **PASS.** See §1 item 2.
5. **Signals execute no earlier than the next tradable bar.** **PASS** for the backtest engine (`engine.py:145`, `entry_bar_idx = signal_idx + 1`). Live paper trading fills at the current live quote at click time, which is the correct behavior for a live system (not a lookahead concern — there is no "future" bar to peek at in live execution).
6. **Final holdout data cannot be used for tuning.** **PASS in current code, not formally enforced.** See §1 item 4 — `.fit()` never receives holdout rows, but nothing technically prevents a future change from doing so.
7. **Failed experiments are recorded.** **FAIL.** See §1 item 14.
8. **Strategy selection is not based only on historical return or win rate.** **N/A / PARTIAL.** No strategy-selection system exists to evaluate (see #1, #8 in the matrix). Where an analogous decision *does* exist — model promotion — it correctly avoids naive return/win-rate: the gate is out-of-sample AUC plus calibration gap and Brier score (`champion_challenger.py:106-119`), not historical return or win rate.
9. **Red Team `HARD_VETO` actually blocks execution.** **FAIL.** The concept does not exist (see §1 item 9).
10. **Drawdown limits activate `REDUCE`, `DEFENSIVE` and `HALT` states.** **FAIL.** `REDUCE` exists only as a *per-position* signal-lifecycle status derived from technical/risk deterioration of a single ticker (`signals/engine.py:60`), not a portfolio-level automatic drawdown trigger. `DEFENSIVE` and `HALT` do not exist as named states anywhere. `max_drawdown_pct` exists only as a **backtest performance metric** (`backend/app/services/backtest/metrics.py:26-32`), never as a live trigger. Safe Mode is the closest real mechanism, but it is a manual operator toggle, not an automatic drawdown-triggered state machine.
11. **Paper Trading never submits a real broker order.** **PASS.** See §1 item 12 — no broker integration code exists anywhere in the repository, confirmed by exhaustive grep.
12. **Every performance result is labeled Backtest/Validation/Holdout/Paper/Live.** **PARTIAL.** Provenance *is* tracked and never mixed: separate pages/features exist for backtest results (`/backtest`), walk-forward validation (`POST /backtest/walk-forward`), the production prediction ledger (`/performance`, tagged by `engine_mode`), and Paper Trading (`/paper-trading`, its own real-time ledger). But there is no single unified tag literally reading "Backtest"/"Validation"/"Holdout"/"Paper"/"Live" attached uniformly to every displayed number — provenance is implicit in which page/field you're looking at, not an explicit per-metric label.
13. **2026 is labeled 2026 YTD and never presented as a complete year.** **FAIL / feature does not exist.** No calendar-year-bucketed return computation exists anywhere in the codebase (zero matches for `YTD`, `year.to.date`, `full.year`, `calendar.year`). There is nothing to mislabel because the annual-return feature this requirement protects against was never built.
14. **Alembic migrations are part of deployment.** **PASS.** See §1 item 18 / §2.
15. **Authentication, monitoring, and sensitive endpoints are protected.** **PASS for personal/admin/sensitive data**, with one design note. `/monitoring/health`, every `/admin/*` route, `/watchlist`, `/alerts/*`, `/paper-trading/*`, `/portfolio`, and all `/models` and `/universe` write routes all require `get_current_user` and/or `require_operator` (spot-checked across all 18 endpoint files this session). **Design note, not a defect:** `/stocks/*` market-research reads (search, analysis, indicators, news, fundamentals) carry no auth dependency at all (`backend/app/api/v1/endpoints/stocks.py`) and remain fully anonymous even with `AUTH_REQUIRED=true` — this appears to be an intentional "free public research" design matching the pattern already documented for `/universe` reads, but it means an anonymous visitor gets the full research product without ever needing a `free`/`pro` plan, which is worth a deliberate product decision before a commercial public beta (see §5).

---

## 4. Result Summary

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Backend (pytest) | 396 | 0 | 10 |
| Frontend (vitest) | 40 | 0 | 0 |
| E2E (Playwright) | 5 | 0 | 0 |
| **Total** | **441** | **0** | **10** |

Matrix tally (§1, 20 items, by each row's stated verdict): **9 PASS**, **5 PARTIAL**, **6 FAIL** — the 6 FAIL items are Strategy Registry (#1), Robustness/overfitting tests (#6), Meta-Strategy Selector (#8), Independent Red Team Agent (#9), Experiment tracking/auditability (#14), and Strategy Lab frontend (#15).

---

## 5. Remaining Blockers, Risks, and Readiness

### External blockers (infrastructure, not code)
- No real market-data API key configured (`MARKET_DATA_PROVIDER=mock` by default) — blocks live-data verification and any real predictive signal. Adapters exist; credentials do not.
- No LLM API key configured — the chat backend runs on its "template" (non-LLM) mode by design fallback, not a defect.

### Remaining code blockers (if the full master-prompt vision is the target)
1. No Strategy Registry / multiple pluggable strategies — only two hardcoded backtest strategies exist.
2. No Meta-Strategy Selector, no Independent Red Team Agent with veto power, no Strategy Lab frontend.
3. No automatic drawdown-triggered `REDUCE`/`DEFENSIVE`/`HALT` portfolio state machine — Safe Mode is manual-only.
4. No experiment-tracking system; failed training attempts leave no persistent record.
5. No rollback path from a promoted champion back to a prior `ModelVersion`.
6. No backend lint/type-checking tooling configured (ruff/mypy absent, not in CI) — real correctness/type-safety risk that TODOs/fabrication scans and pytest alone don't cover.

### Security risks
1. **`next@16.2.10` carries 4 high-severity advisories** (Server Actions DoS/SSRF, Turbopack middleware bypass, cache-response confusion, unauthenticated internal-endpoint disclosure), fixable by upgrading to `next@16.3.1`. Not applied in this audit (see §2) — recommended as the top next action.
2. Public, unauthenticated market-research endpoints (`/stocks/*`) remain fully open even with `AUTH_REQUIRED=true` — not a defect, but a product decision that should be made deliberately before commercial launch, not left implicit.
3. No Python dependency vulnerability scan was possible in this environment (`pip-audit`/`safety` unavailable) — backend dependency risk is currently unverified.

### Readiness

- **Local research use: READY.** All core research, scoring, alerts, monitoring, and backtest functionality works end to end today, honestly labeled as running on synthetic (mock) market data.
- **Paper trading: READY**, conditional on connecting a real market-data provider. The Paper Trading system itself is safe, risk-gated, Safe-Mode-covered, has no broker integration to misuse, and is fully tested (unit + E2E). It is only as useful as the price data behind it, which is currently mock/synthetic in this environment.
- **Public beta: NOT YET READY.** Phase 13's plan/entitlement/Admin-user-management scaffolding is real and tested, but three concrete items should close first: (a) resolve the `next` security advisories, (b) make a deliberate decision about anonymous access to `/stocks/*` under a commercial plan model, (c) add backend lint/type-checking to CI so regressions aren't caught by tests alone.
- **Real-money trading: NOT READY, BY DESIGN.** No broker integration exists anywhere in the codebase — this is correct and intentional, not a gap to close casually. Reaching it would require broker integration, the drawdown-triggered halt states, and the Red Team veto layer described in the master prompt, none of which exist today.

### Overall honest completion percentage

**~55%** against the full scope described in this audit's master prompt (Strategy Registry, Meta-Strategy Selector, Red Team Agent, locked holdout, drawdown state machine, experiment tracking, and Strategy Lab are substantial, unbuilt subsystems). **~95%** against the 13-phase specification that was actually executed and delivered in this repository's development history (real-data provenance, migrations, security hardening, unified risk engine, frontend reliability, Paper Trading, prediction ledger, ML Champion/Challenger, charting, alerts, Admin/Operator UI, test expansion, and beta entitlements) — the one code blocker within that scope is the missing backend lint/type-check tooling.

### Next three actions, in priority order

1. **Resolve the `next@16.2.10` high-severity advisories** — run `npm audit fix --force` in `frontend/`, then re-run the full frontend verification sweep (tsc/lint/vitest/build/E2E) before committing, since this is a minor version bump with real behavioral risk per the repo's own `AGENTS.md` warning.
2. **Decide and implement the anonymous-access policy for `/stocks/*`** before any public beta launch — either require a plan-scoped account for research reads too, or explicitly document free anonymous research as the intended funnel into the plan system built in Phase 13.
3. **Stand up backend lint/type-checking in CI** (ruff + mypy, matching the frontend's existing `npm run lint` gate) — this is the single largest verification gap found in this audit, and closing it is low-risk, high-value groundwork before attempting any of the larger unbuilt subsystems (Strategy Registry, Red Team veto, drawdown state machine) named in this audit's master prompt.
