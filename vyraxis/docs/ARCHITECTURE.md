# VYRAXIS — Architecture

> **Status:** Phase 0 (foundation) and Phase 1 (data engine) are implemented and
> tested. Everything else in this document is design intent and is explicitly
> labelled as such. Nothing here describes a capability that does not exist
> unless it says "not implemented".

---

## 1. What VYRAXIS is

An autonomous research platform for Solana memecoin activity. Its purpose is to
find out **whether a repeatable, positive-expectancy edge exists** — and to say
so honestly when it does not.

It is not a trading bot. There is no live-money execution path in this codebase,
no key handling, and no signing capability. `VYRAXIS_SAFETY__LIVE_TRADING_ENABLED=true`
is rejected at startup by a configuration validator, not merely ignored.

The research benchmark ($50 → $500 in simulation) is a yardstick, never a
target to be engineered towards. If the strategy loses money, VYRAXIS reports
that it lost money.

## 2. The one principle everything else follows from

**Every stored fact must be reconstructable, and must be attributable to the
moment it was known.**

Two timestamps exist on every event and they are never conflated:

| Field | Meaning | Nullable | Usable for decisions? |
|---|---|---|---|
| `observed_at` | when VYRAXIS received the data | **No** | **Yes** — the only leak-safe ordering key |
| `block_time` | chain-reported slot time | Yes | Only as chain metadata |

`block_time` is nullable because providers do not always supply it. Filling it
from wall clock would fabricate history, so VYRAXIS leaves it null.

Everything else — the immutable observation model, the `PARTIAL` decode status,
the refusal to capture an observation before it is due — is downstream of this
principle.

## 3. Module map

```
                    ┌──────────────────────────────────────────┐
                    │  core/    config · logging · clock ·      │
                    │           money · errors · base58 · types │
                    └──────────────────────────────────────────┘
                                       ▲ (everything may import core)
        ┌──────────────────────────────┼───────────────────────────────┐
        │                              │                               │
┌───────────────┐            ┌──────────────────┐            ┌──────────────────┐
│   solana/     │            │    storage/      │            │ observability/   │
│ provider (IF) │            │ models · engine  │            │ health · checks  │
│ rpc · ws      │            │ repositories     │            └──────────────────┘
│ programs      │            │ migrations       │                     ▲
│ accounts      │            └──────────────────┘                     │
│ subscriptions │                    ▲                                │
└───────────────┘                    │                                │
        ▲                            │                                │
        └──────────┬─────────────────┘                                │
                   │                                                  │
          ┌────────────────────────────────────┐                      │
          │            scanner/                │──────────────────────┘
          │ events · normalizer · enrichment   │
          │ dedup · sink · observations        │
          │ pipeline                           │
          └────────────────────────────────────┘
                   ▲
          ┌────────────────┐     ┌─────────┐
          │     app.py     │────▶│  api/   │   (composition root, HTTP surface)
          └────────────────┘     └─────────┘
```

**Dependency rule.** Arrows point in one direction only. `core` imports nothing
from VYRAXIS. `solana` may import `core`. `scanner` may import `core`, `solana`
and `storage`. Nothing imports `scanner` except `app`, `api` and
`observability`. There are no cycles.

**Provider isolation.** No module above `solana/` may import an HTTP client, a
WebSocket library, or a vendor SDK. Provider payloads cross the boundary exactly
once — as `RawEvent.payload` — and are converted to `NormalizedEvent` inside
`scanner/normalizer.py`. Swapping RPC vendors is a URL change.

## 4. The Phase 1 data path

```
 WebSocket (logsSubscribe + slotSubscribe heartbeat)
   │  RawEvent {stream, provider, received_at, slot, payload}
   ▼
 LogNotificationNormalizer         classify by log markers → EventKind
   │                               decode_status = PARTIAL (logs carry no mint)
   │  NormalizedEvent
   ▼
 DedupCache (LRU, in-process)      cheap first pass; not the guarantee
   │
   ▼
 asyncio.Queue (bounded)           backpressure by default; drops are counted
   │
   ▼
 TransactionEnricher (getTransaction)
   │                               mint, wallet, amounts, direction
   │                               decode_status → DECODED, or stays PARTIAL
   ▼
 EventSink (one batch = one transaction)
   │  1. insert tokens/pools/wallets that are new  → the discovery set
   │  2. bump activity counters
   │  3. insert events  ON CONFLICT (dedup_key) DO NOTHING   ← the real dedup
   │  4. DISCOVERY observation + PENDING horizons for new tokens
   │  5. advance stream checkpoint
   ▼
 PostgreSQL
```

### Why two dedup layers

The `DedupCache` is an optimisation. It is bounded, per-process, and empty after
a restart — so on its own it would let duplicates through in exactly the cases
that matter (replay, restart, two workers). The `UNIQUE` index on
`market_events.dedup_key` is the guarantee. `insert ... ON CONFLICT DO NOTHING
RETURNING id` returns only genuinely inserted rows, so the duplicate count is
measured rather than assumed.

Dedup keys are content-derived and stable across processes:

- transaction-derived: `sig:<signature>:<kind>`
- everything else: `raw:<stream>:<slot>:<sha256 of canonicalised payload>`

Keying on `(signature, kind)` rather than signature alone is deliberate: one
transaction can legitimately create a pool *and* be the first swap into it.
Collapsing them would lose a fact.

### Why the slot heartbeat is not optional

`slotSubscribe` is attached to every connection. Without it, an idle market and
a dead socket are indistinguishable, and stale-detection either fires constantly
or never fires at all. Heartbeats are counted for liveness and then dropped —
they never enter the event stream.

## 5. Failure handling

The system is fail-closed and loud. There is no code path that discards data
without counting it.

| Failure | Response | Where it becomes visible |
|---|---|---|
| WebSocket disconnect | reconnect, exponential backoff + jitter, resubscribe | `metrics.reconnects`, `system_events`, `/health` |
| Silent socket | recycled after `ws_stale_after_seconds` | `metrics.stale_timeouts` |
| Subscription rejected | `PermanentProviderError`, stream stops | raised to caller; never a quiet no-op |
| Malformed frame | counted, logged, skipped | `metrics.protocol_errors` |
| RPC 429 / 5xx / node-behind | retried with backoff | `rpc_retry` log, `consecutive_failures` |
| RPC 4xx | fails immediately, no retry | retrying multiplies rate-limit damage |
| Enrichment failure | event persisted `PARTIAL` + reason code | `ENRICHMENT_RPC_FAILED` in `reason_codes` |
| Flush failure | transaction rolls back, batch counted lost | `sink.events_lost`, `system_events`, `/health` DEGRADED |
| Queue full | backpressure (default) or counted drop | `pipeline.events_dropped`, `/health` DEGRADED |
| Unclassifiable message | stored as `UNCLASSIFIED`/`UNDECODED` with reason | queryable in `market_events` |

An `UNCLASSIFIED` event is not a failure to hide — it is data we could not yet
interpret, kept with its raw payload so a future decoder can reprocess it.

## 6. Honesty rules encoded in the design

These are enforced by code and tests, not convention:

1. **No fabricated values.** Missing data yields `None` plus a reason code.
   `DecodeStatus.PARTIAL` with `token_mint = NULL` is the honest representation
   of "we have not resolved this yet"; a guessed mint would be a fabrication.
2. **No mocks in production paths.** Test doubles live only under `tests/` and
   say so in their module docstrings. When a dependency fails at runtime,
   VYRAXIS reports the failure — it never substitutes a fake.
3. **No floats for money.** Every monetary column is `NUMERIC`; passing a
   `float` into `vyraxis.core.money` raises `TypeError`. A schema-wide test
   asserts no `double precision`/`real`/`money` column exists.
4. **No naive datetimes.** `ensure_utc` rejects them. All 19 timestamp columns
   are `TIMESTAMP WITH TIME ZONE`, asserted by test.
5. **No secrets in logs.** A structlog processor redacts secret-shaped keys,
   URL credentials and query-string API keys on every event, regardless of call
   site.
6. **No future data in a past row.** Horizon observations are created empty with
   a future `due_at`; `capture_due` raises `IntegrityError` if asked to fill one
   early.

## 7. Technology stack and why

| Concern | Choice | Reason |
|---|---|---|
| Language | Python 3.11+ | asyncio maturity; the ML phases live here anyway |
| Async DB | SQLAlchemy 2.0 + asyncpg | typed ORM, and `ON CONFLICT ... RETURNING` for exact dedup counting |
| Database | PostgreSQL 15+ | `NUMERIC`, `JSONB`, partial unique indexes, `SKIP LOCKED` |
| Migrations | Alembic | reversible, reviewable, round-trip tested |
| Config | pydantic-settings | validation at startup; `SecretStr` for credentials |
| Logging | structlog | structured events + a redaction processor that cannot be bypassed |
| WebSocket | `websockets` | mature asyncio client; no vendor SDK |
| HTTP | httpx | async, and `MockTransport` makes retry logic testable |
| API | FastAPI | health/status only |
| CLI | Typer | operator surface |
| Tests | pytest + pytest-asyncio | real Postgres, real sockets |

Deliberately **not** used: microservices (a modular monolith is enough and much
cheaper to operate), a message broker (an `asyncio.Queue` with explicit
backpressure is sufficient at this scale), Kafka, Redis, or an ORM-free raw-SQL
layer.

## 8. Architecture decisions worth recording

**Modular monolith, not microservices.** One process, clear module boundaries,
one database. Splitting into services would add network failure modes and
operational cost for no benefit at this stage. The module boundaries are drawn
so that extraction stays possible if it ever becomes necessary.

**Logs-first discovery, transactions-second enrichment.** `logsSubscribe` is the
only push primitive that reveals new activity without polling, but log lines
carry no mints or amounts. So classification happens from logs (cheap, instant),
and detail comes from a follow-up `getTransaction` on the kinds that justify the
call. Enriching every SPL transfer on the network would cost far more than the
information is worth.

**Enrichment in the consumer, not the producer.** RPC calls take hundreds of
milliseconds. Doing them on the socket-read path would stall ingestion and get
the subscription dropped. They run in the batch consumer behind a semaphore.

**Later-phase tables are documented, not created.** `decisions`, `features`,
`backtest_runs` and the rest are specified in `DATA_MODEL.md` and will arrive in
the migration that introduces the code writing to them. An empty table nothing
populates is a claim of progress that has not been earned.

## 9. What is not built

RugGuard (Phase 2), the feature engine (Phase 3), the labelled dataset (Phase 4),
the backtester (Phase 5), baseline strategy (Phase 6), paper trading (Phase 7),
the learning engine (Phase 8), live execution (Phase 9) and the dashboard
(Phase 10). See `ROADMAP.md`.

Within Phase 1, the known gaps are listed in `PHASE1_EVIDENCE.md` §"Not
implemented" — including pool-address extraction from DEX instruction data,
which currently requires per-DEX account-layout decoding that Phase 2 will add.
