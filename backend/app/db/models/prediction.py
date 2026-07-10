from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Prediction(Base):
    """One immutable AI recommendation snapshot for a ticker at a point in time."""

    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    model_version_id: Mapped[int | None] = mapped_column(ForeignKey("model_versions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, primary_key=True, default=datetime.utcnow)

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
    """Realized result of a prediction, used for learning/calibration feedback."""

    __tablename__ = "outcomes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    prediction_id: Mapped[int] = mapped_column(ForeignKey("predictions.id"))
    evaluated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    horizon_days: Mapped[int] = mapped_column(Integer)
    realized_return_pct: Mapped[float] = mapped_column(Float)
    hit_take_profit_1: Mapped[bool] = mapped_column(default=False)
    hit_take_profit_2: Mapped[bool] = mapped_column(default=False)
    hit_take_profit_3: Mapped[bool] = mapped_column(default=False)
    hit_stop_loss: Mapped[bool] = mapped_column(default=False)
    max_drawdown_pct: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)

    prediction: Mapped["Prediction"] = relationship(back_populates="outcome")
