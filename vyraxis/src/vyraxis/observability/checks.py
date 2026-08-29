"""Concrete health checks for VYRAXIS components."""

from __future__ import annotations

from typing import Any

from vyraxis.core.clock import SYSTEM_CLOCK, Clock
from vyraxis.core.enums import ConnectionState, HealthStatus
from vyraxis.observability.health import ComponentHealth
from vyraxis.scanner.pipeline import IngestionPipeline
from vyraxis.solana.provider import EventStreamProvider
from vyraxis.solana.rpc import SolanaRpcClient
from vyraxis.storage.engine import Database


def database_check(database: Database, *, slow_ms: float = 250.0) -> Any:
    """Database reachability and latency."""

    async def check() -> ComponentHealth:
        latency = await database.ping()
        status = HealthStatus.DEGRADED if latency > slow_ms else HealthStatus.HEALTHY
        return ComponentHealth(
            name="database",
            status=status,
            latency_ms=latency,
            detail={"dsn": database.safe_dsn, "slow_threshold_ms": slow_ms},
        )

    return check


def rpc_check(client: SolanaRpcClient) -> Any:
    """RPC reachability via ``getHealth``.

    A node that answers anything other than ``ok`` is reported DEGRADED rather
    than healthy: "behind" is a real condition that changes what our data means.
    """

    async def check() -> ComponentHealth:
        result = await client.get_health()
        healthy = result == "ok"
        return ComponentHealth(
            name="solana_rpc",
            status=HealthStatus.HEALTHY if healthy else HealthStatus.DEGRADED,
            latency_ms=client.last_latency_ms,
            detail={"getHealth": result, **client.status().detail},
        )

    return check


def event_stream_check(stream: EventStreamProvider, *, clock: Clock = SYSTEM_CLOCK) -> Any:
    """WebSocket connection state and staleness."""

    async def check() -> ComponentHealth:
        status = stream.status()
        if status.state is ConnectionState.SUBSCRIBED and status.healthy:
            health = HealthStatus.HEALTHY
        elif status.state in {
            ConnectionState.CONNECTING,
            ConnectionState.CONNECTED,
            ConnectionState.RECONNECTING,
        }:
            health = HealthStatus.DEGRADED
        else:
            health = HealthStatus.UNHEALTHY
        return ComponentHealth(
            name="solana_event_stream",
            status=health,
            detail={"state": status.state.value, **status.detail},
        )

    return check


def pipeline_check(pipeline: IngestionPipeline, *, queue_warn_ratio: float = 0.8) -> Any:
    """Ingestion throughput, queue pressure and loss.

    Any dropped or lost event makes the pipeline DEGRADED. Loss must be visible
    on the health endpoint, not only in a log line nobody is reading.
    """

    async def check() -> ComponentHealth:
        snapshot = pipeline.snapshot()
        depth = snapshot["queue_depth"]
        capacity = max(1, snapshot["queue_capacity"])
        stats = snapshot["pipeline"]
        sink = snapshot["sink"]

        lost = stats["events_dropped"] + sink["events_lost"]
        if lost:
            status = HealthStatus.DEGRADED
        elif depth / capacity >= queue_warn_ratio:
            status = HealthStatus.DEGRADED
        else:
            status = HealthStatus.HEALTHY

        return ComponentHealth(
            name="ingestion_pipeline",
            status=status,
            detail={
                "queue_depth": depth,
                "queue_fill_ratio": round(depth / capacity, 4),
                "events_lost": lost,
                **stats,
                "sink": sink,
            },
        )

    return check
