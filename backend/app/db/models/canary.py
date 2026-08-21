from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow

STARTING_CANARY_BALANCE = 10_000.0


class CanaryAccount(Base):
    """Singleton simulated ledger for the Research Canary track — same
    pattern as PlatformSetting (id is always 1). Deliberately its OWN
    ledger, never PaperTradingAccount: "Keep Canary records separate from
    manual Paper trades, historical backtests and production Shadow
    observations" is a non-negotiable rule this session was given, and
    the cleanest way to guarantee zero contamination is a wholly separate
    table, not a shared one with an `origin` flag that a future bug could
    misfilter.

    `enabled` is the operator's manual opt-in (Phase 6: "may operate only
    when the operator manually opts in") — false by default, and setting
    it true does NOT itself start trading; the platform-wide Emergency
    Stop (PlatformSetting.autonomous_trading_paused) must ALSO be
    resumed. Both gates are checked independently at decision time.
    """

    __tablename__ = "canary_account"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    cash_balance: Mapped[float] = mapped_column(Float, default=STARTING_CANARY_BALANCE)
    starting_balance: Mapped[float] = mapped_column(Float, default=STARTING_CANARY_BALANCE)
    peak_equity: Mapped[float] = mapped_column(Float, default=STARTING_CANARY_BALANCE)

    # Automatic-pause state (Phase 6: "Automatic Canary pause at 2%
    # peak-to-trough drawdown") — distinct from the platform Emergency
    # Stop: an operator can resume Emergency Stop generally while THIS
    # stays paused until a human clears it, and vice versa.
    auto_paused: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_pause_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    positions_opened_today: Mapped[int] = mapped_column(Integer, default=0)
    positions_opened_today_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD (exchange tz)
    realized_pnl_today_dollars: Mapped[float] = mapped_column(Float, default=0.0)
    realized_pnl_today_date: Mapped[str | None] = mapped_column(String(10), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class CanaryPosition(Base):
    """A Research Canary paper position — INTERNAL simulation only, never
    a real broker position. Long-only (this platform has no short-selling
    support anywhere); a mandatory stop-loss is enforced at open (Phase 6:
    "Mandatory stop-loss") — `stop_loss` is NOT nullable, unlike
    PaperPosition.planned_stop_loss.
    """

    __tablename__ = "canary_positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    research_model_id: Mapped[int] = mapped_column(ForeignKey("research_models.id"))
    canary_decision_id: Mapped[int | None] = mapped_column(ForeignKey("canary_decisions.id"), nullable=True)

    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    horizon: Mapped[str] = mapped_column(String(16))
    quantity: Mapped[float] = mapped_column(Float)
    avg_entry_price: Mapped[float] = mapped_column(Float)
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    stop_loss: Mapped[float] = mapped_column(Float)  # mandatory — never null
    take_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_holding_until: Mapped[datetime] = mapped_column(UTCDateTime)  # horizon's own max holding period
    risk_dollars_at_entry: Mapped[float] = mapped_column(Float)  # <= 0.25% of equity at entry, enforced by the engine

    status: Mapped[str] = mapped_column(String(16), default="open")  # open | closed
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    exit_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    exit_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)  # stop_loss | take_profit | max_holding | canary_paused
    realized_pnl_dollars: Mapped[float | None] = mapped_column(Float, nullable=True)

    data_source: Mapped[str] = mapped_column(String(32))
    data_mode: Mapped[str] = mapped_column(String(16))


class CanaryOrder(Base):
    """Order-ticket-shaped record for a Canary entry — kept for the same
    audit-trail discipline PaperOrder gives manual/autonomous paper
    trading, in a wholly separate table. `idempotency_key` prevents a
    scheduler retry from ever opening a duplicate Canary position."""

    __tablename__ = "canary_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    research_model_id: Mapped[int] = mapped_column(ForeignKey("research_models.id"))
    canary_decision_id: Mapped[int | None] = mapped_column(ForeignKey("canary_decisions.id"), nullable=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)

    quantity: Mapped[float] = mapped_column(Float)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | filled | rejected
    rejected_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    filled_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    canary_position_id: Mapped[int | None] = mapped_column(ForeignKey("canary_positions.id"), nullable=True)
