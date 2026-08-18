"""Shared column types.

UTCDateTime exists to close a real gap: `Store and transmit all
timestamps internally as timezone-aware UTC ISO-8601 values` only holds
if a DateTime column round-trips as aware on every backend this app
actually runs on. Postgres (production, via TIMESTAMPTZ) does this
correctly with plain `DateTime(timezone=True)`. SQLite (local dev's
USE_SQLITE_FALLBACK and the entire test suite) does not — confirmed
empirically: SQLite's dialect silently drops tzinfo on read even when the
column is declared `DateTime(timezone=True)`, so a value written aware
comes back naive, and `.isoformat()` on that naive value serializes with
no UTC suffix at all — exactly the ambiguous-timestamp bug a browser
would then misinterpret as its own local time instead of UTC.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """A DateTime column that always round-trips as timezone-aware UTC,
    on every backend. Values are normalized to UTC on the way in (an
    aware-but-non-UTC value is converted, a naive value is assumed to
    already mean UTC — this codebase's own convention everywhere) and
    reattached with UTC tzinfo on the way out if the DB layer stripped it.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def utcnow() -> datetime:
    """Timezone-aware `default=`/`onupdate=` callable — the aware
    replacement for the naive `datetime.utcnow` this codebase used to
    default every timestamp column to. Aware from the moment the object
    is constructed in Python, not only after a round-trip through
    UTCDateTime's DB-level normalization — matters for any code path that
    reads a just-created object's attribute before a commit+refresh.
    """
    return datetime.now(timezone.utc)
