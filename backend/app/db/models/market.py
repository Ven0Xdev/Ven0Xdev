from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Ticker(Base):
    __tablename__ = "tickers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    company_name: Mapped[str] = mapped_column(String(255))
    tier: Mapped[str] = mapped_column(String(32), default="Pink")  # Pink, PinkLimited, Expert, QX, QB
    exchange: Mapped[str] = mapped_column(String(32), default="OTC")
    sector: Mapped[str | None] = mapped_column(String(64), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(128), nullable=True)
    float_shares: Mapped[float | None] = mapped_column(Float, nullable=True)
    shares_outstanding: Mapped[float | None] = mapped_column(Float, nullable=True)
    market_cap: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    reverse_split_count_3y: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    bars: Mapped[list["OHLCVBar"]] = relationship(back_populates="ticker", cascade="all, delete-orphan")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Ticker {self.symbol}>"


class OHLCVBar(Base):
    """Time-series price bar. Converted to a TimescaleDB hypertable on `ts`."""

    __tablename__ = "ohlcv_bars"
    __table_args__ = (Index("ix_ohlcv_ticker_ts", "ticker_id", "ts"),)

    # Natural composite key (no surrogate id): the canonical TimescaleDB
    # hypertable layout, where the partition column (ts) must be part of
    # the primary key.
    ticker_id: Mapped[int] = mapped_column(ForeignKey("tickers.id"), primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, primary_key=True)
    timeframe: Mapped[str] = mapped_column(String(8), primary_key=True, default="1d")  # 1m, 5m, 1h, 1d
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)
    bid: Mapped[float | None] = mapped_column(Float, nullable=True)
    ask: Mapped[float | None] = mapped_column(Float, nullable=True)

    ticker: Mapped["Ticker"] = relationship(back_populates="bars")
