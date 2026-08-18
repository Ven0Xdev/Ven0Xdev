"""Admin/Operator surface — Phase 11 (Safe Mode), extended in Phase 13
(user/plan management). Most of what an operator needs already exists as
operator-gated endpoints elsewhere (GET/POST /models, GET/POST/PATCH/DELETE
/universe, GET /monitoring/health, GET /providers/health, GET /health/ready
for schema readiness) — the Admin UI is a frontend consolidation of those,
not a reason to duplicate them here.

Phase 11's genuinely new capability was the Safe Mode runtime toggle:
before it, Safe Mode (services/risk/engine.py's platform-wide kill switch)
was only a fixed env var (`SAFE_MODE_ENABLED`), so flipping it required a
redeploy. This lets an operator flip it live — see
services/platform_settings.py for why that needs a DB-backed override
rather than just re-reading Settings.

Phase 13 adds the only way to change a user's plan during this beta: no
self-serve checkout exists (see services/billing/provider.py's
NullBillingProvider — no real payment provider is configured), so an
operator grants/changes plans directly, explicitly, and auditably here.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import db_session, require_operator
from app.core.config import get_settings
from app.core.entitlements import VALID_PLANS
from app.db.models.user import User
from app.schemas.admin import (
    AdminUserOut,
    AutonomousTradingOut,
    AutonomousTradingUpdate,
    SafeModeOut,
    SafeModeUpdate,
    UserPlanUpdate,
)
from app.services.platform_settings import (
    get_platform_setting,
    is_safe_mode_active,
    set_autonomous_trading_paused,
    set_safe_mode_override,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _serialize(db: Session) -> SafeModeOut:
    row = get_platform_setting(db)
    return SafeModeOut(
        override=row.safe_mode_override,
        env_default=get_settings().safe_mode_enabled,
        effective=is_safe_mode_active(db),
        updated_at=row.updated_at,
        updated_by_user_id=row.updated_by_user_id,
    )


@router.get("/safe-mode", response_model=SafeModeOut)
def get_safe_mode(db: Session = Depends(db_session), _operator: User = Depends(require_operator)):
    return _serialize(db)


@router.post("/safe-mode", response_model=SafeModeOut)
def set_safe_mode(
    payload: SafeModeUpdate,
    db: Session = Depends(db_session),
    operator: User = Depends(require_operator),
):
    set_safe_mode_override(db, payload.override, operator)
    return _serialize(db)


def _serialize_autonomous(db: Session) -> AutonomousTradingOut:
    row = get_platform_setting(db)
    return AutonomousTradingOut(
        paused=row.autonomous_trading_paused, updated_at=row.updated_at, updated_by_user_id=row.updated_by_user_id,
    )


@router.get("/autonomous-trading", response_model=AutonomousTradingOut)
def get_autonomous_trading(db: Session = Depends(db_session), _operator: User = Depends(require_operator)):
    """The platform-wide emergency stop for autonomous paper trading —
    distinct from Safe Mode (see services/paper_trading/autonomous.py)."""
    return _serialize_autonomous(db)


@router.post("/autonomous-trading", response_model=AutonomousTradingOut)
def set_autonomous_trading(
    payload: AutonomousTradingUpdate,
    db: Session = Depends(db_session),
    operator: User = Depends(require_operator),
):
    set_autonomous_trading_paused(db, payload.paused, operator)
    return _serialize_autonomous(db)


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(db_session), _operator: User = Depends(require_operator)):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}/plan", response_model=AdminUserOut)
def set_user_plan(
    user_id: int,
    payload: UserPlanUpdate,
    db: Session = Depends(db_session),
    _operator: User = Depends(require_operator),
):
    if payload.plan not in VALID_PLANS:
        raise HTTPException(status_code=400, detail=f"plan must be one of {VALID_PLANS}")
    target = db.query(User).filter_by(id=user_id).one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    target.plan = payload.plan
    db.add(target)
    db.commit()
    db.refresh(target)
    return target
