from datetime import datetime

from sqlalchemy import Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class BackfillCheckpoint(Base):
    """Resumability for every historical-data backfill job — the
    "durable, resumable historical-data pipeline" requirement. One row
    per (provider, dataset, symbol): `cursor` holds whatever that job
    needs to resume exactly where it left off (an ISO date, a page
    token, a fiscal quarter — job-specific, stored as text), `status`
    is `pending | in_progress | done | failed`, and `last_error` is the
    honest reason for the most recent failure (rate limit, no data,
    vendor error), never silently swallowed.

    The low-priority splits/news worker (services/research/
    lowpri_backfill.py) is the primary reason this exists: it can only
    make a handful of Alpha Vantage calls per day without starving the
    live NCS scheduler sharing the same 25/day quota, so a full 20-symbol
    backfill genuinely spans many real days — this table is what lets it
    stop and restart safely across every one of those days without
    re-fetching what it already has or losing its place.
    """

    __tablename__ = "backfill_checkpoints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))  # twelvedata | alpaca | alphavantage | edgar
    dataset: Mapped[str] = mapped_column(String(32))  # daily_bars | intraday_bars | fundamentals | splits | news
    ticker_symbol: Mapped[str] = mapped_column(String(16))
    cursor: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | in_progress | done | failed
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    rows_ingested: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("provider", "dataset", "ticker_symbol", name="ux_backfill_checkpoint_identity"),
    )
