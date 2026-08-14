"""Admin/Operator surface — Phase 11. Most of what an operator needs
already exists as operator-gated endpoints elsewhere (GET/POST /models,
GET/POST/PATCH/DELETE /universe, GET /monitoring/health, GET
/providers/health, GET /health/ready for schema readiness) — the Admin UI
is a frontend consolidation of those, not a reason to duplicate them here.

The one genuinely new capability is the Safe Mode runtime toggle: before
this, Safe Mode (services/risk/engine.py's platform-wide kill switch) was
only a fixed env var (`SAFE_MODE_ENABLED`), so flipping it required a
redeploy. This lets an operator flip it live — see
services/platform_settings.py for why that needs a DB-backed override
rather than just re-reading Settings.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import db_session, require_operator
from app.core.config import get_settings
from app.db.models.user import User
from app.schemas.admin import SafeModeOut, SafeModeUpdate
from app.services.platform_settings import (
    get_platform_setting,
    is_safe_mode_active,
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
