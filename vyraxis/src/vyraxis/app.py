"""Application composition root.

Every dependency is constructed here and injected downward. No module reaches
for a global engine, a global settings object or an ambient clock, which is what
makes the pipeline testable against a local server and a real database.
"""

from __future__ import annotations

import asyncio
import contextlib
from dataclasses import dataclass
from typing import Any

from vyraxis.core.clock import SYSTEM_CLOCK, Clock
from vyraxis.core.config import Settings, get_settings
from vyraxis.core.enums import ConnectionState, SystemEventLevel
from vyraxis.core.logging import configure_logging, get_logger
from vyraxis.observability import checks
from vyraxis.observability.health import HealthRegistry, HealthReport
from vyraxis.scanner.enrichment import TransactionEnricher
from vyraxis.scanner.normalizer import LogNotificationNormalizer
from vyraxis.scanner.observations import ObservationScheduler
from vyraxis.scanner.pipeline import IngestionPipeline
from vyraxis.scanner.sink import EventSink
from vyraxis.solana import programs
from vyraxis.solana.rpc import SolanaRpcClient
from vyraxis.solana.subscriptions import Subscription, logs_subscription, slot_subscription
from vyraxis.solana.websocket import SolanaEventStream
from vyraxis.storage import repositories
from vyraxis.storage.engine import Database

log = get_logger(__name__)


def build_subscriptions(settings: Settings) -> list[Subscription]:
    """Choose what to subscribe to.

    A slot heartbeat is always attached. Without it, an idle market and a dead
    socket look identical and stale-detection cannot distinguish them.
    """
    watched = settings.ingestion.watched_programs or programs.default_watched_programs()
    subs = [logs_subscription(program, settings.solana.commitment) for program in watched]
    subs.append(slot_subscription())
    return subs


@dataclass
class VyraxisApp:
    """Wired application object."""

    settings: Settings
    database: Database
    rpc: SolanaRpcClient
    stream: SolanaEventStream
    pipeline: IngestionPipeline
    health: HealthRegistry
    clock: Clock
    listener: _SystemEventListener | None = None

    @classmethod
    def build(
        cls,
        settings: Settings | None = None,
        *,
        clock: Clock = SYSTEM_CLOCK,
        configure_logs: bool = True,
    ) -> VyraxisApp:
        settings = settings or get_settings()
        if configure_logs:
            configure_logging(
                level=settings.app.log_level,
                fmt=settings.app.log_format,
                service_name=settings.app.service_name,
                instance_id=settings.app.instance_id,
            )

        database = Database(settings.database)
        rpc = SolanaRpcClient(settings.solana, clock=clock)

        listener = _SystemEventListener(database, settings.app.instance_id, clock)
        stream = SolanaEventStream(
            settings.solana,
            build_subscriptions(settings),
            clock=clock,
            listener=listener,
        )

        scheduler = ObservationScheduler(settings.observations.horizons_seconds)
        sink = EventSink(
            database,
            scheduler,
            instance_id=settings.app.instance_id,
            clock=clock,
        )
        pipeline = IngestionPipeline(
            stream=stream,
            sink=sink,
            settings=settings.ingestion,
            normalizer=LogNotificationNormalizer(),
            enricher=TransactionEnricher(rpc),
            clock=clock,
        )

        registry = HealthRegistry(clock=clock)
        registry.register("database", checks.database_check(database))
        registry.register("solana_rpc", checks.rpc_check(rpc))
        registry.register("solana_event_stream", checks.event_stream_check(stream, clock=clock))
        registry.register("ingestion_pipeline", checks.pipeline_check(pipeline))

        return cls(
            settings=settings,
            database=database,
            rpc=rpc,
            stream=stream,
            pipeline=pipeline,
            health=registry,
            clock=clock,
            listener=listener,
        )

    async def check_health(self) -> HealthReport:
        return await self.health.run()

    def status(self) -> dict[str, Any]:
        return {
            "service": self.settings.app.service_name,
            "environment": self.settings.app.environment,
            "instance": self.settings.app.instance_id,
            "version": _version(),
            "live_trading_enabled": self.settings.safety.live_trading_enabled,
            "subscriptions": [sub.name for sub in build_subscriptions(self.settings)],
            **self.pipeline.snapshot(),
        }

    async def shutdown(self) -> None:
        with contextlib.suppress(Exception):
            await self.pipeline.stop()
        if self.listener is not None:
            # Drain before disposing the engine: these tasks hold connections,
            # and abandoning them leaves "Task was destroyed but it is pending"
            # plus a lost durable record of the final state transitions.
            await self.listener.drain()
        with contextlib.suppress(Exception):
            await self.rpc.close()
        await self.database.dispose()


class _SystemEventListener:
    """Persists connection state transitions to ``system_events``.

    Writes are fire-and-forget on a best-effort basis: a database hiccup must
    not take down the WebSocket loop. The structured log line is emitted by the
    stream itself regardless, so a failed write loses the durable copy, not the
    signal.
    """

    def __init__(self, database: Database, instance_id: str, clock: Clock) -> None:
        self._db = database
        self._instance = instance_id
        self._clock = clock
        self._tasks: set[asyncio.Task[None]] = set()

    async def drain(self, timeout_seconds: float = 5.0) -> None:
        """Await outstanding writes so shutdown does not abandon them."""
        pending = [task for task in self._tasks if not task.done()]
        if not pending:
            return
        with contextlib.suppress(TimeoutError):
            await asyncio.wait(pending, timeout=timeout_seconds)
        for task in pending:
            if not task.done():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task

    def on_state_change(self, state: ConnectionState, detail: dict[str, Any]) -> None:
        level = (
            SystemEventLevel.WARNING
            if state in {ConnectionState.RECONNECTING, ConnectionState.DISCONNECTED}
            else SystemEventLevel.INFO
        )
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        task = loop.create_task(self._write(state, detail, level))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _write(
        self, state: ConnectionState, detail: dict[str, Any], level: SystemEventLevel
    ) -> None:
        try:
            async with self._db.session() as session:
                await repositories.record_system_event(
                    session,
                    occurred_at=self._clock.now(),
                    level=level,
                    category="connection",
                    event=f"ws_{state.value.lower()}",
                    instance=self._instance,
                    detail=detail,
                )
        except Exception as exc:
            log.warning("system_event_write_failed", state=state.value, error=str(exc))


def _version() -> str:
    from vyraxis import __version__

    return __version__
