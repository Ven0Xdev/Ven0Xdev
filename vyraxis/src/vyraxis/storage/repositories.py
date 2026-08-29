"""Repositories: the only place SQL for the ingest path is written.

Design notes that matter for correctness:

* **Dedup is enforced by the database.** Event inserts use
  ``ON CONFLICT (dedup_key) DO NOTHING ... RETURNING id`` so the number of rows
  returned is the number genuinely inserted. An in-process cache can be wrong
  after a restart or with two workers; a UNIQUE index cannot.
* **First-sighting fields are never overwritten.** ``first_seen_at`` and
  ``first_seen_slot`` are set on insert only. Overwriting them would rewrite
  history and silently create look-ahead bias in every dataset built later.
* **Nullable chain state is filled with COALESCE**, so a later read that learns
  a token's decimals does not erase a value an earlier read already found.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from vyraxis.core.enums import (
    ConnectionState,
    HealthStatus,
    ObservationKind,
    ObservationStatus,
    SystemEventLevel,
)
from vyraxis.storage.models import (
    IngestCheckpoint,
    MarketEvent,
    Observation,
    Pool,
    ProviderHealthSnapshot,
    SystemEvent,
    Token,
    Wallet,
)


@dataclass(frozen=True, slots=True)
class InsertOutcome:
    """Result of a batch insert that tolerates duplicates."""

    submitted: int
    inserted: int

    @property
    def duplicates(self) -> int:
        return self.submitted - self.inserted


async def upsert_token(
    session: AsyncSession,
    *,
    mint: str,
    first_seen_at: datetime,
    discovery_source: str,
    token_program: str | None = None,
    first_seen_slot: int | None = None,
    created_block_time: datetime | None = None,
    last_event_at: datetime | None = None,
    event_increment: int = 0,
) -> None:
    """Insert a token on first sighting, or bump its activity counters."""
    stmt = pg_insert(Token).values(
        mint=mint,
        token_program=token_program,
        first_seen_at=first_seen_at,
        first_seen_slot=first_seen_slot,
        created_block_time=created_block_time,
        discovery_source=discovery_source,
        last_event_at=last_event_at,
        event_count=event_increment,
    )
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[Token.mint],
            set_={
                "token_program": func.coalesce(Token.token_program, stmt.excluded.token_program),
                "created_block_time": func.coalesce(
                    Token.created_block_time, stmt.excluded.created_block_time
                ),
                "last_event_at": func.greatest(
                    func.coalesce(Token.last_event_at, stmt.excluded.last_event_at),
                    stmt.excluded.last_event_at,
                ),
                "event_count": Token.event_count + stmt.excluded.event_count,
            },
        )
    )


async def update_token_chain_state(
    session: AsyncSession,
    *,
    mint: str,
    checked_at: datetime,
    decimals: int | None,
    supply_raw: int | None,
    mint_authority: str | None,
    freeze_authority: str | None,
    is_initialized: bool | None,
) -> None:
    """Record authoritative on-chain mint state read via RPC.

    Authorities are written verbatim, including ``None``: for a mint account
    ``None`` means the authority was genuinely revoked, which is a fact worth
    recording, not a missing value. ``chain_state_checked_at`` distinguishes
    "revoked" from "never looked".
    """
    await session.execute(
        update(Token)
        .where(Token.mint == mint)
        .values(
            decimals=decimals,
            supply_raw=supply_raw,
            mint_authority=mint_authority,
            freeze_authority=freeze_authority,
            is_initialized=is_initialized,
            chain_state_checked_at=checked_at,
        )
    )


async def upsert_pool(
    session: AsyncSession,
    *,
    address: str,
    dex: str,
    program_id: str,
    first_seen_at: datetime,
    discovery_source: str,
    base_mint: str | None = None,
    quote_mint: str | None = None,
    base_vault: str | None = None,
    quote_vault: str | None = None,
    lp_mint: str | None = None,
    first_seen_slot: int | None = None,
    created_block_time: datetime | None = None,
    last_event_at: datetime | None = None,
    event_increment: int = 0,
    raw: dict[str, Any] | None = None,
) -> None:
    stmt = pg_insert(Pool).values(
        address=address,
        dex=dex,
        program_id=program_id,
        base_mint=base_mint,
        quote_mint=quote_mint,
        base_vault=base_vault,
        quote_vault=quote_vault,
        lp_mint=lp_mint,
        first_seen_at=first_seen_at,
        first_seen_slot=first_seen_slot,
        created_block_time=created_block_time,
        discovery_source=discovery_source,
        last_event_at=last_event_at,
        event_count=event_increment,
        raw=raw,
    )
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[Pool.address],
            set_={
                "base_mint": func.coalesce(Pool.base_mint, stmt.excluded.base_mint),
                "quote_mint": func.coalesce(Pool.quote_mint, stmt.excluded.quote_mint),
                "base_vault": func.coalesce(Pool.base_vault, stmt.excluded.base_vault),
                "quote_vault": func.coalesce(Pool.quote_vault, stmt.excluded.quote_vault),
                "lp_mint": func.coalesce(Pool.lp_mint, stmt.excluded.lp_mint),
                "created_block_time": func.coalesce(
                    Pool.created_block_time, stmt.excluded.created_block_time
                ),
                "last_event_at": func.greatest(
                    func.coalesce(Pool.last_event_at, stmt.excluded.last_event_at),
                    stmt.excluded.last_event_at,
                ),
                "event_count": Pool.event_count + stmt.excluded.event_count,
            },
        )
    )


async def upsert_wallet(
    session: AsyncSession, *, address: str, seen_at: datetime, event_increment: int = 1
) -> None:
    stmt = pg_insert(Wallet).values(
        address=address,
        first_seen_at=seen_at,
        last_seen_at=seen_at,
        event_count=event_increment,
    )
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[Wallet.address],
            set_={
                "last_seen_at": func.greatest(Wallet.last_seen_at, stmt.excluded.last_seen_at),
                "event_count": Wallet.event_count + stmt.excluded.event_count,
            },
        )
    )


async def insert_market_events(
    session: AsyncSession, rows: Sequence[dict[str, Any]]
) -> InsertOutcome:
    """Insert normalized events, ignoring ones already stored.

    Returns how many were submitted and how many were actually written, so the
    caller can report a duplicate rate rather than assuming every submitted
    event became a row.
    """
    if not rows:
        return InsertOutcome(submitted=0, inserted=0)

    stmt = (
        pg_insert(MarketEvent)
        .values(list(rows))
        .on_conflict_do_nothing(index_elements=[MarketEvent.dedup_key])
        .returning(MarketEvent.id)
    )
    result = await session.execute(stmt)
    inserted = len(result.scalars().all())
    return InsertOutcome(submitted=len(rows), inserted=inserted)


async def create_discovery_observation(
    session: AsyncSession,
    *,
    token_mint: str,
    observed_at: datetime,
    source: str,
    pool_address: str | None = None,
    slot: int | None = None,
    payload: dict[str, Any] | None = None,
) -> Observation:
    """Write the immutable snapshot taken at the moment of discovery."""
    observation = Observation(
        token_mint=token_mint,
        pool_address=pool_address,
        kind=ObservationKind.DISCOVERY,
        status=ObservationStatus.CAPTURED,
        due_at=observed_at,
        captured_at=observed_at,
        slot=slot,
        source=source,
        payload=payload,
    )
    session.add(observation)
    await session.flush()
    return observation


async def schedule_horizon_observations(
    session: AsyncSession,
    *,
    anchor: Observation,
    horizons_seconds: Iterable[int],
) -> int:
    """Queue future observations relative to a discovery anchor.

    Rows are created ``PENDING`` with a ``due_at`` in the future and no payload.
    They are filled in only when that instant arrives; nothing here reads or
    writes data from a time other than now.
    """
    rows = [
        {
            "token_mint": anchor.token_mint,
            "pool_address": anchor.pool_address,
            "kind": ObservationKind.HORIZON,
            "status": ObservationStatus.PENDING,
            "anchor_observation_id": anchor.id,
            "horizon_seconds": horizon,
            "due_at": anchor.due_at + timedelta(seconds=horizon),
            "source": anchor.source,
        }
        for horizon in horizons_seconds
    ]
    if not rows:
        return 0
    stmt = (
        pg_insert(Observation)
        .values(rows)
        .on_conflict_do_nothing(
            # Must repeat the partial index predicate: the unique index on
            # (anchor, horizon) only covers HORIZON rows.
            index_elements=[Observation.anchor_observation_id, Observation.horizon_seconds],
            index_where=Observation.kind == ObservationKind.HORIZON,
        )
        .returning(Observation.id)
    )
    result = await session.execute(stmt)
    return len(result.scalars().all())


async def due_observations(
    session: AsyncSession, *, now: datetime, limit: int = 100
) -> Sequence[Observation]:
    """Pending observations whose due time has arrived.

    ``SKIP LOCKED`` lets several capture workers share the queue without two of
    them filling the same row.
    """
    stmt = (
        select(Observation)
        .where(
            Observation.status == ObservationStatus.PENDING,
            Observation.due_at <= now,
        )
        .order_by(Observation.due_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    result = await session.execute(stmt)
    return result.scalars().all()


async def record_system_event(
    session: AsyncSession,
    *,
    occurred_at: datetime,
    level: SystemEventLevel,
    category: str,
    event: str,
    instance: str,
    detail: dict[str, Any] | None = None,
) -> None:
    session.add(
        SystemEvent(
            occurred_at=occurred_at,
            level=level,
            category=category,
            event=event,
            instance=instance,
            detail=detail,
        )
    )


async def record_provider_health(
    session: AsyncSession,
    *,
    provider: str,
    component: str,
    status: HealthStatus,
    observed_at: datetime,
    connection_state: ConnectionState | None = None,
    latency_ms: int | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    session.add(
        ProviderHealthSnapshot(
            provider=provider,
            component=component,
            status=status,
            connection_state=connection_state,
            observed_at=observed_at,
            latency_ms=latency_ms,
            detail=detail,
        )
    )


async def upsert_checkpoint(
    session: AsyncSession,
    *,
    stream: str,
    updated_at: datetime,
    last_slot: int | None = None,
    last_signature: str | None = None,
    events_delta: int = 0,
) -> None:
    """Advance a stream checkpoint monotonically.

    ``last_slot`` uses GREATEST so an out-of-order message cannot rewind the
    checkpoint and cause the same range to be re-scanned or, worse, skipped.
    """
    stmt = pg_insert(IngestCheckpoint).values(
        stream=stream,
        last_slot=last_slot,
        last_signature=last_signature,
        events_ingested=events_delta,
        updated_at=updated_at,
    )
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[IngestCheckpoint.stream],
            set_={
                "last_slot": func.greatest(
                    func.coalesce(IngestCheckpoint.last_slot, stmt.excluded.last_slot),
                    stmt.excluded.last_slot,
                ),
                "last_signature": func.coalesce(
                    stmt.excluded.last_signature, IngestCheckpoint.last_signature
                ),
                "events_ingested": IngestCheckpoint.events_ingested + stmt.excluded.events_ingested,
                "updated_at": stmt.excluded.updated_at,
            },
        )
    )


async def count_rows(session: AsyncSession, model: type[Any]) -> int:
    """Row count helper used by health checks and tests."""
    result = await session.execute(select(func.count()).select_from(model))
    return int(result.scalar_one())


# ---- batch helpers used by the ingestion sink ---------------------------
#
# The sink needs two distinct things from the same set of addresses:
#   1. which of them are being seen for the very first time (so a discovery
#      observation is created exactly once), and
#   2. updated activity counters for all of them.
#
# These are deliberately two statements. A single ``ON CONFLICT DO UPDATE``
# could do both via the ``xmax = 0`` trick, but that idiom is subtle enough that
# a future reader could not verify it at a glance, and the cost of being wrong
# is a missing or duplicated discovery observation.


async def insert_tokens_if_absent(
    session: AsyncSession, rows: Sequence[dict[str, Any]]
) -> set[str]:
    """Insert first-sighting token rows; return the mints actually created."""
    if not rows:
        return set()
    deduped = _dedupe_by(rows, "mint")
    stmt = (
        pg_insert(Token)
        .values(deduped)
        .on_conflict_do_nothing(index_elements=[Token.mint])
        .returning(Token.mint)
    )
    result = await session.execute(stmt)
    return set(result.scalars().all())


async def insert_pools_if_absent(session: AsyncSession, rows: Sequence[dict[str, Any]]) -> set[str]:
    """Insert first-sighting pool rows; return the addresses actually created."""
    if not rows:
        return set()
    deduped = _dedupe_by(rows, "address")
    stmt = (
        pg_insert(Pool)
        .values(deduped)
        .on_conflict_do_nothing(index_elements=[Pool.address])
        .returning(Pool.address)
    )
    result = await session.execute(stmt)
    return set(result.scalars().all())


async def insert_wallets_if_absent(
    session: AsyncSession, rows: Sequence[dict[str, Any]]
) -> set[str]:
    if not rows:
        return set()
    deduped = _dedupe_by(rows, "address")
    stmt = (
        pg_insert(Wallet)
        .values(deduped)
        .on_conflict_do_nothing(index_elements=[Wallet.address])
        .returning(Wallet.address)
    )
    result = await session.execute(stmt)
    return set(result.scalars().all())


async def bump_token_activity(
    session: AsyncSession, counts: dict[str, int], *, seen_at: datetime
) -> None:
    """Add per-mint event counts and advance ``last_event_at``."""
    for mint, increment in counts.items():
        await session.execute(
            update(Token)
            .where(Token.mint == mint)
            .values(
                event_count=Token.event_count + increment,
                last_event_at=func.greatest(func.coalesce(Token.last_event_at, seen_at), seen_at),
            )
        )


async def bump_pool_activity(
    session: AsyncSession, counts: dict[str, int], *, seen_at: datetime
) -> None:
    for address, increment in counts.items():
        await session.execute(
            update(Pool)
            .where(Pool.address == address)
            .values(
                event_count=Pool.event_count + increment,
                last_event_at=func.greatest(func.coalesce(Pool.last_event_at, seen_at), seen_at),
            )
        )


async def bump_wallet_activity(
    session: AsyncSession, counts: dict[str, int], *, seen_at: datetime
) -> None:
    for address, increment in counts.items():
        await session.execute(
            update(Wallet)
            .where(Wallet.address == address)
            .values(
                event_count=Wallet.event_count + increment,
                last_seen_at=func.greatest(Wallet.last_seen_at, seen_at),
            )
        )


def _dedupe_by(rows: Sequence[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    """Keep the first row per key.

    PostgreSQL rejects a multi-row upsert that touches the same conflict target
    twice, and the first sighting is the one whose ``first_seen_at`` we want.
    """
    seen: dict[str, dict[str, Any]] = {}
    for row in rows:
        identifier = row[key]
        if identifier not in seen:
            seen[identifier] = row
    return list(seen.values())
