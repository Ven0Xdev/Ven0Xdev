from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Prediction(Base):
    """One immutable AI recommendation snapshot for a ticker at a point in time.

    Append-only by policy (architecture D9): corrections are new rows,
    updates are forbidden. The CHECK constraints below make the platform's
    honesty invariants (probabilities in [0,1], scores in [0,100], sane
    price ordering) database-enforced, not merely code-enforced — a bug
    that produces an impossible probability fails loudly at INSERT instead
    of poisoning the calibration dataset silently.
    """

    __tablename__ = "predictions"
    __table_args__ = (
        # Hot path: prediction history per ticker, newest first.
        Index("ix_predictions_ticker_created", "ticker_symbol", "created_at"),
        CheckConstraint("prob_up_5 >= 0 AND prob_up_5 <= 1", name="ck_pred_prob5_unit"),
        CheckConstraint("prob_up_10 >= 0 AND prob_up_10 <= 1", name="ck_pred_prob10_unit"),
        CheckConstraint("prob_up_20 >= 0 AND prob_up_20 <= 1", name="ck_pred_prob20_unit"),
        CheckConstraint(
            "prob_downside_before_upside >= 0 AND prob_downside_before_upside <= 1",
            name="ck_pred_downside_unit",
        ),
        CheckConstraint("overall_ai_score >= 0 AND overall_ai_score <= 100", name="ck_pred_overall_band"),
        CheckConstraint("confidence_score >= 0 AND confidence_score <= 100", name="ck_pred_confidence_band"),
        CheckConstraint("manipulation_risk >= 0 AND manipulation_risk <= 100", name="ck_pred_manip_band"),
        CheckConstraint("current_price > 0", name="ck_pred_price_positive"),
        CheckConstraint(
            "stop_loss < ideal_entry_price AND ideal_entry_price < take_profit_1 "
            "AND take_profit_1 < take_profit_2 AND take_profit_2 < take_profit_3",
            name="ck_pred_level_ordering",
        ),
        CheckConstraint("holding_period_days > 0", name="ck_pred_horizon_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    model_version_id: Mapped[int | None] = mapped_column(ForeignKey("model_versions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, index=True, default=datetime.utcnow)

    current_price: Mapped[float] = mapped_column(Float)
    liquidity_score: Mapped[float] = mapped_column(Float)
    manipulation_risk: Mapped[float] = mapped_column(Float)
    fundamental_score: Mapped[float] = mapped_column(Float)
    technical_score: Mapped[float] = mapped_column(Float)
    sentiment_score: Mapped[float] = mapped_column(Float)
    catalyst_score: Mapped[float] = mapped_column(Float)
    overall_ai_score: Mapped[float] = mapped_column(Float)
    confidence_score: Mapped[float] = mapped_column(Float)

    prob_up_5: Mapped[float] = mapped_column(Float)
    prob_up_10: Mapped[float] = mapped_column(Float)
    prob_up_20: Mapped[float] = mapped_column(Float)
    prob_downside_before_upside: Mapped[float] = mapped_column(Float)

    entry_zone_low: Mapped[float] = mapped_column(Float)
    entry_zone_high: Mapped[float] = mapped_column(Float)
    ideal_entry_price: Mapped[float] = mapped_column(Float)
    stop_loss: Mapped[float] = mapped_column(Float)
    take_profit_1: Mapped[float] = mapped_column(Float)
    take_profit_2: Mapped[float] = mapped_column(Float)
    take_profit_3: Mapped[float] = mapped_column(Float)
    max_allocation_pct: Mapped[float] = mapped_column(Float)
    risk_reward: Mapped[float] = mapped_column(Float)
    holding_period_days: Mapped[int] = mapped_column(Integer)

    explanation: Mapped[str] = mapped_column(String)
    horizon_probabilities: Mapped[dict] = mapped_column(JSON, default=dict)
    feature_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    shap_top_factors: Mapped[dict] = mapped_column(JSON, default=dict)

    outcome: Mapped["Outcome | None"] = relationship(back_populates="prediction", uselist=False)


class Outcome(Base):
    """Realized result of a prediction, used for learning/calibration feedback.

    The UNIQUE constraint on prediction_id is the database-level guarantee
    of the evaluator's exactly-once contract (PRD FR-503): even a buggy or
    concurrently-run evaluator cannot double-grade a prediction.
    """

    __tablename__ = "outcomes"
    __table_args__ = (
        CheckConstraint("horizon_days > 0", name="ck_outcome_horizon_positive"),
        CheckConstraint("max_drawdown_pct <= 0", name="ck_outcome_drawdown_nonpositive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    prediction_id: Mapped[int] = mapped_column(ForeignKey("predictions.id"), unique=True)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    horizon_days: Mapped[int] = mapped_column(Integer)
    realized_return_pct: Mapped[float] = mapped_column(Float)
    hit_take_profit_1: Mapped[bool] = mapped_column(default=False)
    hit_take_profit_2: Mapped[bool] = mapped_column(default=False)
    hit_take_profit_3: Mapped[bool] = mapped_column(default=False)
    hit_stop_loss: Mapped[bool] = mapped_column(default=False)
    max_drawdown_pct: Mapped[float] = mapped_column(Float, default=0.0)
    # Peak favorable excursion: (max high in window / entry - 1) * 100.
    # This is the label source for retraining — "did the path touch
    # +5/10/20%?" is exactly `max_runup_pct >= threshold`.
    max_runup_pct: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)

    prediction: Mapped["Prediction"] = relationship(back_populates="outcome")
