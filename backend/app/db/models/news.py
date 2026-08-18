from datetime import datetime

from sqlalchemy import Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class NewsItem(Base):
    __tablename__ = "news_items"
    __table_args__ = (
        # Hot path: latest news per ticker.
        Index("ix_news_ticker_published", "ticker_symbol", "published_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    published_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True, default=utcnow)
    source: Mapped[str] = mapped_column(String(64))
    headline: Mapped[str] = mapped_column(String(512))
    url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    sentiment: Mapped[float] = mapped_column(Float, default=0.0)  # -1..1
    is_press_release: Mapped[bool] = mapped_column(default=False)
    is_promotional: Mapped[bool] = mapped_column(default=False)
