from datetime import datetime

from pydantic import BaseModel


class SafeModeUpdate(BaseModel):
    # None clears the override and reverts to the env-configured default.
    override: bool | None = None


class SafeModeOut(BaseModel):
    override: bool | None
    env_default: bool
    effective: bool
    updated_at: datetime | None
    updated_by_user_id: int | None


class AutonomousTradingUpdate(BaseModel):
    paused: bool


class AutonomousTradingOut(BaseModel):
    paused: bool
    updated_at: datetime | None
    updated_by_user_id: int | None
    # `paused` alone answers only "is the emergency stop engaged?" — a
    # human reading this needs the real answer to "can this actually open
    # a position right now?", since Red-Team's drift/Safe-Mode checks
    # (services/risk/red_team.py) block every autonomous entry independently
    # of this switch. See services/paper_trading/autonomous.py's own gate
    # order for why these are the two other checks that matter platform-wide
    # (per-account gates — shadow sample/win-rate, position limits — are
    # necessarily per-account and not summarized here).
    drift_status: str  # "insufficient_history" | "stable" | "moderate" | "significant"
    drift_blocking: bool  # True iff drift_status == "significant" (Red-Team's own veto threshold)
    safe_mode_active: bool
    # The one honest "is this actually operational" summary: not paused,
    # not drift-blocked, not Safe-Mode-blocked. False here means every
    # autonomous entry is refused right now regardless of what any
    # individual account's own opt-in/shadow-sample state might allow.
    operational: bool


class DriftCohortRowOut(BaseModel):
    """One row of the drift-cohort audit (item 1 of the drift-incident
    review) — a distinct (cohort dimensions, ticker, day) combination and
    its record count. See services/monitoring/drift.py's cohort_breakdown()."""

    engine_mode: str
    model_version: str | None
    risk_policy_version: str | None
    feature_schema_version: str | None
    provider_class: str | None
    data_source: str | None
    data_mode: str | None
    ticker_symbol: str
    date: str
    count: int


class DriftReportOut(BaseModel):
    status: str
    cohort: dict | None = None
    note: str | None = None
    baseline_established_at: str | None = None
    baseline_sample_size: int | None = None
    recent_window: int | None = None
    model_drift: dict | None = None
    top_feature_drift: dict | None = None
    worst_model_psi: float | None = None
    worst_feature_psi: float | None = None


class AdminUserOut(BaseModel):
    id: int
    email: str
    role: str
    plan: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserPlanUpdate(BaseModel):
    plan: str
