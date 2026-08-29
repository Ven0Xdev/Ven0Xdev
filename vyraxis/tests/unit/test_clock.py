"""Timezone discipline: naive datetimes are a bug, not a default."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest

from vyraxis.core.clock import ManualClock, SystemClock, ensure_utc, from_unix_seconds


def test_system_clock_is_timezone_aware_utc() -> None:
    now = SystemClock().now()
    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(0)


def test_naive_datetime_is_rejected() -> None:
    with pytest.raises(ValueError, match="naive datetime rejected"):
        ensure_utc(datetime(2026, 1, 1, 12, 0, 0))


def test_non_utc_is_converted_not_relabelled() -> None:
    eastern = timezone(timedelta(hours=-5))
    moment = datetime(2026, 1, 1, 7, 0, 0, tzinfo=eastern)
    assert ensure_utc(moment) == datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def test_manual_clock_advances_deterministically() -> None:
    clock = ManualClock(datetime(2026, 1, 1, tzinfo=UTC))
    assert clock.now() == datetime(2026, 1, 1, tzinfo=UTC)
    clock.advance(90)
    assert clock.now() == datetime(2026, 1, 1, 0, 1, 30, tzinfo=UTC)


def test_unix_seconds_conversion_is_utc() -> None:
    assert from_unix_seconds(0) == datetime(1970, 1, 1, tzinfo=UTC)
