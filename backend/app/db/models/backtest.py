from datetime import datetime

from sqlalchemy import JSON, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class BacktestResult(Base):
    __tablename__ = "backtest_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    strategy_config: Mapped[dict] = mapped_column(JSON, default=dict)
    start_date: Mapped[datetime] = mapped_column(UTCDateTime)
    end_date: Mapped[datetime] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    sharpe_ratio: Mapped[float] = mapped_column(Float)
    sortino_ratio: Mapped[float] = mapped_column(Float)
    max_drawdown_pct: Mapped[float] = mapped_column(Float)
    profit_factor: Mapped[float] = mapped_column(Float)
    expectancy: Mapped[float] = mapped_column(Float)
    win_rate: Mapped[float] = mapped_column(Float)
    avg_hold_time_days: Mapped[float] = mapped_column(Float)
    total_return_pct: Mapped[float] = mapped_column(Float)
    num_trades: Mapped[int] = mapped_column(Integer)

    trades: Mapped[list["BacktestTrade"]] = relationship(back_populates="result", cascade="all, delete-orphan")


class BacktestTrade(Base):
    __tablename__ = "backtest_trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    result_id: Mapped[int] = mapped_column(ForeignKey("backtest_results.id"), index=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16))
    entry_ts: Mapped[datetime] = mapped_column(UTCDateTime)
    exit_ts: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    entry_price: Mapped[float] = mapped_column(Float)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity: Mapped[float] = mapped_column(Float)
    pnl_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    exit_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)  # tp1, tp2, tp3, stop, halt, timeout

    result: Mapped["BacktestResult"] = relationship(back_populates="trades")
