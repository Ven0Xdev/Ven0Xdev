from datetime import datetime

from sqlalchemy import JSON, Boolean, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class NewsItem(Base):
    """One row per news ARTICLE (not per symbol) — `symbols` is the full
    list of tickers this story maps to, so a single multi-symbol story
    (Alpaca commonly tags one article with several related tickers) is one
    row, not N duplicates. `external_id` (the provider's own article id)
    is the dedup key — see services/news/ingest.py's persist_article(),
    which is the only writer of this table and always upserts by it,
    never inserts blindly.

    Populated by services/news/alpaca_news.py's REST backfill and WS
    stream (primary) — Alpha Vantage news stays a separate, low-frequency
    fallback/enrichment path (services/data_providers/alphavantage_provider.py's
    get_news) that does NOT write here, to avoid conflating two different
    honesty/freshness contracts in one table.
    """

    __tablename__ = "news_items"
    __table_args__ = (
        Index("ux_news_items_external_id", "provider", "external_id", unique=True),
        Index("ix_news_items_published", "published_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))  # "alpaca" | "alpha_vantage" | "mock"
    external_id: Mapped[str] = mapped_column(String(64))  # the provider's own article id — the dedup key
    source: Mapped[str] = mapped_column(String(64))  # e.g. "Benzinga" — the original publisher Alpaca proxies
    headline: Mapped[str] = mapped_column(String(512))
    summary: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    symbols: Mapped[list] = mapped_column(JSON, default=list)  # every ticker this story is mapped to

    published_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True, default=utcnow)  # provider-reported
    received_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)  # when Nexora ingested it
    update_count: Mapped[int] = mapped_column(Integer, default=0)  # how many "updated" events this story has had

    sentiment: Mapped[float] = mapped_column(Float, default=0.0)  # -1..1
    sentiment_label: Mapped[str] = mapped_column(String(16), default="uncertain")  # positive|neutral|negative|uncertain
    novelty: Mapped[float] = mapped_column(Float, default=1.0)  # 0..1 — distinct from recent same-symbol stories
    relevance: Mapped[float] = mapped_column(Float, default=0.5)  # 0..1
    reliability: Mapped[float] = mapped_column(Float, default=0.5)  # 0..1 — source-based, not per-article
    impact: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1 — estimated market impact
    category: Mapped[str | None] = mapped_column(String(24), nullable=True)  # earnings|guidance|analyst|merger|legal|regulatory|macro

    is_press_release: Mapped[bool] = mapped_column(Boolean, default=False)
    is_promotional: Mapped[bool] = mapped_column(Boolean, default=False)
