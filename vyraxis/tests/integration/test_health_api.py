"""Health registry and the HTTP surface."""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from conftest import requires_database
from vyraxis.core.enums import HealthStatus
from vyraxis.observability import checks
from vyraxis.observability.health import ComponentHealth, HealthRegistry
from vyraxis.storage.engine import Database

pytestmark = [pytest.mark.integration, requires_database]


async def healthy(name: str = "widget") -> ComponentHealth:
    return ComponentHealth(name=name, status=HealthStatus.HEALTHY)


async def test_registry_aggregates_to_the_worst_status() -> None:
    registry = HealthRegistry()
    registry.register("good", lambda: healthy("good"))

    async def degraded() -> ComponentHealth:
        return ComponentHealth(name="slow", status=HealthStatus.DEGRADED)

    registry.register("slow", degraded)
    report = await registry.run()
    assert report.status is HealthStatus.DEGRADED
    assert not report.ok
    assert [c.name for c in report.components] == ["good", "slow"]


async def test_a_raising_check_is_unhealthy_not_unknown() -> None:
    """An exception inside a health check is itself a health signal."""
    registry = HealthRegistry()

    async def broken() -> ComponentHealth:
        raise RuntimeError("dependency exploded")

    registry.register("broken", broken)
    report = await registry.run()
    assert report.status is HealthStatus.UNHEALTHY
    assert "dependency exploded" in report.components[0].detail["error"]


async def test_a_hanging_check_times_out_as_unhealthy() -> None:
    registry = HealthRegistry(timeout_seconds=0.1)

    async def hangs() -> ComponentHealth:
        await asyncio.sleep(10)
        raise AssertionError("unreachable")

    registry.register("hangs", hangs)
    report = await registry.run()
    assert report.status is HealthStatus.UNHEALTHY
    assert "timed out" in report.components[0].detail["error"]


async def test_duplicate_registration_is_rejected() -> None:
    registry = HealthRegistry()
    registry.register("x", healthy)
    with pytest.raises(ValueError, match="already registered"):
        registry.register("x", healthy)


async def test_database_check_reports_latency(database: Database) -> None:
    report = await checks.database_check(database)()
    assert report.status is HealthStatus.HEALTHY
    assert report.latency_ms is not None and report.latency_ms >= 0
    # The DSN in the health payload must never carry a password.
    assert "***" in report.detail["dsn"] or "@" not in report.detail["dsn"]


async def test_database_check_reports_unreachable_database(settings) -> None:
    broken = settings.database.model_copy(
        update={"url": settings.database.url.__class__("postgresql+asyncpg://x@127.0.0.1:1/none")}
    )
    db = Database(broken)
    registry = HealthRegistry(timeout_seconds=3.0)
    registry.register("database", checks.database_check(db))
    report = await registry.run()
    assert report.status is HealthStatus.UNHEALTHY
    await db.dispose()


def test_health_endpoints_expose_component_detail(settings, database: Database) -> None:
    """The `database` fixture is required only to guarantee a migrated schema."""
    from vyraxis.api.server import create_app
    from vyraxis.app import VyraxisApp

    # The app builds its own Database against the same DSN. The engine must not
    # be shared with the `database` fixture: TestClient drives its own event
    # loop, and an asyncpg pool bound to another loop cannot be used from it.
    app = VyraxisApp.build(settings, configure_logs=False)
    app.health = HealthRegistry()
    app.health.register("database", checks.database_check(app.database))
    app.health.register("ingestion_pipeline", checks.pipeline_check(app.pipeline))

    with TestClient(create_app(app)) as client:
        live = client.get("/health/live")
        assert live.status_code == 200
        assert live.json()["status"] == "alive"

        health = client.get("/health")
        assert health.status_code == 200
        body = health.json()
        assert body["status"] in {"HEALTHY", "DEGRADED"}
        assert {c["name"] for c in body["components"]} == {"database", "ingestion_pipeline"}

        status = client.get("/status")
        assert status.status_code == 200
        payload = status.json()
        # The API must state plainly that live trading is off.
        assert payload["live_trading_enabled"] is False
        assert "queue_depth" in payload
        assert "dedup" in payload
        assert payload["subscriptions"]


def test_ready_returns_503_when_a_dependency_is_down(settings, database: Database) -> None:
    from vyraxis.api.server import create_app
    from vyraxis.app import VyraxisApp

    app = VyraxisApp.build(settings, configure_logs=False)
    app.health = HealthRegistry()

    async def broken() -> ComponentHealth:
        raise RuntimeError("down")

    app.health.register("thing", broken)

    with TestClient(create_app(app)) as client:
        response = client.get("/health/ready")
        assert response.status_code == 503
        assert response.json()["status"] == "UNHEALTHY"


async def test_pipeline_check_flags_event_loss(settings, database: Database) -> None:
    from vyraxis.app import VyraxisApp

    app = VyraxisApp.build(settings, configure_logs=False)
    app.pipeline.stats.events_dropped = 3
    report = await checks.pipeline_check(app.pipeline)()
    # Loss must be visible on the health endpoint, not only in a log line.
    assert report.status is HealthStatus.DEGRADED
    assert report.detail["events_lost"] == 3
    await app.shutdown()
