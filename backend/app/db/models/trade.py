from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Trade(Base):
    """Immutable fill log — live/paper trade log, independent from backtest
    trades. `account_id`/`position_id` link a fill to the Paper Trading
    account/position it belongs to (services/paper_trading/engine.py);
    both nullable since this table predates that system and may in future
    log fills unrelated to a tracked paper position.
    """

    __tablename__ = "trades"
    __table_args__ = (
        Index("ix_trades_ticker_executed", "ticker_symbol", "executed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    side: Mapped[str] = mapped_column(String(8))  # buy, sell
    quantity: Mapped[float] = mapped_column(Float)
    price: Mapped[float] = mapped_column(Float)
    executed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    prediction_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="filled")
    account_id: Mapped[int | None] = mapped_column(ForeignKey("paper_trading_accounts.id"), nullable=True, index=True)
    position_id: Mapped[int | None] = mapped_column(ForeignKey("paper_positions.id"), nullable=True, index=True)
    data_source: Mapped[str] = mapped_column(String(32), default="unknown")
    data_mode: Mapped[str] = mapped_column(String(16), default="unspecified")
