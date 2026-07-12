# Prioritized Improvement Plan

Audit date: 2026-07-12. Levels: **P0** critical correctness/security · **P1** required for a reliable MVP · **P2** important product improvement · **P3** advanced future capability.

## P0 — Critical correctness (→ implemented in this audit's vertical slice)

| ID | Item | Why P0 |
|---|---|---|
| P0-1 | **Data provenance in the analysis contract**: `data_source`, `data_mode` (synthetic/delayed-EOD/…), `as_of`, `price_as_of` on `StockAnalysis`; propagated to chat/dossier; **visible labels in the UI** | "Never silently use demo data" was being violated: a user on the default config sees synthetic numbers with no label |
| P0-2 | **Ticker validation**: mock must stop fabricating unknown symbols; add `GET /stocks/search` (validate + lookup) with symbol-format guard | Fabricated companies = fabricated financial data, the cardinal sin |
| P0-3 | **The vertical slice** (search → validate → real lookup → info card → price chart w/ entry/stop/target markers → AI + risk + contrarian → sourced, timestamped answer) | The product's spine must be honest end-to-end before anything else grows |

## P1 — Reliable MVP

| ID | Item | Notes |
|---|---|---|
| P1-1 | Authentication + per-user data + rate limits (JWT+refresh per §6); session-hijack fix; refuse default SECRET_KEY in production | Blocks ANY non-localhost deployment (S1–S4) |
| P1-2 | Compose/deploy hygiene: alembic in entrypoints, `alembic check` gate in CI, prod config disables open /docs | G3, S6 |
| P1-3 | Surface the backlog UIs: Scanner History, Model Performance/calibration, Portfolio Health panels | G1; APIs exist and are tested |
| P1-4 | LLM backend live smoke test + recorded-cassette tests; only then advertise the mode | G5 |
| P1-5 | Model artifact provenance: stamp data source; refuse cross-source champion promotion | AI_RELIABILITY #4 |
| P1-6 | Provider failover + staleness banner (needs Polygon implemented as secondary) | FR-107/G9 |

## P2 — Important product improvements

| ID | Item |
|---|---|
| P2-1 | FinBERT-class news sentiment + promotion classifier (wakes the dormant promo-campaign detector on live data) |
| P2-2 | Persist backtest runs + history UI (G6); walk-forward result storage |
| P2-3 | Scanner→read-model migration start: dashboard reads scan_decisions (G2) |
| P2-4 | EDGAR phase 2: going-concern full-text, Forms 3/4/5 insider activity, reverse-split extraction; extract ingester worker (G4) |
| P2-5 | Watchlist alerting (risk-flag transitions) + push channel |
| P2-6 | Dependency/image scanning in CI; request-size limits (S7/S5) |
| P2-7 | Real paper-trading engine (simulated fills vs. quotes) replacing the manual position log label |

## P3 — Advanced future capabilities

| ID | Item |
|---|---|
| P3-1 | Sequence-model forecaster replacing EWMA Monte-Carlo behind the same interface |
| P3-2 | Similar-setups retrieval (feature-space nearest neighbors over graded history) for Memory Agent + assistant |
| P3-3 | Historical (delisting-inclusive) universe source to kill survivorship bias in live backtests |
| P3-4 | LLM answer number-verification against tool payloads (post-hoc guard) |
| P3-5 | Multi-replica scale-out: Redis L2/L3 caches, counters scrape aggregation, Redis Streams scan fan-out (triggers per blueprint) |
| P3-6 | Optuna hyperparameter studies, versioned |

## Sequencing rationale

P0 items are all *integrity* — they change whether the product tells the truth, so they precede features. P1 is the gap between "works on my machine honestly" and "someone else can rely on it". P2 makes it *good*; P3 makes it *advanced*. Anything that would add surface area while P0/P1 are open (new engines, new screens beyond the slice) is deliberately deferred — the audit's clearest lesson is that the backend already outruns the UI and the trust plumbing.
