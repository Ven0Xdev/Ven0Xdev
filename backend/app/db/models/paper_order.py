from datetime import datetime

from sqlalchemy import Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow

# Honest lifecycle — every PaperOrder ends in exactly one of these, and the
# audit trail (see services/paper_trading/orders.py) records why.
STATUSES = (
    "pending", "accepted", "partially_filled", "filled",
    "cancelled", "rejected", "expired", "triggered",
)
ORDER_TYPES = ("market", "limit", "stop", "take_profit", "stop_loss")
SIDES = ("buy", "sell")


class PaperOrder(Base):
    """One order-lifecycle record — NEXORA INTERNAL PAPER only, never a
    real broker order. Market orders resolve synchronously (filled or
    rejected within the same request, via services/paper_trading/engine.py's
    existing open_position()/close_position() — this table wraps that
    engine for audit/idempotency, it does not replace it). Limit, stop,
    take_profit, and stop_loss orders are created `pending` and only ever
    filled by app/workers/order_scheduler.py checking them against a
    future eligible quote — never backfilled/guessed, never filled at
    submission time.

    take_profit/stop_loss children share `oco_group_id`: the scheduler
    cancels the sibling the instant either one fills (a real OCO bracket,
    not two independent orders that could both fire).
    """

    __tablename__ = "paper_orders"
    __table_args__ = (
        Index("ux_paper_orders_account_idempotency", "account_id", "idempotency_key", unique=True),
        Index("ix_paper_orders_account_status", "account_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("paper_trading_accounts.id"), index=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    side: Mapped[str] = mapped_column(String(8))  # buy | sell
    order_type: Mapped[str] = mapped_column(String(16))  # market | limit | stop | take_profit | stop_loss
    quantity: Mapped[float] = mapped_column(Float)
    limit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    stop_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Requested bracket, carried on the ENTRY order (market/limit buy)
    # until it actually fills — a resting limit/stop entry has no
    # position to attach a bracket to yet. order_scheduler.py spawns the
    # real take_profit/stop_loss child PaperOrders (see oco_group_id)
    # the moment this entry fills, using these values.
    bracket_take_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    bracket_stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    # Day orders only right now (no real multi-day GTC bookkeeping exists
    # yet — see order_scheduler.py's own expiry sweep) — honestly reported,
    # never silently treated as GTC.
    regular_hours_only: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    filled_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    filled_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    rejected_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    cancelled_reason: Mapped[str | None] = mapped_column(String, nullable=True)

    # Client-supplied, unique per account — a retried/double-clicked
    # submission with the same key is answered with the original order,
    # never a second one. See ux_paper_orders_account_idempotency above.
    idempotency_key: Mapped[str] = mapped_column(String(64))

    # "manual" (a user submitted this from the order ticket) | "autonomous"
    # — same vocabulary as PaperPosition.opened_by. Emergency Stop
    # (platform_settings.autonomous_trading_paused) only ever blocks
    # origin="autonomous"; manual orders are gated by Safe Mode only —
    # the same distinction services/paper_trading/autonomous.py's own
    # module docstring already draws.
    origin: Mapped[str] = mapped_column(String(16), default="manual")

    # Set once a BUY order fills (the position it opened) or on a SELL/
    # take_profit/stop_loss order at creation time (the position it will
    # close) — always known up front for exits, since NEXORA is long-only
    # and a sell can only ever target one specific existing position.
    position_id: Mapped[int | None] = mapped_column(ForeignKey("paper_positions.id"), nullable=True, index=True)
    # Links a take_profit/stop_loss bracket pair — see class docstring.
    oco_group_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    ncs_signal_id: Mapped[int | None] = mapped_column(ForeignKey("ncs_signals.id"), nullable=True)

    data_source: Mapped[str] = mapped_column(String(32), default="unknown")
    data_mode: Mapped[str] = mapped_column(String(16), default="unspecified")
