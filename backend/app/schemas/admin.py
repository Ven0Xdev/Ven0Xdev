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
