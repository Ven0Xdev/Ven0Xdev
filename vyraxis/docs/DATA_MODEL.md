# VYRAXIS — Data Model

Two sections: **implemented** tables (created by migration `0001_initial`, with
code writing to them) and **planned** tables (specified, not yet created).

A table is created in the migration that introduces the code populating it. An
empty table nothing writes to would be a claim of progress that has not been
earned.

---

## Conventions

| Rule | Rationale |
|---|---|
| All timestamps `TIMESTAMP WITH TIME ZONE`, written UTC | naive datetimes cause silent off-by-hours errors in P&L |
| All money/quantity columns `NUMERIC` | no `double precision`, `real` or `money` column exists anywhere — asserted by test |
| Token amounts stored as integer base units | exactly as SPL Token stores them; human scale is derived, never authoritative |
| Enums as `VARCHAR` + `CHECK` | adding a member is a cheap constraint migration, not an `ALTER TYPE` that locks the table |
| Constraint naming convention | unnamed constraints cannot be dropped by a later migration |
| Natural keys carry real foreign keys | `market_events.token_mint → tokens.mint` makes orphaned events impossible |

### Numeric scales

| Alias | Type | Use |
|---|---|---|
| `RawAmount` | `NUMERIC(40, 0)` | integer base units (u64 max is 20 digits; 40 leaves room for aggregates) |
| `Qty` | `NUMERIC(40, 18)` | human-scaled quantity |
| `Price` | `NUMERIC(40, 20)` | sub-nano memecoin prices |
| `Usd` | `NUMERIC(28, 10)` | USD-denominated values |

### ⚠️ Operational note on enum CHECK constraints

SQLAlchemy creates these via DDL events rather than persistent metadata
constraints, so **Alembic autogenerate does not see them**. `migrations/env.py`
excludes CHECK constraints from comparison to keep `alembic check` a meaningful
drift signal for what it *can* detect.

**Consequence:** adding a member to a `StrEnum` will not be picked up by
autogenerate. The corresponding CHECK constraint must be updated in a
hand-written migration.

---

## Implemented tables

### `tokens`

An SPL mint VYRAXIS has observed.

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL` PK | |
| `mint` | `VARCHAR(44)` **UNIQUE** | natural key; FK target |
| `token_program` | `VARCHAR(44)` | Token or Token-2022 |
| `decimals` | `SMALLINT` | null until read from chain |
| `supply_raw` | `NUMERIC(40,0)` | integer base units |
| `mint_authority` | `VARCHAR(44)` | **null = revoked**, a positive finding |
| `freeze_authority` | `VARCHAR(44)` | **null = revoked** |
| `is_initialized` | `BOOLEAN` | |
| `chain_state_checked_at` | `TIMESTAMPTZ` | distinguishes "revoked" from "never looked" |
| `name`, `symbol` | `VARCHAR` | null until metadata is read |
| `first_seen_at` | `TIMESTAMPTZ` NOT NULL | **immutable**, insert-only |
| `first_seen_slot` | `BIGINT` | **immutable** |
| `created_block_time` | `TIMESTAMPTZ` | chain time, nullable |
| `discovery_source` | `VARCHAR(64)` NOT NULL | which stream found it |
| `last_event_at`, `event_count` | | activity counters |

Indexes: `first_seen_at`, `last_event_at`.

`first_seen_at` and `first_seen_slot` are never overwritten. Rewriting them
would rewrite history and create look-ahead bias in every dataset built later.
Enforced by `insert_tokens_if_absent` using `ON CONFLICT DO NOTHING`, and
asserted by `test_first_seen_is_never_overwritten`.

### `pools`

A liquidity pool / market account on a DEX program.

Key columns: `address` (UNIQUE), `dex`, `program_id`, `base_mint` / `quote_mint`
(→ `tokens.mint`), `base_vault`, `quote_vault`, `lp_mint`, `first_seen_at`,
`first_seen_slot`, `discovery_source`, `raw` (JSONB), activity counters.

Indexes: `(base_mint, first_seen_at)`, `(dex, first_seen_at)`.

### `wallets`

`address` (UNIQUE), `first_seen_at`, `last_seen_at`, `event_count`, `labels`
(JSONB).

Phase 1 records existence and activity only. There is deliberately no
`is_smart_money` column: a column nothing computes would be a lie. Behavioural
profiling arrives with the wallet-intelligence work.

### `market_events`

The normalized event table — the core of the dataset.

| Column | Type | Notes |
|---|---|---|
| `dedup_key` | `VARCHAR(200)` **UNIQUE** | authoritative idempotency key |
| `kind` | enum | `TOKEN_CREATED`, `POOL_CREATED`, `SWAP`, `LIQUIDITY_ADDED`, `LIQUIDITY_REMOVED`, `TRANSFER`, `AUTHORITY_CHANGED`, `MINT`, `BURN`, `UNCLASSIFIED` |
| `decode_status` | enum | `DECODED` / `PARTIAL` / `UNDECODED` |
| `provider`, `stream` | `VARCHAR` | provenance |
| `slot` | `BIGINT` NOT NULL | chain sequence |
| `signature` | `VARCHAR(96)` | |
| `block_time` | `TIMESTAMPTZ` | **nullable** — chain time |
| `observed_at` | `TIMESTAMPTZ` **NOT NULL** | when VYRAXIS knew |
| `ingest_latency_ms` | `INTEGER` | |
| `program_id` | `VARCHAR(44)` | |
| `token_mint` | `VARCHAR(44)` FK → `tokens.mint` | |
| `pool_address` | `VARCHAR(44)` FK → `pools.address` | |
| `actor_wallet` | `VARCHAR(44)` | fee payer |
| `direction` | enum | `BUY` / `SELL` |
| `base_amount_raw`, `quote_amount_raw` | `NUMERIC(40,0)` | integer base units |
| `reason_codes` | `JSONB` | why it was classified this way |
| `raw` | `JSONB` NOT NULL | original payload, for reprocessing |

Indexes: `(token_mint, observed_at)`, `(pool_address, observed_at)`,
`(kind, observed_at)`, `slot`, `signature`.

**Dedup key format**
- `sig:<signature>:<kind>` for transaction-derived events
- `raw:<stream>:<slot>:<sha256-40 of canonicalised payload>` otherwise

Keyed on `(signature, kind)` so that one transaction can carry several distinct
facts (a pool creation *and* the first swap into it) without either being lost,
while the same fact seen twice collapses to one row.

### `observations`

Immutable timestamped snapshots — the structural defence against look-ahead
bias.

| Column | Notes |
|---|---|
| `token_mint` FK, `pool_address` FK | subject |
| `kind` | `DISCOVERY` or `HORIZON` |
| `status` | `PENDING` / `CAPTURED` / `MISSED` / `FAILED` |
| `anchor_observation_id` | self-FK to the DISCOVERY row |
| `horizon_seconds` | offset from the anchor |
| `due_at` | **earliest** instant this may be captured |
| `captured_at` | null while `PENDING` |
| `payload` | JSONB, null until captured |
| `failure_reason` | why `FAILED` or `MISSED` |

Indexes: `(due_at, status)`, `(token_mint, due_at)`, plus a **partial unique**
index on `(anchor_observation_id, horizon_seconds) WHERE kind = 'HORIZON'` — one
row per horizon per anchor, leaving DISCOVERY rows (which carry nulls in both)
unconstrained.

**The guarantee.** A horizon row is created empty with `due_at` in the future.
It cannot contain data from discovery time because at discovery time it has no
payload. `ObservationScheduler.capture_due` raises `IntegrityError` if asked to
fill a row before `due_at`. Absent data at the due instant yields `MISSED` — it
is never back-filled from another moment.

### `provider_health_snapshots`

`provider`, `component`, `status`, `connection_state`, `observed_at`,
`latency_ms`, `detail`. Index on `(component, observed_at)`.

### `system_events`

`occurred_at`, `level` (`INFO`/`WARNING`/`ERROR`/`CRITICAL`), `category`,
`event`, `instance`, `detail`.

Connection transitions, flush failures and dropped events are written here as
well as logged, so an operator reading only the database can reconstruct what
the process experienced.

### `ingest_checkpoints`

`stream` (UNIQUE), `last_slot`, `last_signature`, `events_ingested`,
`updated_at`.

`last_slot` advances with `GREATEST` so an out-of-order message cannot rewind
the checkpoint and cause a range to be re-scanned or skipped.

---

## Planned tables (not yet created)

Specified here so the schema evolves to a plan rather than by accretion.

### Phase 2 — RugGuard
- **`security_checks`** — `token_mint`, `check_name`, `severity`, `passed`,
  `evidence` (JSONB), `checked_at`, `rules_version`
- **`token_holders`** — `token_mint`, `owner`, `balance_raw`, `rank`,
  `observed_at`
- **`wallet_relationships`** — `wallet_a`, `wallet_b`, `relation`,
  `evidence`, `confidence`, `observed_at`

### Phase 3 — Features
- **`feature_snapshots`** — `token_mint`, `observed_at`, `schema_version`,
  `features` (JSONB), `source_observation_id`
- **`scores`** — `feature_snapshot_id`, `momentum_score`, `liquidity_score`,
  `wallet_quality_score`, `market_quality_score`, `opportunity_score`,
  `rug_risk_score`, `model_version`

### Phase 4 — Dataset
- **`outcome_labels`** — `anchor_observation_id`, `horizon_seconds`,
  `label_name`, `label_value`, `computed_at`, `computed_from_observation_id`

### Phase 5/6 — Decisions and backtests
- **`strategies`**, **`strategy_versions`**
- **`decisions`** — `token_mint`, `decided_at`, `decision`, `confidence`,
  `feature_snapshot_id`, `security_check_id`, `reason_codes`, `rules_version`
- **`backtest_runs`**, **`backtest_trades`**

### Phase 7 — Paper trading
- **`paper_orders`**, **`paper_trades`**, **`positions`**,
  **`portfolio_snapshots`**

### Phase 8 — Learning
- **`model_versions`** — `name`, `version`, `trained_at`, `training_window`,
  `metrics`, `artifact_uri`, `feature_schema_version`

### Phase 9 — Live (blocked)
- **`live_orders`**, **`live_trades`** — created only under the Phase 9
  preconditions in `ROADMAP.md`.

---

## Retention

Not yet implemented; recorded so the decision is deliberate rather than
accidental.

- `market_events` and `observations` are the proprietary dataset — **retain
  indefinitely**.
- `system_events` and `provider_health_snapshots` are operational — a rolling
  window (90 days suggested) is sufficient.
- `raw` payloads dominate storage. If growth becomes a cost problem, compress or
  archive them to object storage rather than deleting: they are what makes a
  decoding bug reprocessable instead of permanent.
