"""UTCDateTime (db/types.py) — every DB-backed timestamp must round-trip
as timezone-aware UTC on SQLite (this app's local-dev/test backend, which
silently drops tzinfo even on a plain DateTime(timezone=True) column —
confirmed empirically) exactly as it already does on Postgres
(production). A naive round-trip here means the API serializes a
timestamp with no UTC suffix, which a browser's `new Date(...)`
misinterprets as its own local time instead of UTC — the opposite of
what timezone-aware display depends on.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.types import UTCDateTime, utcnow


class _Base(DeclarativeBase):
    pass


class _Row(_Base):
    __tablename__ = "utc_datetime_test_row"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


def _make_engine():
    from sqlalchemy import create_engine

    engine = create_engine("sqlite:///:memory:")
    _Base.metadata.create_all(engine)
    return engine


def test_aware_utc_value_round_trips_aware():
    from sqlalchemy.orm import sessionmaker

    engine = _make_engine()
    Session = sessionmaker(bind=engine)
    written = datetime(2026, 8, 18, 12, 0, 0, tzinfo=timezone.utc)
    with Session() as s:
        s.add(_Row(id=1, ts=written))
        s.commit()
    with Session() as s:
        row = s.get(_Row, 1)
        assert row.ts.tzinfo is not None
        assert row.ts == written
        assert row.ts.isoformat().endswith("+00:00")


def test_naive_value_is_assumed_utc_on_write_and_aware_on_read():
    from sqlalchemy.orm import sessionmaker

    engine = _make_engine()
    Session = sessionmaker(bind=engine)
    naive = datetime(2026, 8, 18, 12, 0, 0)  # no tzinfo
    with Session() as s:
        s.add(_Row(id=1, ts=naive))
        s.commit()
    with Session() as s:
        row = s.get(_Row, 1)
        assert row.ts.tzinfo is not None
        assert row.ts == naive.replace(tzinfo=timezone.utc)


def test_non_utc_aware_value_is_normalized_to_utc():
    from sqlalchemy.orm import sessionmaker

    engine = _make_engine()
    Session = sessionmaker(bind=engine)
    jerusalem_noon = datetime(2026, 8, 18, 12, 0, 0, tzinfo=timezone(timedelta(hours=3)))
    with Session() as s:
        s.add(_Row(id=1, ts=jerusalem_noon))
        s.commit()
    with Session() as s:
        row = s.get(_Row, 1)
        assert row.ts.utcoffset() == timedelta(0)
        assert row.ts == jerusalem_noon  # same instant, just normalized representation


def test_none_round_trips_none():
    from sqlalchemy.orm import sessionmaker

    engine = _make_engine()
    Session = sessionmaker(bind=engine)
    with Session() as s:
        s.add(_Row(id=1, ts=None))
        s.commit()
    with Session() as s:
        row = s.get(_Row, 1)
        assert row.ts is None


def test_utcnow_helper_returns_aware_datetime():
    now = utcnow()
    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(0)
