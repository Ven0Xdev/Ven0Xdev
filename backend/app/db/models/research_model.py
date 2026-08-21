from datetime import datetime

from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow

# The full state machine (Phase 5). Deliberately NOT reused/merged with
# ModelVersion.is_active (model_version.py) — that table governs the
# LIVE, request-path NCS/scoring champion and must never be touched by
# this work. A historical research candidate becoming HISTORICALLY_
# QUALIFIED here has no effect whatsoever on what the live platform
# serves; only a human-approved promote_model() call on ModelVersion does
# that, and this module never calls it.
RESEARCH_MODEL_STATES = (
    "RESEARCH",              # trained, not yet evaluated against the qualification gate
    "HISTORICALLY_QUALIFIED",  # passed every Phase 5 gate on genuine out-of-sample evidence
    "REJECTED_OVERFIT",      # failed the gate — rejection_reason always set
    "LIVE_SHADOW",           # historically qualified AND an operator started Research Canary on it
    "LIVE_QUALIFIED",        # completed a live Canary evaluation window and still passed — still never real money
    "RETIRED",               # operator manually retired it (drift, decay, or superseded)
)


class ResearchModel(Base):
    """Registry for the historical-learning pipeline's candidates — one
    row per (family, horizon, version). Separate from `ModelVersion`
    on purpose: historical qualification must never masquerade as live
    Shadow/Champion qualification (this session's non-negotiable rule).
    """

    __tablename__ = "research_models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    family: Mapped[str] = mapped_column(String(32))  # heuristic | logistic | lightgbm | xgboost | catboost | ensemble
    horizon: Mapped[str] = mapped_column(String(16))  # 30m | 60m | eod | 1d | 5d | 10d | 20d
    version: Mapped[str] = mapped_column(String(32))
    artifact_path: Mapped[str | None] = mapped_column(String(255), nullable=True)

    state: Mapped[str] = mapped_column(String(24), default="RESEARCH")
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Full evidence trail — every number the Phase 4/5 report is built
    # from, stored so the frontend Research Dashboard and any future
    # audit can reconstruct exactly why this candidate passed or failed.
    walk_forward_report: Mapped[dict] = mapped_column(JSON, default=dict)
    holdout_report: Mapped[dict] = mapped_column(JSON, default=dict)
    stress_test_report: Mapped[dict] = mapped_column(JSON, default=dict)
    leakage_checks: Mapped[dict] = mapped_column(JSON, default=dict)
    dataset_summary: Mapped[dict] = mapped_column(JSON, default=dict)  # n_samples, n_trades, coverage, provenance

    trained_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    qualified_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    retired_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class CanaryDecision(Base):
    """One row per Research Canary decision (fired or NO_TRADE), audit-
    trail-complete — mirrors NcsSignal's role for production NCS, but for
    the experimental Canary track. Never conflated with a real NcsSignal
    row."""

    __tablename__ = "canary_decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    research_model_id: Mapped[int] = mapped_column(ForeignKey("research_models.id"))
    ticker_symbol: Mapped[str] = mapped_column(String(16), index=True)
    horizon: Mapped[str] = mapped_column(String(16))
    evaluated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    verdict: Mapped[str] = mapped_column(String(16))  # BUY | SELL | NO_TRADE
    probability: Mapped[float] = mapped_column()
    fired: Mapped[bool] = mapped_column(default=False)
    no_trade_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    red_team_passed: Mapped[bool | None] = mapped_column(nullable=True)
    red_team_veto_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    drift_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    data_stale: Mapped[bool] = mapped_column(default=False)

    canary_position_id: Mapped[int | None] = mapped_column(ForeignKey("canary_positions.id"), nullable=True)
