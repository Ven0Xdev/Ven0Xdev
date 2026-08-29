# VYRAXIS — Phase 1 Acceptance Evidence

Evidence for each of the ten Phase 1 acceptance criteria, with the command that
produces it. All outputs below were produced by executing the code, not by
description.

**Verification environment**

| | |
|---|---|
| PostgreSQL | 16.13 (real instance, not in-memory) |
| Python | 3.11.15 |
| Test suite | **212 tests, 212 passed** |
| `ruff check` | clean |
| `ruff format --check` | clean |
| `mypy --strict` | clean, 41 source files |

## ⚠️ Read this before trusting anything below

**No live Solana mainnet connection was made.** This session's egress policy
blocks Solana RPC hosts:

```
$ vyraxis programs verify   # against https://api.mainnet-beta.solana.com
{
  "endpoint": "https://api.mainnet-beta.solana.com",
  "failures": 12,
  "programs": [
    {
      "error": "http transport failure (error='403 Forbidden' method='getAccountInfo')",
      "label": "System Program",
      "program_id": "11111111111111111111111111111111",
      "verified": false
    },
    ...
  ]
}
$ echo $?
1
```

That output is itself evidence of correct behaviour: the tool **reported that it
could not verify** and exited non-zero, rather than printing a reassuring table.

Consequently the criteria below are demonstrated against a **local server
speaking the Solana PubSub wire protocol** (`tests/fixtures/fake_solana_node.py`,
labelled as a test fixture in its own docstring). Real TCP, real WebSocket
framing, real JSON-RPC correlation, real disconnects — with the production
client unpatched.

**What this proves:** connection management, subscription handling, reconnection,
staleness detection, normalization, deduplication, persistence, association and
observation scheduling all work.

**What it does not prove:** that the log markers in `scanner/normalizer.py`
match current mainnet program output, that the program IDs in
`solana/programs.py` are the programs they are labelled as, or how the system
behaves under mainnet event volume and rate limits. Those require a reachable
endpoint. See "Outstanding before mainnet" at the end.

---

## Criterion 1 — Establish and monitor a Solana connection ✅

Connection lifecycle, subscription confirmation and health state.

```
tests/integration/test_websocket_resilience.py
  test_connects_subscribes_and_reports_state       PASSED
  test_both_subscriptions_are_requested            PASSED
  test_slot_heartbeat_is_not_emitted_as_a_market_event  PASSED
```

Observed state sequence: `CONNECTING → CONNECTED → SUBSCRIBED`, with
`status().healthy is True` and both `logsSubscribe` and `slotSubscribe`
confirmed by server-assigned subscription id.

Live monitoring, from `vyraxis health` (RPC unreachable here, so the honest
result is UNHEALTHY and exit code 1):

```
$ vyraxis health; echo "exit=$?"
overall: UNHEALTHY
  database             -> HEALTHY
  ingestion_pipeline   -> HEALTHY
  solana_event_stream  -> UNHEALTHY   (DISCONNECTED)
  solana_rpc           -> UNHEALTHY   (health check timed out)
exit=1
```

## Criterion 2 — Recover cleanly from connection loss ✅

```
tests/integration/test_websocket_resilience.py
  test_reconnects_and_resubscribes_after_a_dropped_connection  PASSED
  test_survives_several_consecutive_outages                    PASSED
  test_recovers_when_the_server_is_down_at_first               PASSED
  test_silent_connection_is_recycled_as_stale                  PASSED
  test_rejected_subscription_is_fatal_not_a_silent_no_op       PASSED
  test_unconfirmed_subscription_times_out_and_reconnects       PASSED
tests/integration/test_pipeline_end_to_end.py
  test_events_survive_a_connection_drop                        PASSED
```

Covered: forced mid-stream disconnect (reconnect + resubscribe, events continue
at the correct slots); three consecutive outages with no lost events; startup
against an endpoint that is not yet listening; a socket that goes silent
(recycled after the stale window); a server that *rejects* the subscription
(`PermanentProviderError` — a refused subscription must not masquerade as a
quiet stream); a server that never confirms (timeout then reconnect).

From the demonstration run — the client recovered on its own and the outage is
durably recorded:

```
system_events (8):
  INFO     connection   ws_connecting
  INFO     connection   ws_connected
  INFO     connection   ws_subscribed
  WARNING  connection   ws_reconnecting     ← the outage
  INFO     connection   ws_connecting
  INFO     connection   ws_connected
  INFO     connection   ws_subscribed       ← resubscribed
  INFO     connection   ws_stopped
```

## Criterion 3 — Detect relevant on-chain events ✅

```
tests/unit/test_normalizer.py                  16 tests PASSED
```

Classification of pump.fun creates and buys, Raydium pool initialisation, SPL
mint/burn/transfer/authority changes. Program-scoped markers do not fire for the
wrong program; the highest-priority marker wins while every match is recorded in
`reason_codes`; failed transactions are kept and flagged (`TX_FAILED`) because a
burst of failed swaps is a signal.

## Criterion 4 — Normalize raw events ✅

```
tests/unit/test_normalizer.py::test_log_only_events_are_marked_partial_not_decoded  PASSED
tests/unit/test_enrichment.py                  10 tests PASSED
```

Stored rows from the demonstration run:

```
market_events (3):
  slot=1000 kind=TOKEN_CREATED  decode=DECODED  dir=BUY  base=1.0E+9  quote=5E+8
      mint=US517G5965ay... wallet=k7FaK87WHGVX...
      observed_at=2026-08-29T16:40:25.110302+00:00
      block_time=2023-11-14T22:13:20+00:00
      reasons=['PUMPFUN_CREATE','SPL_INITIALIZE_MINT2','SPL_INITIALIZE_MINT','ENRICHED']
  slot=1004 kind=SWAP  decode=DECODED  dir=BUY  base=1.0E+9  quote=5E+8
      reasons=['PUMPFUN_BUY','SPL_TRANSFER','ENRICHED']
  slot=1005 kind=SWAP  decode=DECODED  dir=BUY  base=1.0E+9  quote=5E+8
      reasons=['PUMPFUN_BUY','SPL_TRANSFER','ENRICHED']
```

`observed_at` (when VYRAXIS knew) and `block_time` (chain time) are distinct
values, as designed.

**Honest-degradation evidence** — when enrichment is unavailable, the row says
so rather than inventing a mint:

```
test_unenriched_events_are_stored_as_partial     PASSED
    decode_status = PARTIAL, token_mint = NULL, base_amount_raw = NULL
    tokens = 0, observations = 0   (no placeholder token invented)
test_enrichment_failure_leaves_the_event_recorded  PASSED
    event persisted, reason_codes contains ENRICHMENT_RPC_FAILED
```

## Criterion 5 — Deduplicate events ✅

```
tests/unit/test_dedup.py                       5 tests PASSED
tests/integration/test_persistence.py
  test_duplicate_events_are_rejected_by_the_database    PASSED
  test_duplicates_within_one_batch_are_collapsed        PASSED
  test_same_transaction_different_facts_are_both_stored PASSED
  test_dedup_key_uniqueness_is_enforced_at_the_schema_level PASSED
tests/integration/test_data_integrity.py
  test_concurrent_writers_cannot_duplicate_an_event     PASSED
tests/integration/test_pipeline_end_to_end.py
  test_duplicate_notifications_are_persisted_once       PASSED
```

Both layers verified: the in-process LRU cache (including the case where
eviction lets a stale duplicate through — the documented reason it is not the
guarantee), and the database `UNIQUE` index. Five concurrent writers racing on
one dedup key produce exactly one row.

In the demonstration the same buy was emitted three times:

```
"dedup": { "seen": 5, "duplicates": 2, "evictions": 0 }
market_events: 3 rows   ← 5 notifications, 2 duplicates suppressed
```

## Criterion 6 — Persist events ✅

```
tests/integration/test_persistence.py          14 tests PASSED
tests/integration/test_migrations.py            5 tests PASSED
```

Schema-level guarantees asserted directly against the live database:

```
test_schema_contains_no_floating_point_columns   PASSED  (0 float/real/money columns)
test_every_timestamp_column_is_timezone_aware    PASSED  (19 timestamptz, 0 naive)
test_u64_amounts_survive_a_database_round_trip   PASSED  (2^64-1 exact)
test_timestamps_round_trip_as_utc                PASSED  (microsecond precision)
test_first_seen_is_never_overwritten             PASSED
test_checkpoint_slot_advances_monotonically      PASSED
```

Migrations run forward, backward and forward again on a scratch database, and
the resulting schema matches the ORM metadata (`alembic check`).

```
$ vyraxis db current
Rev: 0001_initial (head)
Parent: <base>
```

## Criterion 7 — Associate events with tokens/pools ✅

```
tests/integration/test_pipeline_end_to_end.py::test_events_flow_from_socket_to_database  PASSED
tests/integration/test_persistence.py::test_event_referencing_an_unknown_mint_is_rejected  PASSED
```

Every persisted event resolved to a token and an actor wallet, and the foreign
key makes an orphaned event impossible.

```
tokens (1):
  mint=US517G5965ay... first_seen=2026-08-29T16:40:25+00:00 slot=1000 events=3
wallets (1):
  k7FaK87WHGVX... events=3
```

**Known gap:** `pool_address` is populated only when a decoder supplies it. Pool
extraction from DEX instruction account layouts is Phase 2 work — see
"Not implemented" below. The column and its foreign key exist and are exercised;
the DEX-specific decoders are not written.

## Criterion 8 — Create timestamped observations ✅

```
tests/integration/test_observations.py          8 tests PASSED
tests/integration/test_data_integrity.py        9 tests PASSED
tests/integration/test_pipeline_end_to_end.py::test_discovery_observations_are_created_once_per_token  PASSED
```

From the demonstration run — one immutable discovery snapshot plus eight empty
future horizons:

```
observations (9):
  DISCOVERY CAPTURED horizon=None  due_at=16:40:25 captured_at=16:40:25 payload=set
  HORIZON   PENDING  horizon=30    due_at=16:40:55 captured_at=None     payload=EMPTY
  HORIZON   PENDING  horizon=60    due_at=16:41:25 captured_at=None     payload=EMPTY
  HORIZON   PENDING  horizon=300   due_at=16:45:25 captured_at=None     payload=EMPTY
  HORIZON   PENDING  horizon=900   due_at=16:55:25 captured_at=None     payload=EMPTY
  HORIZON   PENDING  horizon=1800  due_at=17:10:25 captured_at=None     payload=EMPTY
  HORIZON   PENDING  horizon=3600  due_at=17:40:25 captured_at=None     payload=EMPTY
  HORIZON   PENDING  horizon=21600 due_at=22:40:25 captured_at=None     payload=EMPTY
  HORIZON   PENDING  horizon=86400 due_at=+1d 16:40 captured_at=None    payload=EMPTY
```

The look-ahead defence is asserted, not assumed:

```
test_capture_before_due_time_is_refused          PASSED  (raises IntegrityError)
test_no_horizon_observation_is_due_before_its_anchor       PASSED
test_no_observation_is_captured_before_it_is_due           PASSED
test_missing_data_marks_missed_rather_than_backfilling     PASSED
test_pending_observations_are_never_silently_completed     PASSED
```

## Criterion 9 — Expose basic system health ✅

```
tests/integration/test_health_api.py            9 tests PASSED
```

Endpoints: `/health/live`, `/health/ready`, `/health`, `/status`. Aggregation
takes the worst component status; a check that raises or hangs is `UNHEALTHY`,
never "unknown but probably fine"; `/health/ready` returns 503 when a dependency
is down.

```
test_a_raising_check_is_unhealthy_not_unknown    PASSED
test_a_hanging_check_times_out_as_unhealthy      PASSED
test_pipeline_check_flags_event_loss             PASSED
test_ready_returns_503_when_a_dependency_is_down PASSED
```

Live counters (`/status`), from the demonstration run:

```json
{"pipeline": {"raw_received": 5, "normalized": 5, "dedup_hits": 2,
              "events_queued": 3, "events_dropped": 0, "events_enriched": 2,
              "batches_flushed": 3, "flush_failures": 0},
 "queue_depth": 0, "queue_capacity": 10000,
 "dedup": {"size": 3, "seen": 5, "duplicates": 2, "evictions": 0},
 "sink": {"events_inserted": 3, "events_lost": 0, "tokens_discovered": 1,
          "wallets_discovered": 1, "observations_created": 1},
 "stream": {"connect_attempts": 2, "connects_succeeded": 2, "reconnects": 1,
            "messages_received": 12, "notifications_received": 5,
            "heartbeats_received": 3, "protocol_errors": 0,
            "unknown_subscription_notifications": 0, "last_slot": 1005}}
```

Any dropped or lost event makes the pipeline `DEGRADED`, so loss appears on the
health endpoint rather than only in a log line.

## Criterion 10 — Run automated tests successfully ✅

```
$ VYRAXIS_TEST_DATABASE_URL=postgresql+asyncpg://... pytest -q
212 passed in 11.12s
```

| Suite | Tests |
|---|---|
| `test_base58.py` | 30 |
| `test_programs.py` | 18 |
| `test_logging_redaction.py` | 18 |
| `test_normalizer.py` | 16 |
| `test_persistence.py` (integration) | 14 |
| `test_config.py` | 12 |
| `test_websocket_resilience.py` (integration) | 11 |
| `test_rpc_client.py` | 10 |
| `test_money.py` | 10 |
| `test_enrichment.py` | 10 |
| `test_accounts.py` | 9 |
| `test_health_api.py` (integration) | 9 |
| `test_data_integrity.py` (integration) | 9 |
| `test_observations.py` (integration) | 8 |
| `test_pipeline_end_to_end.py` (integration) | 7 |
| `test_cli.py` | 6 |
| `test_dedup.py` | 5 |
| `test_clock.py` | 5 |
| `test_migrations.py` (integration) | 5 |

Integration tests **skip with a clear reason** when `VYRAXIS_TEST_DATABASE_URL`
is unset — they never silently pass against a substitute.

---

## Defects found and fixed during verification

Recorded because they are the reason the tests exist.

1. **Pipeline shutdown discarded an in-flight batch.** `run()` cancelled the
   consumer whenever the producer finished first, losing events already accepted
   from the socket. Producer exhaustion now triggers a bounded drain; only
   consumer completion cancels the producer.
   *Found by:* `test_checkpoint_records_ingest_progress`.

2. **Connection-state writes were abandoned at shutdown.** Fire-and-forget
   `system_events` tasks were destroyed while pending, losing the durable record
   of the final transitions. `_SystemEventListener.drain()` is now awaited before
   the engine is disposed.
   *Found by:* a "Task was destroyed but it is pending" warning during teardown.

3. **CLI logs went to stdout, corrupting pipeable JSON.** A global Typer
   callback now configures logging, so results go to stdout and logs to stderr.
   *Found by:* running `vyraxis programs verify | jq`.

4. **Logging captured a `sys.stderr` handle that could later be closed**,
   raising "I/O operation on closed file" for the rest of the process. The stream
   is now resolved lazily on each write, which also makes logging survive log
   rotation and stream re-opening.
   *Found by:* CLI tests polluting later tests in the same session.

5. **Slot precedence was ambiguous.** The transport envelope's slot could
   override the authoritative payload `context.slot`. The payload — the value
   actually persisted in `raw` — now wins.

6. *(fixture)* **The test node reused subscription ids across reconnects**,
   which a real node never does. It masked correct client behaviour as a bug and
   produced a spurious second checkpoint row. Fixed, and the client now counts
   `unknown_subscription_notifications` so a genuine occurrence is visible.

---

## Not implemented (Phase 1 scope boundaries)

Stated explicitly so nothing here is mistaken for working functionality.

- **Live mainnet verification.** Blocked by this session's egress policy. The
  first action on an unblocked network is `vyraxis programs verify`.
- **Pool address extraction from DEX instructions.** Requires per-DEX account
  layout decoding (Raydium AMM v4, CPMM, CLMM; PumpSwap; Meteora; Orca). The
  schema, foreign keys and sink path exist and are tested; the decoders do not.
- **Horizon observation capture worker.** Horizons are *scheduled* and the
  capture logic with its no-early-capture guard is implemented and tested, but
  nothing runs it on a timer yet. Phase 3/4.
- **Token metadata** (name, symbol via Metaplex). Columns exist; nothing
  populates them.
- **On-chain mint state refresh.** `decode_mint_account` and
  `update_token_chain_state` exist and are tested; no scheduler calls them.
  Phase 2 (RugGuard) will.
- **`programSubscribe` / `accountSubscribe` ingestion.** Subscription builders
  exist; no normalizer handles their notification shapes, so they would be
  stored `UNCLASSIFIED`.
- **Liquidity, price and market cap.** Not derivable from Phase 1 data. No
  column is populated with a guess.
- **RugGuard, features, backtester, paper trading, learning, dashboard.**
  Phases 2–10.
- **Live trading.** Not implemented and cannot be enabled.

## Outstanding before running against mainnet

1. `vyraxis programs verify` — confirm every program ID exists on chain and is
   executable. **The IDs in `solana/programs.py` are engineering defaults that
   have only been validated structurally (base58, 32 bytes).**
2. Confirm the log markers in `scanner/normalizer.py` against live program
   output; adjust and re-test.
3. Size `persist_batch_size` and `normalized_queue_size` against real event
   volume; watch `events_dropped` and `queue_fill_ratio`.
4. Measure enrichment RPC cost. One `getTransaction` per candidate event is the
   dominant cost driver and may need a stricter `ENRICHABLE_KINDS`.
5. Verify rate-limit behaviour against the chosen provider's actual limits.
