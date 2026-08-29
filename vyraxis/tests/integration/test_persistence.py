"""Persistence invariants, asserted against a real PostgreSQL database."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from conftest import T0, requires_database
from fixtures import samples
from vyraxis.core.enums import DecodeStatus, EventKind, HealthStatus, SystemEventLevel
from vyraxis.storage import repositories
from vyraxis.storage.engine import Database
from vyraxis.storage.models import IngestCheckpoint, MarketEvent, Token, Wallet

pytestmark = [pytest.mark.integration, requires_database]

MINT = samples.MEMECOIN_MINT
WALLET = samples.TRADER_WALLET


def event_row(signature: str, *, kind: EventKind = EventKind.SWAP, **overrides) -> dict:
    row = {
        "dedup_key": f"sig:{signature}:{kind.value}",
        "kind": kind,
        "decode_status": DecodeStatus.DECODED,
        "provider": "fixture",
        "stream": "logs:test",
        "slot": 1000,
        "signature": signature,
        "block_time": None,
        "observed_at": T0,
        "ingest_latency_ms": 12,
        "program_id": None,
        "token_mint": MINT,
        "pool_address": None,
        "actor_wallet": WALLET,
        "direction": None,
        "base_amount_raw": 1,
        "quote_amount_raw": None,
        "reason_codes": ["TEST"],
        "raw": {"source": "test"},
    }
    row.update(overrides)
    return row


async def seed_parents(database: Database) -> None:
    async with database.session() as session:
        await repositories.insert_tokens_if_absent(
            session,
            [
                {
                    "mint": MINT,
                    "first_seen_at": T0,
                    "first_seen_slot": 1000,
                    "discovery_source": "test",
                    "last_event_at": T0,
                    "event_count": 0,
                }
            ],
        )
        await repositories.insert_wallets_if_absent(
            session,
            [{"address": WALLET, "first_seen_at": T0, "last_seen_at": T0, "event_count": 0}],
        )


# --- criterion 5: deduplication ------------------------------------------


async def test_duplicate_events_are_rejected_by_the_database(database: Database) -> None:
    await seed_parents(database)
    signature = samples.signature(1)

    async with database.session() as session:
        first = await repositories.insert_market_events(session, [event_row(signature)])
    async with database.session() as session:
        second = await repositories.insert_market_events(session, [event_row(signature)])

    assert first.inserted == 1
    assert second.inserted == 0
    assert second.duplicates == 1

    async with database.session() as session:
        assert await repositories.count_rows(session, MarketEvent) == 1


async def test_duplicates_within_one_batch_are_collapsed(database: Database) -> None:
    """A replayed backlog can contain the same event twice in one batch."""
    await seed_parents(database)
    signature = samples.signature(2)
    rows = [event_row(signature), event_row(signature), event_row(samples.signature(3))]

    async with database.session() as session:
        outcome = await repositories.insert_market_events(session, rows)

    assert outcome.submitted == 3
    assert outcome.inserted == 2
    assert outcome.duplicates == 1


async def test_same_transaction_different_facts_are_both_stored(database: Database) -> None:
    """One transaction can create a pool *and* be the first swap into it."""
    await seed_parents(database)
    signature = samples.signature(4)
    async with database.session() as session:
        outcome = await repositories.insert_market_events(
            session,
            [
                event_row(signature, kind=EventKind.POOL_CREATED),
                event_row(signature, kind=EventKind.SWAP),
            ],
        )
    assert outcome.inserted == 2


async def test_dedup_key_uniqueness_is_enforced_at_the_schema_level(
    database: Database,
) -> None:
    """Proof the constraint exists, independent of application code."""
    async with database.engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT indexdef FROM pg_indexes "
                "WHERE tablename = 'market_events' AND indexdef ILIKE '%dedup_key%'"
            )
        )
        definitions = [row[0] for row in result]
    assert any("UNIQUE" in definition for definition in definitions)


# --- first-sighting immutability -----------------------------------------


async def test_first_seen_is_never_overwritten(database: Database) -> None:
    """Rewriting first_seen_at would fabricate history and leak the future."""
    later = T0 + timedelta(hours=5)
    async with database.session() as session:
        created = await repositories.insert_tokens_if_absent(
            session,
            [
                {
                    "mint": MINT,
                    "first_seen_at": T0,
                    "first_seen_slot": 100,
                    "discovery_source": "first",
                    "last_event_at": T0,
                    "event_count": 0,
                }
            ],
        )
    assert created == {MINT}

    async with database.session() as session:
        created_again = await repositories.insert_tokens_if_absent(
            session,
            [
                {
                    "mint": MINT,
                    "first_seen_at": later,
                    "first_seen_slot": 999,
                    "discovery_source": "second",
                    "last_event_at": later,
                    "event_count": 0,
                }
            ],
        )
    assert created_again == set()

    async with database.session() as session:
        token = (await session.execute(select(Token))).scalar_one()
        assert token.first_seen_at == T0
        assert token.first_seen_slot == 100
        assert token.discovery_source == "first"


async def test_activity_counters_accumulate(database: Database) -> None:
    await seed_parents(database)
    later = T0 + timedelta(minutes=10)
    async with database.session() as session:
        await repositories.bump_token_activity(session, {MINT: 3}, seen_at=T0)
        await repositories.bump_token_activity(session, {MINT: 2}, seen_at=later)
        await repositories.bump_wallet_activity(session, {WALLET: 4}, seen_at=later)

    async with database.session() as session:
        token = (await session.execute(select(Token))).scalar_one()
        wallet = (await session.execute(select(Wallet))).scalar_one()
    assert token.event_count == 5
    assert token.last_event_at == later
    assert wallet.event_count == 4


async def test_last_event_at_never_moves_backwards(database: Database) -> None:
    await seed_parents(database)
    later = T0 + timedelta(hours=1)
    async with database.session() as session:
        await repositories.bump_token_activity(session, {MINT: 1}, seen_at=later)
        await repositories.bump_token_activity(session, {MINT: 1}, seen_at=T0)

    async with database.session() as session:
        token = (await session.execute(select(Token))).scalar_one()
    assert token.last_event_at == later


# --- numeric precision ----------------------------------------------------


async def test_u64_amounts_survive_a_database_round_trip(database: Database) -> None:
    """A float column would silently lose the low digits of a u64 amount."""
    await seed_parents(database)
    u64_max = 2**64 - 1
    async with database.session() as session:
        await repositories.insert_market_events(
            session,
            [
                event_row(
                    samples.signature(5),
                    base_amount_raw=u64_max,
                    quote_amount_raw=18_446_744_073_709_551_615,
                )
            ],
        )

    async with database.session() as session:
        stored = (await session.execute(select(MarketEvent))).scalar_one()
    assert stored.base_amount_raw == Decimal(u64_max)
    assert int(stored.base_amount_raw) == u64_max


async def test_schema_contains_no_floating_point_columns(database: Database) -> None:
    async with database.engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT table_name, column_name, data_type FROM information_schema.columns "
                "WHERE table_schema = 'public' "
                "AND data_type IN ('double precision', 'real', 'money')"
            )
        )
        offenders = list(result)
    assert offenders == []


async def test_every_timestamp_column_is_timezone_aware(database: Database) -> None:
    async with database.engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema = 'public' "
                "AND data_type = 'timestamp without time zone'"
            )
        )
        naive = list(result)
    assert naive == []


async def test_timestamps_round_trip_as_utc(database: Database) -> None:
    await seed_parents(database)
    moment = datetime(2026, 6, 1, 23, 45, 12, 654321, tzinfo=UTC)
    async with database.session() as session:
        await repositories.insert_market_events(
            session, [event_row(samples.signature(6), observed_at=moment)]
        )
    async with database.session() as session:
        stored = (await session.execute(select(MarketEvent))).scalar_one()
    assert stored.observed_at == moment
    assert stored.observed_at.tzinfo is not None


# --- referential integrity ------------------------------------------------


async def test_event_referencing_an_unknown_mint_is_rejected(database: Database) -> None:
    """The FK is what guarantees every event is attached to a known token."""
    from sqlalchemy.exc import IntegrityError as SAIntegrityError

    with pytest.raises(SAIntegrityError):
        async with database.session() as session:
            await repositories.insert_market_events(
                session, [event_row(samples.signature(7), token_mint="NeverSeenMint")]
            )


# --- checkpoints ----------------------------------------------------------


async def test_checkpoint_slot_advances_monotonically(database: Database) -> None:
    """An out-of-order message must not rewind the resume position."""
    async with database.session() as session:
        await repositories.upsert_checkpoint(
            session, stream="logs:x", updated_at=T0, last_slot=500, events_delta=10
        )
        await repositories.upsert_checkpoint(
            session, stream="logs:x", updated_at=T0, last_slot=100, events_delta=5
        )
    async with database.session() as session:
        checkpoint = (await session.execute(select(IngestCheckpoint))).scalar_one()
    assert checkpoint.last_slot == 500
    assert checkpoint.events_ingested == 15


# --- system events --------------------------------------------------------


async def test_system_events_and_health_snapshots_persist(database: Database) -> None:
    async with database.session() as session:
        await repositories.record_system_event(
            session,
            occurred_at=T0,
            level=SystemEventLevel.ERROR,
            category="ingestion",
            event="test_failure",
            instance="test-1",
            detail={"error": "boom"},
        )
        await repositories.record_provider_health(
            session,
            provider="fixture",
            component="rpc_ws",
            status=HealthStatus.DEGRADED,
            observed_at=T0,
            latency_ms=42,
        )

    from vyraxis.storage.models import ProviderHealthSnapshot, SystemEvent

    async with database.session() as session:
        assert await repositories.count_rows(session, SystemEvent) == 1
        assert await repositories.count_rows(session, ProviderHealthSnapshot) == 1
