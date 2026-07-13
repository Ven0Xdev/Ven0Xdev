from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Signal(Base):
    """Immutable signal snapshot. State changes NEVER update a row — they
    append a SignalEvent and (on material change) a new Signal row, so the
    full decision history is replayable.
    """

    __tablename__ = "signals"
    __table_args__ = (Index("ix_signals_ticker_created", "ticker_symbol", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(24))  # NO_TRADE..SIGNAL_INVALIDATED
    ideal_entry: Mapped[float | None] = mapped_column(Float, nullable=True)
    entry_zone_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    entry_zone_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    targets: Mapped[list] = mapped_column(JSON, default=list)
    holding_period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_reward: Mapped[float | None] = mapped_column(Float, nullable=True)
    calibrated_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    technical_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    liquidity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    manipulation_risk: Mapped[float | None] = mapped_column(Float, nullable=True)
    dilution_risk_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    data_quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    bullish_reasons: Mapped[list] = mapped_column(JSON, default=list)
    bearish_reasons: Mapped[list] = mapped_column(JSON, default=list)
    invalidation_conditions: Mapped[list] = mapped_column(JSON, default=list)
    rejection_reasons: Mapped[list] = mapped_column(JSON, default=list)  # why NOT actionable
    data_source: Mapped[str] = mapped_column(String(48), default="unknown")
    data_mode: Mapped[str] = mapped_column(String(16), default="unspecified")
    model_version: Mapped[str] = mapped_column(String(48), default="cold-start")
    feature_version: Mapped[str] = mapped_column(String(48), default="fv-1")

    events: Mapped[list["SignalEvent"]] = relationship(back_populates="signal", cascade="all, delete-orphan")


class SignalEvent(Base):
    __tablename__ = "signal_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    signal_id: Mapped[int] = mapped_column(ForeignKey("signals.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    event_type: Mapped[str] = mapped_column(String(32))  # created | status_changed | invalidated | superseded
    from_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    reason: Mapped[str | None] = mapped_column(String, nullable=True)

    signal: Mapped["Signal"] = relationship(back_populates="events")
