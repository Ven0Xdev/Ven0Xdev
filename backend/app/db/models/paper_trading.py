from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class PaperTradingAccount(Base):
    """One virtual cash account per user — the platform's only trading
    execution mode (no real-money broker integration exists or is
    planned). Cash-only, no margin: every open position debits this
    balance by its fill cost, every close credits it back.
    """

    __tablename__ = "paper_trading_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    cash_balance: Mapped[float] = mapped_column(Float)
    starting_balance: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class PaperPosition(Base):
    """A simulated long position, opened only when the setup clears the
    same deterministic risk gate (services/risk/engine.py's evaluate_risk)
    the scanner and Signal Engine already enforce. `planned_stop_loss`/
    `planned_take_profit` and the entry-time confidence/reward:risk are
    captured for provenance and for a future automatic outcome-evaluation
    job (Phase 7) — this version only closes on an explicit user action.
    """

    __tablename__ = "paper_positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("paper_trading_accounts.id"), index=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    quantity: Mapped[float] = mapped_column(Float)
    avg_entry_price: Mapped[float] = mapped_column(Float)
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open, closed
    realized_pnl_dollars: Mapped[float | None] = mapped_column(Float, nullable=True)
    entry_confidence_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    entry_risk_reward: Mapped[float | None] = mapped_column(Float, nullable=True)
    planned_stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    planned_take_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_policy_version: Mapped[str] = mapped_column(String(48), default="unversioned")
    entry_data_source: Mapped[str] = mapped_column(String(32), default="unknown")
    entry_data_mode: Mapped[str] = mapped_column(String(16), default="unspecified")
