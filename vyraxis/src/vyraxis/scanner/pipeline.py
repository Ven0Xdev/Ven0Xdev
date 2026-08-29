"""The ingestion pipeline.

    stream -> normalize -> dedup (cache) -> queue -> [enrich] -> batch -> persist

Two tasks with a bounded queue between them. The producer never blocks on the
database and the consumer never blocks the socket, which is what keeps a slow
flush from turning into a dropped subscription.

Backpressure over loss
----------------------
When the queue fills, the default is to *wait*. Dropping is available
(``drop_on_full_queue``) for operators who would rather shed load than lag, and
when it happens every dropped event is counted in ``events_dropped`` and logged.
There is no configuration in which data disappears silently.
"""

from __future__ import annotations

import asyncio
import contextlib
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from vyraxis.core.clock import SYSTEM_CLOCK, Clock
from vyraxis.core.config import IngestionSettings
from vyraxis.core.enums import EventKind
from vyraxis.core.logging import get_logger
from vyraxis.scanner.dedup import DedupCache
from vyraxis.scanner.enrichment import TransactionEnricher
from vyraxis.scanner.events import NormalizedEvent
from vyraxis.scanner.normalizer import LogNotificationNormalizer
from vyraxis.scanner.sink import EventSink
from vyraxis.solana.provider import EventStreamProvider

log = get_logger(__name__)

#: Kinds worth spending an RPC call on. Enriching every SPL transfer on the
#: network would cost far more than the information is worth.
ENRICHABLE_KINDS: frozenset[EventKind] = frozenset(
    {
        EventKind.TOKEN_CREATED,
        EventKind.POOL_CREATED,
        EventKind.SWAP,
        EventKind.AUTHORITY_CHANGED,
    }
)


@dataclass
class PipelineStats:
    raw_received: int = 0
    normalized: int = 0
    dedup_hits: int = 0
    events_queued: int = 0
    events_dropped: int = 0
    events_enriched: int = 0
    batches_flushed: int = 0
    flush_failures: int = 0
    started_at: datetime | None = None
    last_event_at: datetime | None = None

    def snapshot(self) -> dict[str, Any]:
        data = {
            key: value
            for key, value in self.__dict__.items()
            if key not in {"started_at", "last_event_at"}
        }
        data["started_at"] = self.started_at.isoformat() if self.started_at else None
        data["last_event_at"] = self.last_event_at.isoformat() if self.last_event_at else None
        return data


class IngestionPipeline:
    """Wires an event stream to persistent storage."""

    def __init__(
        self,
        *,
        stream: EventStreamProvider,
        sink: EventSink,
        settings: IngestionSettings,
        normalizer: LogNotificationNormalizer | None = None,
        enricher: TransactionEnricher | None = None,
        clock: Clock = SYSTEM_CLOCK,
        flush_interval_seconds: float | None = None,
        enrichment_concurrency: int = 4,
    ) -> None:
        self._stream = stream
        self._sink = sink
        self._settings = settings
        self._normalizer = normalizer or LogNotificationNormalizer()
        self._enricher = enricher
        self._clock = clock
        self._flush_interval = (
            flush_interval_seconds
            if flush_interval_seconds is not None
            else settings.persist_flush_interval_seconds
        )
        self._queue: asyncio.Queue[NormalizedEvent] = asyncio.Queue(
            maxsize=settings.normalized_queue_size
        )
        self._dedup = DedupCache(settings.dedup_cache_size)
        self._stopping = asyncio.Event()
        self._enrich_semaphore = asyncio.Semaphore(enrichment_concurrency)
        self.stats = PipelineStats()

    @property
    def dedup(self) -> DedupCache:
        return self._dedup

    def snapshot(self) -> dict[str, Any]:
        return {
            "pipeline": self.stats.snapshot(),
            "queue_depth": self._queue.qsize(),
            "queue_capacity": self._settings.normalized_queue_size,
            "dedup": {
                "size": len(self._dedup),
                "capacity": self._dedup.capacity,
                "seen": self._dedup.stats.seen,
                "duplicates": self._dedup.stats.duplicates,
                "evictions": self._dedup.stats.evictions,
            },
            "sink": self._sink.stats.snapshot(),
            "stream": self._stream.status().detail,
        }

    async def stop(self) -> None:
        self._stopping.set()
        await self._stream.stop()

    async def run(
        self, *, max_events: int | None = None, drain_timeout_seconds: float = 30.0
    ) -> PipelineStats:
        """Run until stopped, or until ``max_events`` have been persisted.

        ``max_events`` exists so tests and short operator runs terminate
        deterministically; production calls it with ``None``.

        Shutdown order matters. When the **producer** finishes, the consumer is
        given time to drain the queue and flush what it holds - cancelling it
        there would throw away events that were already accepted from the
        socket. When the **consumer** finishes (target reached, or it raised),
        the producer has nowhere left to deliver and is cancelled at once.
        """
        self.stats.started_at = self._clock.now()
        producer = asyncio.create_task(self._produce(max_events), name="vyraxis-ingest-producer")
        consumer = asyncio.create_task(self._consume(max_events), name="vyraxis-ingest-consumer")

        try:
            done, _ = await asyncio.wait({producer, consumer}, return_when=asyncio.FIRST_COMPLETED)

            if consumer in done:
                await self._cancel(producer)
            else:
                # Producer exhausted: tell the consumer to finish the queue.
                self._stopping.set()
                try:
                    await asyncio.wait_for(asyncio.shield(consumer), timeout=drain_timeout_seconds)
                except TimeoutError:
                    log.error(
                        "ingest_drain_timeout",
                        queue_depth=self._queue.qsize(),
                        drain_timeout_seconds=drain_timeout_seconds,
                    )
                    await self._cancel(consumer)
        finally:
            self._stopping.set()
            await self._cancel(producer)
            await self._cancel(consumer)

        for task in (producer, consumer):
            if task.done() and not task.cancelled():
                exc = task.exception()
                if exc is not None:
                    raise exc

        return self.stats

    @staticmethod
    async def _cancel(task: asyncio.Task[Any]) -> None:
        if task.done():
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    async def _produce(self, max_events: int | None) -> None:
        try:
            async for raw in self._stream.stream():
                if self._stopping.is_set():
                    break
                self.stats.raw_received += 1

                event = self._normalizer.normalize(raw)
                if event is None:
                    continue
                self.stats.normalized += 1

                if not self._dedup.check_and_add(event.dedup_key):
                    self.stats.dedup_hits += 1
                    continue

                if self._queue.full() and self._settings.drop_on_full_queue:
                    self.stats.events_dropped += 1
                    log.warning(
                        "ingest_queue_full_dropping",
                        dropped_total=self.stats.events_dropped,
                        queue_capacity=self._settings.normalized_queue_size,
                        dedup_key=event.dedup_key,
                    )
                    continue

                await self._queue.put(event)
                self.stats.events_queued += 1
                self.stats.last_event_at = event.observed_at

                if max_events is not None and self.stats.events_queued >= max_events:
                    break
        finally:
            # Sentinel-free shutdown: the consumer watches this flag and drains.
            self._stopping.set()

    async def _consume(self, max_events: int | None) -> None:
        persisted = 0
        while True:
            batch = await self._collect_batch()
            if batch:
                batch = await self._enrich_batch(batch)
                try:
                    result = await self._sink.flush(batch)
                    self.stats.batches_flushed += 1
                    persisted += result.inserted
                except Exception:
                    # The sink has already logged and recorded the failure and
                    # counted the lost events; the pipeline keeps running so a
                    # transient database outage does not kill ingestion.
                    self.stats.flush_failures += 1

            if max_events is not None and persisted >= max_events:
                return
            if self._stopping.is_set() and self._queue.empty():
                return

    async def _collect_batch(self) -> list[NormalizedEvent]:
        """Gather up to ``persist_batch_size`` events, waiting at most one interval."""
        batch: list[NormalizedEvent] = []
        try:
            first = await asyncio.wait_for(self._queue.get(), timeout=self._flush_interval)
        except TimeoutError:
            return batch
        batch.append(first)

        while len(batch) < self._settings.persist_batch_size:
            try:
                batch.append(self._queue.get_nowait())
            except asyncio.QueueEmpty:
                break
        return batch

    async def _enrich_batch(self, batch: list[NormalizedEvent]) -> list[NormalizedEvent]:
        enricher = self._enricher
        if enricher is None:
            return batch

        async def maybe_enrich(event: NormalizedEvent) -> NormalizedEvent:
            if event.kind not in ENRICHABLE_KINDS or not event.signature:
                return event
            async with self._enrich_semaphore:
                enriched = await enricher.enrich(event)
            self.stats.events_enriched += 1
            return enriched

        return list(await asyncio.gather(*(maybe_enrich(event) for event in batch)))
