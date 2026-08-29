"""Time source abstraction.

Every timestamp in VYRAXIS is timezone-aware UTC. Wall-clock reads go through a
``Clock`` so that tests are deterministic and so that "when did we know this?"
is always an injected, auditable value rather than an ambient global.

Two distinct notions of time exist in this system and must never be conflated:

``block_time``
    Chain-reported time of a slot. May be absent, may be non-monotonic across
    providers, and is *not* the time VYRAXIS learned about the event.

``observed_at``
    The instant VYRAXIS received the data. This is the only clock that may be
    used to decide what information was available at decision time.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Protocol, runtime_checkable


@runtime_checkable
class Clock(Protocol):
    """Source of the current instant, always tz-aware UTC."""

    def now(self) -> datetime: ...


class SystemClock:
    """Production clock backed by the operating system."""

    __slots__ = ()

    def now(self) -> datetime:
        return datetime.now(UTC)


class ManualClock:
    """Deterministic clock for tests and replay.

    Never used in production code paths; construction is explicit so it cannot
    be selected accidentally.
    """

    __slots__ = ("_now",)

    def __init__(self, start: datetime) -> None:
        self._now = ensure_utc(start)

    def now(self) -> datetime:
        return self._now

    def advance(self, seconds: float) -> datetime:
        self._now = self._now + timedelta(seconds=seconds)
        return self._now

    def set(self, moment: datetime) -> None:
        self._now = ensure_utc(moment)


def ensure_utc(value: datetime) -> datetime:
    """Return ``value`` as tz-aware UTC, rejecting naive datetimes.

    Naive datetimes are rejected rather than assumed-UTC: silently attaching a
    timezone is how look-ahead bugs and off-by-hours P&L errors are born.
    """
    if value.tzinfo is None:
        raise ValueError("naive datetime rejected; all VYRAXIS timestamps must be tz-aware UTC")
    return value.astimezone(UTC)


def from_unix_seconds(seconds: int | float) -> datetime:
    """Convert a chain/provider unix timestamp to tz-aware UTC."""
    return datetime.fromtimestamp(seconds, tz=UTC)


SYSTEM_CLOCK: SystemClock = SystemClock()
