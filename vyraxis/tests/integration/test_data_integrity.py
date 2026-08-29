"""Data-integrity guarantees that later phases depend on.

Phase 4 builds a labelled dataset from these tables and Phase 5 backtests on it.
If any of these properties fail, every result derived from the data is invalid,
so they are asserted directly rather than assumed.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError

from conftest import T0, requires_database
from fixtures import samples
from vyraxis.core.clock import ManualClock
from vyraxis.core.enums import ConnectionState, ObservationKind, ObservationStatus
from vyraxis.scanner.observations import ObservationScheduler
from vyraxis.storage import repositories
from vyraxis.storage.engine import Database
from vyraxis.storage.models import MarketEvent, Observation, SystemEvent

pytestmark = [pytest.mark.integration, requires_database]

MINT = samples.MEMECOIN_MINT


async def seed_token(database: Database, first_seen=T0) -> None:
    async with database.session() as session:
        await repositories.insert_tokens_if_absent(
            session,
            [
                {
                    "mint": MINT,
                    "first_seen_at": first_seen,
                    "first_seen_slot": 1,
                    "discovery_source": "test",
                    "last_event_at": first_seen,
                    "event_count": 0,
                }
            ],
        )


async def test_no_horizon_observation_is_due_before_its_anchor(database: Database) -> None:
    """A horizon can never be earlier than the discovery it hangs off."""
    await seed_token(database)
    scheduler = ObservationScheduler([30, 60, 300, 900, 3600])
    async with database.session() as session:
        await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=T0, source="logs:test"
        )

    async with database.session() as session:
        rows = (await session.execute(select(Observation))).scalars().all()

    anchor = next(row for row in rows if row.kind is ObservationKind.DISCOVERY)
    for row in rows:
        if row.kind is ObservationKind.HORIZON:
            assert row.due_at > anchor.due_at
            assert row.due_at == anchor.due_at + timedelta(seconds=row.horizon_seconds)


async def test_no_observation_is_captured_before_it_is_due(database: Database) -> None:
    """Scanned as a whole-table invariant, the way a dataset build would."""
    await seed_token(database)
    scheduler = ObservationScheduler([30, 60])
    async with database.session() as session:
        await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=T0, source="logs:test"
        )

    now = T0 + timedelta(seconds=60)

    async def capture(observation: Observation) -> dict:
        return {"at": now.isoformat()}

    async with database.session() as session:
        await scheduler.capture_due(session, now=now, capture=capture)

    async with database.session() as session:
        offenders = (
            (
                await session.execute(
                    select(Observation).where(
                        Observation.captured_at.isnot(None),
                        Observation.captured_at < Observation.due_at,
                    )
                )
            )
            .scalars()
            .all()
        )
    assert offenders == []


async def test_every_event_has_an_observation_timestamp(database: Database) -> None:
    """``observed_at`` is the only leak-safe ordering key, so it is NOT NULL."""
    await seed_token(database)
    async with database.session() as session:
        await repositories.insert_market_events(
            session,
            [
                {
                    "dedup_key": "sig:x:SWAP",
                    "kind": "SWAP",
                    "decode_status": "PARTIAL",
                    "provider": "fixture",
                    "stream": "logs:test",
                    "slot": 1,
                    "observed_at": T0,
                    "token_mint": MINT,
                    "raw": {},
                }
            ],
        )
    async with database.session() as session:
        missing = (
            (await session.execute(select(MarketEvent).where(MarketEvent.observed_at.is_(None))))
            .scalars()
            .all()
        )
    assert missing == []


async def test_block_time_may_be_null_and_is_never_substituted(database: Database) -> None:
    """Chain time is optional. Filling it from wall clock would fabricate history."""
    await seed_token(database)
    async with database.session() as session:
        await repositories.insert_market_events(
            session,
            [
                {
                    "dedup_key": "sig:y:SWAP",
                    "kind": "SWAP",
                    "decode_status": "PARTIAL",
                    "provider": "fixture",
                    "stream": "logs:test",
                    "slot": 1,
                    "observed_at": T0,
                    "block_time": None,
                    "token_mint": MINT,
                    "raw": {},
                }
            ],
        )
    async with database.session() as session:
        event = (await session.execute(select(MarketEvent))).scalar_one()
    assert event.block_time is None
    assert event.observed_at == T0


async def test_events_before_a_token_first_seen_would_be_a_bug(database: Database) -> None:
    """No stored event may predate the token's own first sighting."""
    await seed_token(database, first_seen=T0)
    async with database.session() as session:
        await repositories.insert_market_events(
            session,
            [
                {
                    "dedup_key": f"sig:{index}:SWAP",
                    "kind": "SWAP",
                    "decode_status": "PARTIAL",
                    "provider": "fixture",
                    "stream": "logs:test",
                    "slot": 1 + index,
                    "observed_at": T0 + timedelta(seconds=index),
                    "token_mint": MINT,
                    "raw": {},
                }
                for index in range(5)
            ],
        )

    from vyraxis.storage.models import Token

    async with database.session() as session:
        offenders = (
            (
                await session.execute(
                    select(MarketEvent)
                    .join(Token, Token.mint == MarketEvent.token_mint)
                    .where(MarketEvent.observed_at < Token.first_seen_at)
                )
            )
            .scalars()
            .all()
        )
    assert offenders == []


async def test_connection_transitions_are_durably_recorded(database: Database, settings) -> None:
    """An operator reading only the database must be able to see an outage."""
    from vyraxis.app import _SystemEventListener

    listener = _SystemEventListener(database, "test-1", ManualClock(T0))
    listener.on_state_change(ConnectionState.CONNECTED, {"endpoint": "ws://x"})
    listener.on_state_change(ConnectionState.RECONNECTING, {"delay_seconds": 1.0})
    await listener.drain()

    async with database.session() as session:
        rows = (await session.execute(select(SystemEvent).order_by(SystemEvent.id))).scalars().all()

    events = {row.event: row for row in rows}
    assert "ws_connected" in events
    assert "ws_reconnecting" in events
    assert events["ws_reconnecting"].level.value == "WARNING"
    assert events["ws_connected"].category == "connection"


async def test_sink_failure_is_recorded_and_counted(database: Database, settings) -> None:
    """A failed flush must be visible, never a silent gap in the data."""
    from vyraxis.core.enums import DecodeStatus, EventKind
    from vyraxis.scanner.events import NormalizedEvent
    from vyraxis.scanner.sink import EventSink

    sink = EventSink(database, ObservationScheduler([30]), clock=ManualClock(T0))
    # A slot beyond BIGINT range: the kind of corruption a decoding bug can
    # produce. The database rejects it while remaining reachable, so the
    # failure-recording path can be observed too.
    unstorable = NormalizedEvent(
        dedup_key="sig:unstorable:SWAP",
        kind=EventKind.SWAP,
        decode_status=DecodeStatus.PARTIAL,
        provider="fixture",
        stream="logs:test",
        slot=2**63,
        observed_at=T0,
        token_mint=MINT,
    )

    with pytest.raises(DBAPIError):
        await sink.flush([unstorable])

    assert sink.stats.failed_batches == 1
    assert sink.stats.events_lost == 1

    async with database.session() as session:
        rows = (
            (
                await session.execute(
                    select(SystemEvent).where(SystemEvent.event == "sink_flush_failed")
                )
            )
            .scalars()
            .all()
        )
    assert len(rows) == 1
    assert rows[0].detail["batch_size"] == 1


async def test_pending_observations_are_never_silently_completed(database: Database) -> None:
    await seed_token(database)
    scheduler = ObservationScheduler([30, 3600])
    async with database.session() as session:
        await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=T0, source="logs:test"
        )

    async def capture(_o: Observation) -> dict:
        return {"ok": True}

    async with database.session() as session:
        await scheduler.capture_due(session, now=T0 + timedelta(seconds=30), capture=capture)

    async with database.session() as session:
        far = (
            await session.execute(select(Observation).where(Observation.horizon_seconds == 3600))
        ).scalar_one()
    assert far.status is ObservationStatus.PENDING
    assert far.captured_at is None
    assert far.payload is None


async def test_concurrent_writers_cannot_duplicate_an_event(database: Database) -> None:
    """Two workers racing on the same event: the UNIQUE index decides."""
    await seed_token(database)
    row = {
        "dedup_key": "sig:race:SWAP",
        "kind": "SWAP",
        "decode_status": "PARTIAL",
        "provider": "fixture",
        "stream": "logs:test",
        "slot": 1,
        "observed_at": T0,
        "token_mint": MINT,
        "raw": {},
    }

    async def writer() -> int:
        async with database.session() as session:
            outcome = await repositories.insert_market_events(session, [dict(row)])
            return outcome.inserted

    results = await asyncio.gather(*(writer() for _ in range(5)), return_exceptions=True)
    inserted = sum(r for r in results if isinstance(r, int))
    assert inserted == 1

    async with database.session() as session:
        assert await repositories.count_rows(session, MarketEvent) == 1
