# VYRAXIS

**Autonomous Solana memecoin research platform.**

VYRAXIS discovers on-chain token activity, normalizes it into an auditable
dataset, and is being built toward answering one question honestly: *is there a
repeatable, positive-expectancy edge here?*

> ### 🔒 Research only — no live trading
>
> This codebase has **no live-money execution path, no key handling and no
> signing capability**. Setting `VYRAXIS_SAFETY__LIVE_TRADING_ENABLED=true` is
> **rejected at startup** by a configuration validator — it is an explicit
> refusal, not an unimplemented feature flag.
>
> VYRAXIS never asks for, reads, or stores a private key or seed phrase.

---

## Status

| Phase | Status |
|---|---|
| **0 — Foundation** | ✅ Complete |
| **1 — Data Engine** | ✅ Complete — [acceptance evidence](docs/PHASE1_EVIDENCE.md) |
| 2 — RugGuard | 🔜 Next |
| 3–8 — Features, dataset, backtest, strategy, paper trading, learning | Planned |
| 9 — Live execution | 🔒 Blocked, not implemented |
| 10 — Dashboard | Planned |

**212 tests passing** against a real PostgreSQL instance and real WebSocket
sockets. `mypy --strict` and `ruff` clean.

**Not yet verified against Solana mainnet.** The environment this was built in
blocks Solana RPC hosts at the network layer. Everything is verified against a
local server speaking the real PubSub wire protocol; the mainnet-specific
caveats are listed in [`docs/PHASE1_EVIDENCE.md`](docs/PHASE1_EVIDENCE.md).

## What Phase 1 does

```
WebSocket (logsSubscribe + slot heartbeat)
  → classify by log markers  → normalized event with reason codes
  → deduplicate               → in-process LRU, then a database UNIQUE index
  → enrich                    → getTransaction: mint, wallet, amounts, direction
  → persist                   → one batch, one transaction, exact insert counts
  → observe                   → immutable discovery snapshot + future horizons
```

Reconnection with exponential backoff and jitter, resubscription, stale-socket
detection, backpressure, and durable failure records throughout.

## Quick start

**Requirements:** Python 3.11+, PostgreSQL 15+.

```bash
git clone <repo> && cd vyraxis

python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"          # or: uv pip install -e ".[dev]"

cp .env.example .env             # then edit .env
createdb vyraxis
vyraxis db upgrade
vyraxis db ping
```

Point `.env` at any Solana JSON-RPC provider — a hosted endpoint or your own
validator:

```bash
VYRAXIS_SOLANA__RPC_HTTP_URL=https://your-endpoint
VYRAXIS_SOLANA__RPC_WS_URL=wss://your-endpoint
```

**Before ingesting from mainnet, verify the program registry:**

```bash
vyraxis programs verify        # exits non-zero if any ID cannot be confirmed
```

The program IDs shipped in `solana/programs.py` are engineering defaults
validated only structurally. This command checks each against the chain.

Then run the data engine:

```bash
vyraxis ingest run --max-events 100   # bounded run
vyraxis ingest run                     # continuous
vyraxis ingest status                  # row counts and stream checkpoints
```

## Commands

| Command | Purpose |
|---|---|
| `vyraxis config` | effective configuration, secrets redacted |
| `vyraxis health` | run every health check; exits non-zero if unhealthy |
| `vyraxis serve` | health/status HTTP API |
| `vyraxis db upgrade` / `current` / `ping` | migrations and connectivity |
| `vyraxis programs list` / `verify` | program registry |
| `vyraxis ingest run` / `status` | data engine |

All commands print JSON to **stdout** and logs to **stderr**, so
`vyraxis ingest status | jq` works.

## Testing

```bash
pytest                    # unit tests only; integration tests skip
```

Integration tests need a real database and **skip with a clear reason** without
one — they never silently pass against a substitute:

```bash
createdb vyraxis_test
VYRAXIS_TEST_DATABASE_URL=postgresql+asyncpg://user@localhost:5432/vyraxis_test pytest
```

Quality gates:

```bash
ruff check src tests && ruff format --check src tests && mypy
```

See the Phase 1 data path end to end, against the local test-fixture node:

```bash
VYRAXIS_DATABASE__URL=postgresql+asyncpg://... python scripts/phase1_demo.py
```

## Documentation

| | |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | module map, dependency rules, failure handling, the honesty rules |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | phases, acceptance criteria, Phase 9 preconditions |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | schema, conventions, planned tables |
| [`docs/RISK_MODEL.md`](docs/RISK_MODEL.md) | sizing, stops, circuit breakers *(spec — not implemented)* |
| [`docs/BACKTEST_INTEGRITY.md`](docs/BACKTEST_INTEGRITY.md) | the seven ways a backtest lies *(spec — not implemented)* |
| [`docs/PHASE1_EVIDENCE.md`](docs/PHASE1_EVIDENCE.md) | evidence per acceptance criterion, and what is *not* proven |

## Design principles

1. **Never fabricate.** Missing data is `NULL` plus a reason code.
   `decode_status = PARTIAL` with `token_mint = NULL` honestly means "not
   resolved yet"; a guessed mint would be a fabrication.
2. **Never mock in production.** Test doubles exist only under `tests/` and say
   so. When a dependency fails at runtime, VYRAXIS reports the failure.
3. **Never lose data silently.** Every drop, duplicate and failure is counted,
   logged, and surfaced on the health endpoint.
4. **Never use floats for money.** All monetary columns are `NUMERIC`; passing a
   `float` into the money layer raises.
5. **Never let the future into the past.** Horizon observations are created
   empty with a future due time and cannot be filled early.
6. **Never log a secret.** A redaction processor scrubs secret-shaped keys, URL
   credentials and query-string API keys on every event.
7. **Security outranks opportunity.** No score, at any magnitude, may override a
   critical RugGuard rejection.

## Security

- Secrets come from the environment. `.env` is git-ignored; `.env.example`
  documents variable names only.
- Database credentials are held in `SecretStr` and redacted everywhere they
  could surface — logs, `vyraxis config`, health payloads.
- No private key or seed phrase is ever requested, stored or logged. There is no
  code path that would use one.

## A note on the research benchmark

The stated milestone is whether $50 can reach $500 in simulation. It is a
yardstick, never a target to engineer towards.

**The strategy, dataset, assumptions and backtests are never manipulated to
reach it. If VYRAXIS loses money, VYRAXIS will report that it lost money.**

## License

Proprietary. All rights reserved.
