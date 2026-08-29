"""Health registry.

A component registers a check; the registry runs them all and aggregates. Two
rules keep the result trustworthy:

* **A check that raises is UNHEALTHY**, never "unknown but probably fine". An
  exception inside a health check is itself a health signal.
* **Aggregation takes the worst status**, so one unhealthy component cannot be
  averaged away by several healthy ones.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from vyraxis.core.clock import SYSTEM_CLOCK, Clock
from vyraxis.core.enums import HealthStatus
from vyraxis.core.logging import get_logger

log = get_logger(__name__)

_SEVERITY: dict[HealthStatus, int] = {
    HealthStatus.HEALTHY: 0,
    HealthStatus.UNKNOWN: 1,
    HealthStatus.DEGRADED: 2,
    HealthStatus.UNHEALTHY: 3,
}


@dataclass(frozen=True, slots=True)
class ComponentHealth:
    name: str
    status: HealthStatus
    detail: dict[str, Any] = field(default_factory=dict)
    latency_ms: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status.value,
            "latency_ms": round(self.latency_ms, 3) if self.latency_ms is not None else None,
            "detail": self.detail,
        }


@dataclass(frozen=True, slots=True)
class HealthReport:
    status: HealthStatus
    checked_at: str
    components: list[ComponentHealth]

    @property
    def ok(self) -> bool:
        return self.status is HealthStatus.HEALTHY

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "checked_at": self.checked_at,
            "components": [component.to_dict() for component in self.components],
        }


HealthCheck = Callable[[], Awaitable[ComponentHealth]]


class HealthRegistry:
    """Holds and runs the registered health checks."""

    def __init__(self, *, clock: Clock = SYSTEM_CLOCK, timeout_seconds: float = 5.0) -> None:
        self._checks: dict[str, HealthCheck] = {}
        self._clock = clock
        self._timeout = timeout_seconds

    def register(self, name: str, check: HealthCheck) -> None:
        if name in self._checks:
            raise ValueError(f"health check already registered: {name}")
        self._checks[name] = check

    def names(self) -> list[str]:
        return sorted(self._checks)

    async def run(self) -> HealthReport:
        results = await asyncio.gather(
            *(self._run_one(name, check) for name, check in self._checks.items())
        )
        components = sorted(results, key=lambda c: c.name)
        overall = (
            max((c.status for c in components), key=lambda s: _SEVERITY[s])
            if components
            else HealthStatus.UNKNOWN
        )
        return HealthReport(
            status=overall,
            checked_at=self._clock.now().isoformat(),
            components=components,
        )

    async def _run_one(self, name: str, check: HealthCheck) -> ComponentHealth:
        started = time.perf_counter()
        try:
            result = await asyncio.wait_for(check(), timeout=self._timeout)
        except TimeoutError:
            elapsed = (time.perf_counter() - started) * 1000.0
            log.warning("health_check_timeout", component=name, timeout_seconds=self._timeout)
            return ComponentHealth(
                name=name,
                status=HealthStatus.UNHEALTHY,
                detail={"error": "health check timed out", "timeout_seconds": self._timeout},
                latency_ms=elapsed,
            )
        except Exception as exc:
            elapsed = (time.perf_counter() - started) * 1000.0
            log.warning("health_check_failed", component=name, error=str(exc))
            return ComponentHealth(
                name=name,
                status=HealthStatus.UNHEALTHY,
                detail={"error": f"{type(exc).__name__}: {exc}"},
                latency_ms=elapsed,
            )
        elapsed = (time.perf_counter() - started) * 1000.0
        return ComponentHealth(
            name=result.name,
            status=result.status,
            detail=result.detail,
            latency_ms=result.latency_ms if result.latency_ms is not None else elapsed,
        )
