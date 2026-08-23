from datetime import datetime

from sqlalchemy import Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class ShadowPosition(Base):
    """Passive, hypothetical tracking of what a fired NCS signal *would*
    have returned, using only real closed-bar prices — never the paper
    trading engine, never labeled "NEXORA INTERNAL PAPER" (that label is
    reserved for the platform's one real execution simulator, see
    services/paper_trading/engine.py). This is signal-quality analytics:
    "if you had followed this signal, here's what actually happened,"
    nothing more — it never places, opens, or touches any account,
    balance, or position a user actually owns.

    One row per fired NcsSignal (services/shadow/engine.py's
    on_ncs_fired() opens exactly one, never more, per fired row) — an
    unfired/unconfirmed/vetoed NCS row never gets a shadow position.
    """

    __tablename__ = "shadow_positions"
    __table_args__ = (
        Index("ix_shadow_positions_ticker_tf_status", "ticker_symbol", "timeframe", "status"),
        Index("ux_shadow_positions_ncs_signal", "ncs_signal_id", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    ncs_signal_id: Mapped[int] = mapped_column(ForeignKey("ncs_signals.id"))
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    timeframe: Mapped[str] = mapped_column(String(8))
    direction: Mapped[str] = mapped_column(String(8))  # LONG | SHORT

    entry_bar_ts: Mapped[datetime] = mapped_column(UTCDateTime)
    entry_price: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    status: Mapped[str] = mapped_column(String(8), default="OPEN", index=True)  # OPEN | CLOSED
    holding_bars_elapsed: Mapped[int] = mapped_column(Integer, default=0)
    # Best/worst unrealized return seen while open — signed the same way
    # as pnl_pct (positive = favorable to `direction`), tracked every bar
    # this position is marked, not just at close.
    mfe_pct: Mapped[float] = mapped_column(Float, default=0.0)
    mae_pct: Mapped[float] = mapped_column(Float, default=0.0)

    exit_bar_ts: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    exit_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    exit_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)  # max_holding_period | ncs_reversal
    pnl_pct: Mapped[float | None] = mapped_column(Float, nullable=True)

    version: Mapped[str] = mapped_column(String(32))
