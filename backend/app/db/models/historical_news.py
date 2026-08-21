from datetime import datetime

from sqlalchemy import Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class HistoricalNewsArticle(Base):
    """News with a genuine original publication timestamp, for point-in-
    time sentiment features. Only ever populated from a provider that
    actually reports a real historical `published_at` — never inferred,
    never backfilled by copying today's headlines onto past dates. Empty
    for a ticker/period means exactly that: no historical news feature is
    available there yet, which services/research/features.py must report
    as `unavailable`, not silently impute as neutral (0.5).

    Backfilled slowly by the low-priority checkpointed worker
    (services/research/lowpri_backfill.py) from Alpha Vantage
    NEWS_SENTIMENT, sharing the same starved 25/request-day global quota
    as CorporateAction — see that model's docstring.
    """

    __tablename__ = "historical_news_articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    headline: Mapped[str] = mapped_column(String(512))
    url: Mapped[str] = mapped_column(String(1024))
    published_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # -1..1, vendor-reported
    source: Mapped[str] = mapped_column(String(64))
    data_source: Mapped[str] = mapped_column(String(32), default="alphavantage")

    ingested_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("ticker_symbol", "url", name="ux_historical_news_identity"),
    )
