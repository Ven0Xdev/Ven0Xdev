"""Batched persistence of normalized events.

One flush is one transaction, executed in an order that satisfies the foreign
keys and makes first-sighting detection exact:

1. insert tokens/pools/wallets that do not exist yet, capturing which were
   genuinely created (that set *is* the discovery set);
2. bump activity counters for every entity referenced by the batch;
3. insert the events themselves with ``ON CONFLICT DO NOTHING``, counting how
   many rows were actually written;
4. create a DISCOVERY observation, with its future horizon rows, for each newly
   created token;
5. advance the stream checkpoint.

If any step raises, the whole flush rolls back and the batch is reported as
failed - both to the log and to ``system_events``. Nothing is dropped quietly:
:attr:`SinkStats.failed_batches` and ``events_lost`` make loss visible.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from vyraxis.core.clock import SYSTEM_CLOCK, Clock
from vyraxis.core.enums import EventKind, SystemEventLevel
from vyraxis.core.logging import get_logger
from vyraxis.scanner.events import NormalizedEvent
from vyraxis.scanner.observations import ObservationScheduler
from vyraxis.storage import repositories
from vyraxis.storage.engine import Database

log = get_logger(__name__)

#: Kinds that make a token a research candidate worth observing over time.
DISCOVERY_KINDS: frozenset[EventKind] = frozenset(
    {EventKind.TOKEN_CREATED, EventKind.POOL_CREATED, EventKind.SWAP}
)


@dataclass
class SinkStats:
    batches: int = 0
    failed_batches: int = 0
    events_submitted: int = 0
    events_inserted: int = 0
    events_duplicate: int = 0
    events_lost: int = 0
    tokens_discovered: int = 0
    pools_discovered: int = 0
    wallets_discovered: int = 0
    observations_created: int = 0
    last_flush_at: datetime | None = None

    def snapshot(self) -> dict[str, Any]:
        data = {key: value for key, value in self.__dict__.items() if key != "last_flush_at"}
        data["last_flush_at"] = self.last_flush_at.isoformat() if self.last_flush_at else None
        return data


@dataclass
class FlushResult:
    submitted: int = 0
    inserted: int = 0
    duplicates: int = 0
    new_tokens: set[str] = field(default_factory=set)
    new_pools: set[str] = field(default_factory=set)
    observations: int = 0


class EventSink:
    """Persists batches of normalized events."""

    def __init__(
        self,
        database: Database,
        scheduler: ObservationScheduler,
        *,
        instance_id: str = "local-1",
        clock: Clock = SYSTEM_CLOCK,
    ) -> None:
        self._db = database
        self._scheduler = scheduler
        self._instance = instance_id
        self._clock = clock
        self.stats = SinkStats()

    async def flush(self, events: list[NormalizedEvent]) -> FlushResult:
        """Persist a batch. Raises only if the database itself is unreachable."""
        if not events:
            return FlushResult()

        try:
            async with self._db.session() as session:
                result = await self._write_batch(session, events)
        except Exception as exc:
            self.stats.failed_batches += 1
            self.stats.events_lost += len(events)
            log.error(
                "sink_flush_failed",
                batch_size=len(events),
                error=f"{type(exc).__name__}: {exc}",
                events_lost_total=self.stats.events_lost,
            )
            await self._record_failure(len(events), exc)
            raise

        self.stats.batches += 1
        self.stats.events_submitted += result.submitted
        self.stats.events_inserted += result.inserted
        self.stats.events_duplicate += result.duplicates
        self.stats.tokens_discovered += len(result.new_tokens)
        self.stats.pools_discovered += len(result.new_pools)
        self.stats.observations_created += result.observations
        self.stats.last_flush_at = self._clock.now()

        log.info(
            "sink_flush",
            submitted=result.submitted,
            inserted=result.inserted,
            duplicates=result.duplicates,
            new_tokens=len(result.new_tokens),
            new_pools=len(result.new_pools),
            observations=result.observations,
        )
        return result

    async def _write_batch(
        self, session: AsyncSession, events: list[NormalizedEvent]
    ) -> FlushResult:
        now = self._clock.now()

        token_rows, token_counts = self._token_rows(events)
        pool_rows, pool_counts = self._pool_rows(events)
        wallet_rows, wallet_counts = self._wallet_rows(events)

        new_tokens = await repositories.insert_tokens_if_absent(session, token_rows)
        new_pools = await repositories.insert_pools_if_absent(session, pool_rows)
        new_wallets = await repositories.insert_wallets_if_absent(session, wallet_rows)

        await repositories.bump_token_activity(session, token_counts, seen_at=now)
        await repositories.bump_pool_activity(session, pool_counts, seen_at=now)
        await repositories.bump_wallet_activity(session, wallet_counts, seen_at=now)

        outcome = await repositories.insert_market_events(
            session, [event.to_row() for event in events]
        )

        observations = await self._create_discovery_observations(session, events, new_tokens)

        streams: dict[str, tuple[int, str | None, int]] = {}
        for event in events:
            slot, signature, count = streams.get(event.stream, (0, None, 0))
            streams[event.stream] = (
                max(slot, event.slot),
                event.signature or signature,
                count + 1,
            )
        for stream, (slot, signature, count) in streams.items():
            await repositories.upsert_checkpoint(
                session,
                stream=stream,
                updated_at=now,
                last_slot=slot,
                last_signature=signature,
                events_delta=count,
            )

        self.stats.wallets_discovered += len(new_wallets)
        return FlushResult(
            submitted=outcome.submitted,
            inserted=outcome.inserted,
            duplicates=outcome.duplicates,
            new_tokens=new_tokens,
            new_pools=new_pools,
            observations=observations,
        )

    async def _create_discovery_observations(
        self,
        session: AsyncSession,
        events: list[NormalizedEvent],
        new_tokens: set[str],
    ) -> int:
        if not new_tokens:
            return 0
        first_event: dict[str, NormalizedEvent] = {}
        for event in events:
            if event.token_mint in new_tokens and event.token_mint not in first_event:
                first_event[event.token_mint] = event

        created = 0
        for mint, event in first_event.items():
            if event.kind not in DISCOVERY_KINDS:
                continue
            await self._scheduler.record_discovery(
                session,
                token_mint=mint,
                observed_at=event.observed_at,
                source=event.stream,
                pool_address=event.pool_address,
                slot=event.slot,
                payload={
                    "discovery_kind": event.kind.value,
                    "signature": event.signature,
                    "program_id": event.program_id,
                    "reason_codes": list(event.reason_codes),
                    "decode_status": event.decode_status.value,
                },
            )
            created += 1
        return created

    def _token_rows(
        self, events: list[NormalizedEvent]
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        rows: list[dict[str, Any]] = []
        counts: dict[str, int] = defaultdict(int)
        for event in events:
            if not event.token_mint:
                continue
            counts[event.token_mint] += 1
            rows.append(
                {
                    "mint": event.token_mint,
                    "token_program": None,
                    "first_seen_at": event.observed_at,
                    "first_seen_slot": event.slot,
                    "created_block_time": event.block_time,
                    "discovery_source": event.stream,
                    "last_event_at": event.observed_at,
                    "event_count": 0,
                }
            )
        return rows, dict(counts)

    def _pool_rows(
        self, events: list[NormalizedEvent]
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        from vyraxis.solana import programs

        rows: list[dict[str, Any]] = []
        counts: dict[str, int] = defaultdict(int)
        for event in events:
            if not event.pool_address:
                continue
            counts[event.pool_address] += 1
            rows.append(
                {
                    "address": event.pool_address,
                    "dex": programs.dex_for(event.program_id or "") or "unknown",
                    "program_id": event.program_id or "unknown",
                    "base_mint": event.token_mint,
                    "first_seen_at": event.observed_at,
                    "first_seen_slot": event.slot,
                    "created_block_time": event.block_time,
                    "discovery_source": event.stream,
                    "last_event_at": event.observed_at,
                    "event_count": 0,
                }
            )
        return rows, dict(counts)

    def _wallet_rows(
        self, events: list[NormalizedEvent]
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        rows: list[dict[str, Any]] = []
        counts: dict[str, int] = defaultdict(int)
        for event in events:
            if not event.actor_wallet:
                continue
            counts[event.actor_wallet] += 1
            rows.append(
                {
                    "address": event.actor_wallet,
                    "first_seen_at": event.observed_at,
                    "last_seen_at": event.observed_at,
                    "event_count": 0,
                }
            )
        return rows, dict(counts)

    async def _record_failure(self, batch_size: int, exc: Exception) -> None:
        """Best-effort durable record of a flush failure.

        If the database is the thing that failed this will fail too; the log
        line emitted by the caller is the fallback, which is why it is written
        first and unconditionally.
        """
        try:
            async with self._db.session() as session:
                await repositories.record_system_event(
                    session,
                    occurred_at=self._clock.now(),
                    level=SystemEventLevel.ERROR,
                    category="ingestion",
                    event="sink_flush_failed",
                    instance=self._instance,
                    detail={
                        "batch_size": batch_size,
                        "error_type": type(exc).__name__,
                        "error": str(exc)[:500],
                    },
                )
        except Exception as nested:
            log.error("sink_failure_record_failed", error=str(nested))
