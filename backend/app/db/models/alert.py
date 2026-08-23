from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow

# Kept here (not on the model) so the API layer's request validation and
# the evaluator's dispatch logic both import the exact same source of
# truth instead of two lists that could silently drift apart.
CONDITION_TYPES = ("price", "ai_score", "manipulation_risk", "signal_status")
COMPARISONS = ("above", "below", "equals")


class AlertRule(Base):
    """A user's standing watch condition on one ticker. Evaluated
    periodically (piggybacks on `workers/prediction_scheduler.py`'s
    existing hourly pass over every active asset — see that module's
    docstring — rather than a fifth independent scheduler) against that
    pass's fresh `StockAnalysis`/live `SignalPayload`, never against
    stale or cached data.
    """

    __tablename__ = "alert_rules"
    __table_args__ = (
        CheckConstraint(f"condition_type IN {CONDITION_TYPES}", name="ck_alert_rule_condition_type"),
        CheckConstraint(f"comparison IN {COMPARISONS}", name="ck_alert_rule_comparison"),
        Index("ix_alert_rules_user_active", "user_id", "is_active"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    condition_type: Mapped[str] = mapped_column(String(24))  # see CONDITION_TYPES
    comparison: Mapped[str] = mapped_column(String(8))  # see COMPARISONS
    # For price/ai_score/manipulation_risk conditions. NULL for signal_status.
    threshold_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    # For signal_status conditions (e.g. "POSSIBLE_ENTRY"). NULL otherwise.
    target_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # Cooldown bookkeeping: a rule that stays true every cycle must not
    # re-fire every cycle — see services/alerts/evaluator.py's
    # ALERT_COOLDOWN_SECONDS.
    last_fired_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class AlertEvent(Base):
    """Immutable record of a rule actually firing — the notification
    center's data source. Never edited after creation; `acknowledged` is
    the one mutable field, toggled when a user dismisses it.
    """

    __tablename__ = "alert_events"
    __table_args__ = (Index("ix_alert_events_rule_fired", "rule_id", "fired_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("alert_rules.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    fired_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    # Human-readable, e.g. "AI score crossed above 70 (observed 72.4)" —
    # built once at fire time so the notification center never has to
    # reconstruct meaning from raw condition_type/comparison/threshold.
    message: Mapped[str] = mapped_column(String(255))
    observed_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    observed_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
