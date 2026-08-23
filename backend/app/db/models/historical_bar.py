from datetime import datetime

from sqlalchemy import Float, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class HistoricalBar(Base):
    """Durable, multi-year OHLCV store for the research pipeline —
    genuinely new: the rest of this platform (candles/NCS/paper trading)
    only ever fetches-and-caches short-TTL live data, never persists
    multi-year history (confirmed absent anywhere else in this schema
    before this table). Never read by the live NCS/scoring/paper-trading
    path — those keep using the existing provider fetch-and-cache layer
    unchanged; this table exists solely for point-in-time historical
    research/backtesting.

    `adjusted` records whether `close`/`open`/`high`/`low` are split-
    adjusted (always True for what this pipeline actually stores — see
    services/research/backfill.py, which only ever requests adjusted
    series precisely so corporate actions can never distort a return) —
    kept as an explicit column rather than an assumption so a report can
    say so plainly instead of asserting it.

    `session` labels whether the bar is regular-hours, pre-market or
    after-hours — intraday (30m/60m) bars only; always "regular" for
    daily bars. `feed` records the vendor's own feed tier (e.g. Alpaca's
    "iex" vs the paid "sip") so coverage can be reported honestly as
    partial, never silently presented as full consolidated-tape data.
    """

    __tablename__ = "historical_bars"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    timeframe: Mapped[str] = mapped_column(String(8))  # 30m | 60m | 1d
    ts: Mapped[datetime] = mapped_column(UTCDateTime)  # bar OPEN time, UTC

    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)

    adjusted: Mapped[bool] = mapped_column(default=True)
    session: Mapped[str] = mapped_column(String(16), default="regular")  # regular | pre | post
    data_source: Mapped[str] = mapped_column(String(32))  # twelvedata | alpaca
    feed: Mapped[str] = mapped_column(String(16), default="unspecified")  # iex | sip | unspecified

    ingested_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("ticker_symbol", "timeframe", "ts", name="ux_historical_bars_symbol_tf_ts"),
        Index("ix_historical_bars_symbol_tf_ts", "ticker_symbol", "timeframe", "ts"),
    )
