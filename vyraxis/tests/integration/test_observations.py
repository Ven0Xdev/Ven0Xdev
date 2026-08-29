"""Observation scheduling and the no-future-data guarantee."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from conftest import T0, requires_database
from fixtures import samples
from vyraxis.core.clock import ManualClock
from vyraxis.core.enums import ObservationKind, ObservationStatus
from vyraxis.core.errors import IntegrityError
from vyraxis.scanner.observations import ObservationScheduler
from vyraxis.storage import repositories
from vyraxis.storage.engine import Database
from vyraxis.storage.models import Observation

pytestmark = [pytest.mark.integration, requires_database]

MINT = samples.MEMECOIN_MINT
HORIZONS = [30, 60, 300]


async def seed_token(database: Database) -> None:
    async with database.session() as session:
        await repositories.insert_tokens_if_absent(
            session,
            [
                {
                    "mint": MINT,
                    "first_seen_at": T0,
                    "first_seen_slot": 1,
                    "discovery_source": "test",
                    "last_event_at": T0,
                    "event_count": 0,
                }
            ],
        )


async def test_discovery_creates_an_anchor_and_pending_horizons(database: Database) -> None:
    await seed_token(database)
    scheduler = ObservationScheduler(HORIZONS)

    async with database.session() as session:
        anchor = await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=T0, source="logs:test", slot=1
        )
        anchor_id = anchor.id

    async with database.session() as session:
        rows = (await session.execute(select(Observation).order_by(Observation.id))).scalars().all()

    assert len(rows) == 1 + len(HORIZONS)
    discovery = rows[0]
    assert discovery.kind is ObservationKind.DISCOVERY
    assert discovery.status is ObservationStatus.CAPTURED
    assert discovery.captured_at == T0

    horizons = rows[1:]
    assert [row.horizon_seconds for row in horizons] == HORIZONS
    for row in horizons:
        assert row.kind is ObservationKind.HORIZON
        assert row.status is ObservationStatus.PENDING
        assert row.anchor_observation_id == anchor_id
        # The defining property: a horizon row is empty and due in the future.
        assert row.payload is None
        assert row.captured_at is None
        assert row.due_at == T0 + timedelta(seconds=row.horizon_seconds)


async def test_horizon_scheduling_is_idempotent(database: Database) -> None:
    await seed_token(database)
    scheduler = ObservationScheduler(HORIZONS)

    async with database.session() as session:
        anchor = await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=T0, source="logs:test"
        )
        again = await repositories.schedule_horizon_observations(
            session, anchor=anchor, horizons_seconds=HORIZONS
        )
    assert again == 0

    async with database.session() as session:
        total = await repositories.count_rows(session, Observation)
    assert total == 1 + len(HORIZONS)


async def test_due_observations_are_only_returned_once_due(database: Database) -> None:
    await seed_token(database)
    scheduler = ObservationScheduler(HORIZONS)
    async with database.session() as session:
        await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=T0, source="logs:test"
        )

    async with database.session() as session:
        assert await repositories.due_observations(session, now=T0) == []

    async with database.session() as session:
        due = await repositories.due_observations(session, now=T0 + timedelta(seconds=60))
    assert sorted(row.horizon_seconds for row in due) == [30, 60]


async def test_capture_fills_only_due_rows(database: Database) -> None:
    await seed_token(database)
    scheduler = ObservationScheduler(HORIZONS)
    async with database.session() as session:
        await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=T0, source="logs:test"
        )

    now = T0 + timedelta(seconds=60)

    async def capture(observation: Observation) -> dict:
        return {"horizon": observation.horizon_seconds, "captured_at": now.isoformat()}

    async with database.session() as session:
        filled = await scheduler.capture_due(session, now=now, capture=capture)
    assert filled == 2

    async with database.session() as session:
        rows = (
            (
                await session.execute(
                    select(Observation).where(Observation.horizon_seconds.isnot(None))
                )
            )
            .scalars()
            .all()
        )
    by_horizon = {row.horizon_seconds: row for row in rows}
    assert by_horizon[30].status is ObservationStatus.CAPTURED
    assert by_horizon[30].captured_at == now
    assert by_horizon[300].status is ObservationStatus.PENDING
    assert by_horizon[300].payload is None


async def test_capture_before_due_time_is_refused(database: Database) -> None:
    """The structural defence against look-ahead bias.

    An observation filled before its due time would carry data from the wrong
    instant into a past feature vector. The scheduler refuses rather than
    trusting the caller.
    """
    await seed_token(database)
    scheduler = ObservationScheduler(HORIZONS)
    async with database.session() as session:
        anchor = await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=T0, source="logs:test"
        )

    # Hand the scheduler a row that is not yet due, as a buggy caller would.
    async with database.session() as session:
        not_due = (
            await session.execute(select(Observation).where(Observation.horizon_seconds == 300))
        ).scalar_one()
        assert not_due.anchor_observation_id == anchor.id

        async def capture(_observation: Observation) -> dict:
            return {"should": "never be called"}

        original = repositories.due_observations

        async def leaky_due(*_args, **_kwargs):
            return [not_due]

        repositories.due_observations = leaky_due  # type: ignore[assignment]
        try:
            with pytest.raises(IntegrityError, match="before it is due"):
                await scheduler.capture_due(session, now=T0, capture=capture)
        finally:
            repositories.due_observations = original  # type: ignore[assignment]


async def test_capture_failure_is_recorded_not_swallowed(database: Database) -> None:
    await seed_token(database)
    scheduler = ObservationScheduler(HORIZONS)
    async with database.session() as session:
        await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=T0, source="logs:test"
        )

    async def failing(_observation: Observation) -> dict:
        raise RuntimeError("rpc exploded")

    async with database.session() as session:
        filled = await scheduler.capture_due(
            session, now=T0 + timedelta(seconds=60), capture=failing
        )
    assert filled == 0

    async with database.session() as session:
        rows = (
            (await session.execute(select(Observation).where(Observation.horizon_seconds == 30)))
            .scalars()
            .all()
        )
    assert rows[0].status is ObservationStatus.FAILED
    assert "rpc exploded" in (rows[0].failure_reason or "")


async def test_missing_data_marks_missed_rather_than_backfilling(database: Database) -> None:
    """No data at the due instant means MISSED - never a value from another time."""
    await seed_token(database)
    scheduler = ObservationScheduler(HORIZONS)
    async with database.session() as session:
        await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=T0, source="logs:test"
        )

    async def nothing(_observation: Observation) -> None:
        return None

    async with database.session() as session:
        await scheduler.capture_due(session, now=T0 + timedelta(seconds=30), capture=nothing)

    async with database.session() as session:
        row = (
            await session.execute(select(Observation).where(Observation.horizon_seconds == 30))
        ).scalar_one()
    assert row.status is ObservationStatus.MISSED
    assert row.payload is None
    assert row.captured_at is None


async def test_clock_injection_keeps_scheduling_deterministic(database: Database) -> None:
    await seed_token(database)
    clock = ManualClock(T0)
    scheduler = ObservationScheduler([30])
    async with database.session() as session:
        anchor = await scheduler.record_discovery(
            session, token_mint=MINT, observed_at=clock.now(), source="logs:test"
        )
    clock.advance(30)
    async with database.session() as session:
        due = await repositories.due_observations(session, now=clock.now())
    assert len(due) == 1
    assert due[0].anchor_observation_id == anchor.id
