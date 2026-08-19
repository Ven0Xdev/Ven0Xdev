from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


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
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True, default=utcnow)

    # Provenance (matches StockAnalysis.engine_mode/.model_version from the
    # Phase 1 audit fix, and Signal.risk_policy_version from Phase 4) — the
    # single reason the Champion/Challenger promotion gate can ever compare
    # "how did HEURISTIC do historically vs. TRAINED_ML," instead of every
    # logged prediction being an anonymous, unattributable number.
    engine_mode: Mapped[str] = mapped_column(String(16), default="HEURISTIC", index=True)
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    risk_policy_version: Mapped[str] = mapped_column(String(48), default="unversioned")
    # Cohort-isolation fields for drift monitoring (services/monitoring/drift.py)
    # — added after a live incident where drift was computed by comparing
    # ANY two time-sliced windows of predictions.rows regardless of whether
    # they came from a comparable feature schema, provider configuration, or
    # data freshness. NULL for every row logged before this field existed
    # (never backfilled/guessed — see UTCDateTime's own no-fabrication
    # discipline) — those rows are preserved for audit but excluded from
    # any cohort-filtered drift comparison, which is the correct behavior
    # for provenance nobody actually recorded.
    feature_schema_version: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # The *configured* provider (settings.market_data_provider at write
    # time, e.g. "alpaca") — stable across a whole deployment epoch, unlike
    # `data_source` below which self-reports whichever specific vendor in a
    # fallback chain actually answered THIS call and can flip request to
    # request (see services/data_providers/market_data_fallback.py). Used
    # as a cohort key; `data_source` is not, since keying on it would
    # fragment the cohort on routine fallback rather than a real
    # configuration change.
    provider_class: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # Per-call self-reported provenance (StockAnalysis.data_source/.data_mode)
    # — captured for audit ("report record counts grouped by ... provider,
    # data mode") even though only data_mode (live/delayed/cached/synthetic)
    # is part of the cohort key; data_source is informational only.
    data_source: Mapped[str | None] = mapped_column(String(48), nullable=True)
    data_mode: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)

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
    evaluated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
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
