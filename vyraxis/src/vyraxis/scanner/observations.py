"""Timestamped observation creation.

When a token is first seen, VYRAXIS writes an immutable DISCOVERY observation
and schedules PENDING horizon rows relative to it. Horizon rows are created
*empty*, carrying only the instant at which they may be filled.

This is the structural defence against look-ahead bias. A horizon row cannot be
populated from data that existed at discovery time, because at discovery time
the row has no payload and its ``due_at`` is in the future. Outcome labels built
in Phase 4 read these rows and therefore inherit the property.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from vyraxis.core.enums import ObservationStatus
from vyraxis.core.errors import IntegrityError
from vyraxis.core.logging import get_logger
from vyraxis.storage import repositories
from vyraxis.storage.models import Observation

log = get_logger(__name__)


@dataclass
class ObservationStats:
    discoveries: int = 0
    horizons_scheduled: int = 0
    captures: int = 0
    missed: int = 0


class ObservationScheduler:
    """Creates discovery observations and their future horizon rows."""

    def __init__(self, horizons_seconds: list[int]) -> None:
        if not horizons_seconds:
            raise ValueError("at least one horizon is required")
        self._horizons = sorted(horizons_seconds)
        self.stats = ObservationStats()

    @property
    def horizons(self) -> list[int]:
        return list(self._horizons)

    async def record_discovery(
        self,
        session: AsyncSession,
        *,
        token_mint: str,
        observed_at: datetime,
        source: str,
        pool_address: str | None = None,
        slot: int | None = None,
        payload: dict[str, Any] | None = None,
    ) -> Observation:
        anchor = await repositories.create_discovery_observation(
            session,
            token_mint=token_mint,
            observed_at=observed_at,
            source=source,
            pool_address=pool_address,
            slot=slot,
            payload=payload,
        )
        scheduled = await repositories.schedule_horizon_observations(
            session, anchor=anchor, horizons_seconds=self._horizons
        )
        self.stats.discoveries += 1
        self.stats.horizons_scheduled += scheduled
        log.info(
            "observation_discovery",
            token_mint=token_mint,
            horizons_scheduled=scheduled,
            observed_at=observed_at.isoformat(),
        )
        return anchor

    async def capture_due(
        self,
        session: AsyncSession,
        *,
        now: datetime,
        capture: Any,
        limit: int = 100,
    ) -> int:
        """Fill observations whose due time has passed.

        ``capture`` is an async callable ``(Observation) -> dict | None``
        returning the measurements for that instant. Refusing to fill early is
        enforced here rather than trusted to callers: an observation captured
        before ``due_at`` would embed the future in a past feature vector.
        """
        due = await repositories.due_observations(session, now=now, limit=limit)
        filled = 0
        for observation in due:
            if now < observation.due_at:
                raise IntegrityError(
                    "refusing to capture an observation before it is due",
                    observation_id=observation.id,
                    due_at=observation.due_at.isoformat(),
                    now=now.isoformat(),
                )
            try:
                payload = await capture(observation)
            except Exception as exc:
                observation.status = ObservationStatus.FAILED
                observation.failure_reason = f"{type(exc).__name__}: {exc}"[:200]
                log.warning(
                    "observation_capture_failed",
                    observation_id=observation.id,
                    error=str(exc),
                )
                continue

            if payload is None:
                observation.status = ObservationStatus.MISSED
                observation.failure_reason = "no data available at due time"
                self.stats.missed += 1
                continue

            observation.payload = payload
            observation.captured_at = now
            observation.status = ObservationStatus.CAPTURED
            filled += 1
            self.stats.captures += 1

        return filled
