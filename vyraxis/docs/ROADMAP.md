# VYRAXIS — Roadmap

Each phase must be testable before the next begins. A phase is complete when its
acceptance criteria are demonstrated by executed tests, not when its code exists.

**Current position: Phase 1 complete. Phase 2 is next.**

---

## Phase 0 — Foundation ✅ COMPLETE

Architecture, configuration, database, logging, tests, local environment.

- [x] Module boundaries and dependency rules (`ARCHITECTURE.md`)
- [x] `pydantic-settings` configuration with validation and `SecretStr`
- [x] Structured logging with a non-bypassable secret-redaction processor
- [x] Exact decimal money layer; `float` rejected at the boundary
- [x] UTC-only clock abstraction; naive datetimes rejected
- [x] PostgreSQL schema, Alembic migration, round-trip tested
- [x] pytest infrastructure against a real database
- [x] Health registry, health/status HTTP API, CLI
- [x] `.env.example`, `.gitignore`, README

## Phase 1 — Data Engine ✅ COMPLETE

Solana connectivity, event ingestion, token/pool discovery, persistence.

- [x] Resilient WebSocket client: backoff + jitter, resubscribe, stale detection
- [x] JSON-RPC HTTP client with transient/permanent error classification
- [x] Log-marker classification into normalized events with reason codes
- [x] Transaction enrichment (mint, wallet, amounts, direction)
- [x] Two-layer deduplication (in-process cache + database UNIQUE)
- [x] Batched transactional persistence with exact insert/duplicate counting
- [x] Discovery observations with scheduled future horizons
- [x] Health checks and durable `system_events`

Evidence for all ten acceptance criteria: **`PHASE1_EVIDENCE.md`**.

## Phase 2 — RugGuard 🔜 NEXT

Deterministic security analysis, executed **before** any opportunity scoring.

- [ ] Mint/freeze authority state via `getAccountInfo` (decoder already exists)
- [ ] Token-2022 extension parsing (transfer fees, transfer hooks, permanent delegate)
- [ ] Holder concentration via `getTokenLargestAccounts`
- [ ] LP token supply, burn status and lock detection
- [ ] Liquidity depth and sudden-withdrawal detection
- [ ] Developer allocation and developer-wallet behaviour
- [ ] Funding-source clustering (common funder → coordinated wallets)
- [ ] Severity classification: INFO / LOW / MEDIUM / HIGH / CRITICAL
- [ ] `rug_risk_score` 0–100 plus structured reason codes
- [ ] `HARD_REJECT` on critical findings

**Non-negotiable:** no opportunity or momentum signal may override a critical
RugGuard rejection. This is enforced by the decision engine's structure, not by
a configuration flag.

**Acceptance:** deterministic given identical inputs; every score decomposes
into named findings; hard-reject verified by test.

## Phase 3 — Feature Engine

Market, flow, liquidity and wallet features derived from stored events only.

- [ ] Momentum: short-horizon returns, acceleration, volatility regime
- [ ] Flow: buy/sell imbalance, unique-buyer acceleration, sell pressure
- [ ] Liquidity: growth, stability, trade-size feasibility
- [ ] Lifecycle: token age, pool age, holder growth
- [ ] Immutable `feature_snapshots` with a schema version

**Acceptance:** every feature computed strictly from rows with
`observed_at <= t`; a leakage test asserts it mechanically.

## Phase 4 — Historical Dataset

- [ ] Horizon observation capture worker
- [ ] Outcome labels computed **only** from observations that already occurred
- [ ] Dead/rugged tokens retained (survivorship bias is a defect, not tidiness)
- [ ] Dataset validation: leakage, class balance, coverage, missingness

**Acceptance:** a label at horizon *h* provably uses no data before *h*.

## Phase 5 — Backtester

Event-driven, deliberately pessimistic. See `BACKTEST_INTEGRITY.md`.

- [ ] Event-driven replay ordered by `observed_at`
- [ ] Execution model: slippage, price impact, fees, priority fees, latency,
      failed transactions
- [ ] Full metric set including profit factor, expectancy, max drawdown
- [ ] Robustness sweeps: worse slippage, latency, fees, random failures
- [ ] Performance after removing the top 1% / 5% / 10% of trades

**Acceptance:** integrity tests pass; a known-losing strategy is reported as
losing.

## Phase 6 — Baseline Strategy

Transparent scoring and risk rules. See `RISK_MODEL.md`.

- [ ] Deterministic opportunity scoring from named features
- [ ] Risk engine independent of signal generation
- [ ] Position sizing, stops, targets, trailing, daily loss limit, kill switch

**Acceptance:** every decision reproducible from its stored inputs.

## Phase 7 — Paper Trading

- [ ] Live forward testing on the same scanner, RugGuard, features, decision,
      risk and execution assumptions as a live path would use
- [ ] Paper orders, fills and positions persisted
- [ ] Reconciliation between paper assumptions and observed market behaviour

**Acceptance:** paper trading consumes only information available at decision
time; no future knowledge, verified by test.

## Phase 8 — Learning Engine

Interpretable first; complexity only when the evidence justifies it.

- [ ] Deterministic baseline → statistical models → tree-based ML
- [ ] Chronological train / validation / out-of-sample splits, never random
- [ ] Walk-forward evaluation
- [ ] Model versioning; every prediction names the model that produced it

**Acceptance:** no model trains on data unavailable at its own decision time;
out-of-sample results are never used for optimisation.

## Phase 9 — Live Execution 🔒 BLOCKED

**Requires explicit written authorisation and successful validation of every
prior phase. Not implemented. Cannot be enabled.**

Preconditions, all of which must hold:

1. Positive out-of-sample expectancy that survives the robustness sweeps
2. Profitability that is not concentrated in the top 1% of trades
3. Paper trading results consistent with backtest expectations
4. RugGuard validated against known historical rug pulls
5. Dedicated trading wallet, minimal capital, spending limits, kill switch
6. Explicit human authorisation, recorded

Until then `VYRAXIS_SAFETY__LIVE_TRADING_ENABLED=true` is rejected at startup.

## Phase 10 — Dashboard

Dark UI exposing reasoning, not just BUY/SELL: portfolio, scanner, decision feed
with reason codes, analytics, strategy versions.

---

## The ordering is the safety mechanism

```
DATA → SECURITY → FEATURES → BACKTEST → ROBUSTNESS
     → PAPER TRADING → OUT-OF-SAMPLE VALIDATION → LIMITED LIVE CAPITAL
```

This order is never reversed to produce impressive results sooner. A dashboard
built before the backtester would make an unvalidated system *look* trustworthy,
which is worse than having no dashboard at all.
