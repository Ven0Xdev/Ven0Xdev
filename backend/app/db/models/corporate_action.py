from datetime import datetime

from sqlalchemy import Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class CorporateAction(Base):
    """Split/dividend calendar, sourced from Alpha Vantage SPLITS —
    cross-check/provenance metadata only. `HistoricalBar` rows are always
    requested pre-adjusted from the vendor, so this table is never
    required for return correctness; it exists so the data-quality report
    can positively confirm "this gap in the price series corresponds to a
    known split," never leaving an unexplained jump.

    Backfilled slowly and deliberately by the low-priority checkpointed
    worker (services/research/lowpri_backfill.py) — Alpha Vantage SPLITS
    shares the platform's single 25-request/day global quota with the
    live NCS scheduler, so this table fills in over days, not minutes.
    """

    __tablename__ = "corporate_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    action_type: Mapped[str] = mapped_column(String(16))  # split | dividend
    ex_date: Mapped[datetime] = mapped_column(UTCDateTime)
    ratio: Mapped[float | None] = mapped_column(Float, nullable=True)  # split: to/from, e.g. 4.0 for 4-for-1
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)  # dividend: cash amount per share
    data_source: Mapped[str] = mapped_column(String(32), default="alphavantage")

    ingested_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("ticker_symbol", "action_type", "ex_date", name="ux_corporate_actions_identity"),
    )
