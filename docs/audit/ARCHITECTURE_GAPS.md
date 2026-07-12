# Architecture Gaps

Audit date: 2026-07-12. Reference: `SYSTEM-ARCHITECTURE.md` (the blueprint) vs. what exists. Per the standing instruction, gaps discovered against a better architecture get a migration proposal, not silence.

## G1 — Frontend/backend capability gap (largest gap in the system)

The backend outgrew the UI by roughly three development phases. **API-only, no UI consumer:** price history (no chart!), news, deliberation/dossier, scanner history+decisions, prediction history, calibration/model performance, model registry (champion/challenger), portfolio health, monitoring health, walk-forward.
**Migration:** close in vertical slices, starting with the P0 slice (search→card→chart→analysis→sources); then Scanner History, Model Performance, Portfolio Health panels. No disconnected placeholders — each panel ships only with its data wired.

## G2 — Read-model architecture not yet engaged (by design, watch the trigger)

API still computes on demand at 25–30 tickers (TTL cache). Blueprint (D3/FR-205) requires workers-write/API-reads beyond ~500 tickers. **Trigger defined; Redis Streams chosen; not yet needed.** No action now — but scanner v2's persisted decisions are the natural read model seed: dashboard endpoints should progressively read `scan_decisions` instead of recomputing (partial migration can start in P2).

## G3 — Worker/API deployment coupling

`docker-compose` runs alembic nowhere — both API and worker rely on `create_all` at startup. **Migration:** compose entrypoint gains `alembic upgrade head` before app start (P1); CI gains the models-vs-migrations drift gate (`alembic check`) it was promised (P1, one job step).

## G4 — EDGAR ingestion inside the scan worker process

Blueprint calls EDGAR its own failure domain; today it's a phase in the scan loop. Acceptable at current scale, but one sec.gov stall delays scanning. **Migration:** extract to its own worker/service when scan cadence tightens or universe grows (P2); the code is already a self-contained module so the extraction is a compose entry, not a refactor.

## G5 — LLM chat backend untested against live vendor

The agentic loop is implemented but has never executed against the real Anthropic API in this environment. Structural tests pass; live behavior (tool_use schemas, token limits) is unverified. **Migration:** behind-a-flag smoke test executed in an environment with a key + recorded-cassette tests (P1 before advertising the LLM mode).

## G6 — Backtest results not persisted

`backtest_results`/`backtest_trades` tables exist and are empty forever; every run is ephemeral. Named, reproducible experiments were the point of those tables. **Migration (P2):** persist on `/backtest/run` with `strategy_config`, list endpoint, UI history.

## G7 — Analysis contract lacks provenance

`StockAnalysis` has no `data_source`/`data_mode`/`as_of`. Every consumer (UI, chat tools, dossier) inherits the blindness. **Fixed in the P0 slice** — fields added at the contract level so all surfaces inherit the label instead of each inventing one.

## G8 — In-process caches assume single replica

TTL analysis cache + provider fact cache + monitoring counters are per-process. Correct at one replica; silently divergent at N. Blueprint already specifies Redis for L2/L3 + scrape-time aggregation for counters (NFR-S3, §11). **Trigger:** first horizontal scale-out (P2/P3). No code change now; recorded so it is not "discovered" in production.

## G9 — No provider failover / staleness surfacing (FR-107)

A finnhub outage today = hard errors (honest, but availability-poor). Blueprint: primary→secondary→stale-cache-with-banner. Depends on a second implemented provider (Polygon) — P2, after slice + auth.

## G10 — Single chat session namespace

`session_key` is client-chosen with no user binding — any client can read any session by guessing keys. Folded into the auth work (FR-1100, P1): sessions become user-owned.
