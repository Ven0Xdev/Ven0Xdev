"""Health and status HTTP API.

Deliberately read-only. There is no endpoint that starts trading, moves funds
or mutates state, because no such capability exists in this codebase yet.

``/health/live`` answers "is the process running" and ``/health/ready`` answers
"are its dependencies usable" - they are separate because a process that is
alive but cannot reach PostgreSQL must not be sent traffic while also not being
restarted in a loop.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Response

from vyraxis.app import VyraxisApp
from vyraxis.core.enums import HealthStatus

_STATUS_CODES: dict[HealthStatus, int] = {
    HealthStatus.HEALTHY: 200,
    HealthStatus.DEGRADED: 200,
    HealthStatus.UNKNOWN: 503,
    HealthStatus.UNHEALTHY: 503,
}


def create_app(app: VyraxisApp) -> FastAPI:
    """Build the FastAPI application around an already-wired VyraxisApp."""

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await app.shutdown()

    api = FastAPI(
        title="VYRAXIS",
        version=app.status()["version"],
        summary="Solana memecoin research platform - health and status",
        lifespan=lifespan,
    )

    @api.get("/health/live")
    async def live() -> dict[str, Any]:
        """Liveness: the process is up and serving. No dependencies consulted."""
        return {"status": "alive", "service": app.settings.app.service_name}

    @api.get("/health/ready")
    async def ready(response: Response) -> dict[str, Any]:
        """Readiness: every registered dependency check must be usable."""
        report = await app.check_health()
        response.status_code = _STATUS_CODES[report.status]
        return report.to_dict()

    @api.get("/health")
    async def health(response: Response) -> dict[str, Any]:
        report = await app.check_health()
        response.status_code = _STATUS_CODES[report.status]
        return report.to_dict()

    @api.get("/status")
    async def status() -> dict[str, Any]:
        """Ingestion counters, queue depth, dedup and connection state."""
        return app.status()

    return api
