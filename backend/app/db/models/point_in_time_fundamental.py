from datetime import datetime

from sqlalchemy import Float, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class PointInTimeFundamental(Base):
    """One XBRL fact as SEC EDGAR actually reported it, keyed by the
    filing's own `filed` date — not `period_end` — so a feature computed
    at timestamp T can correctly restrict itself to
    `filed_date <= T` (services/research/features.py). Using period_end
    instead would be lookahead: the market did not know a fiscal quarter's
    numbers on the quarter's own last day, only once the filing was
    actually submitted, often 40-45+ days later.

    Distinct from `EdgarCompanyFacts` (edgar.py), which stores only the
    latest computed dilution figure for the live platform's fundamental-
    score feature — that table is untouched by this work. This table is
    a genuine time series, one row per (ticker, concept, period_end,
    filed_date) tuple, existing solely to make the research pipeline's
    fundamentals feature honestly point-in-time.
    """

    __tablename__ = "point_in_time_fundamentals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    taxonomy: Mapped[str] = mapped_column(String(16))  # us-gaap | dei
    concept: Mapped[str] = mapped_column(String(64))  # e.g. Revenues, NetIncomeLoss, Assets
    unit: Mapped[str] = mapped_column(String(16))  # USD | shares | USD-per-shares

    period_start: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    period_end: Mapped[datetime] = mapped_column(UTCDateTime)
    filed_date: Mapped[datetime] = mapped_column(UTCDateTime)  # the point-in-time key
    form: Mapped[str | None] = mapped_column(String(16), nullable=True)  # 10-K | 10-Q | ...

    value: Mapped[float] = mapped_column(Float)

    ingested_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint(
            "ticker_symbol", "concept", "period_end", "filed_date", name="ux_pit_fundamentals_identity"
        ),
        Index("ix_pit_fundamentals_symbol_concept_filed", "ticker_symbol", "concept", "filed_date"),
    )
