"""Operator-controlled runtime overrides — currently just Safe Mode, the
platform-wide kill switch. Backed by the `platform_settings` singleton row
(id=1) rather than app/core/config.py's `Settings`, because `Settings` is
resolved once via `@lru_cache` at process start and cannot change without a
redeploy — an operator flipping Safe Mode from the Admin UI needs the new
value to take effect on the very next request, in every worker process.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models.platform_setting import PlatformSetting
from app.db.models.user import User

SETTINGS_ROW_ID = 1


def get_platform_setting(db: Session) -> PlatformSetting:
    row = db.query(PlatformSetting).filter_by(id=SETTINGS_ROW_ID).one_or_none()
    if row is None:
        row = PlatformSetting(id=SETTINGS_ROW_ID)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def is_safe_mode_active(db: Session | None, settings: Settings | None = None) -> bool:
    """`db=None` (unit tests exercising evaluate_risk() directly, or any
    call site with no session in scope) falls back to the env-only default
    — the exact behavior this function replaces. `settings` mirrors
    evaluate_risk()'s own override param, so a caller injecting a custom
    Settings for testability gets it honored here too, not silently
    bypassed by the process-wide get_settings() singleton."""
    env_default = (settings or get_settings()).safe_mode_enabled
    if db is None:
        return env_default
    override = get_platform_setting(db).safe_mode_override
    return env_default if override is None else override


def set_safe_mode_override(db: Session, override: bool | None, operator: User) -> PlatformSetting:
    row = get_platform_setting(db)
    row.safe_mode_override = override
    row.updated_at = datetime.now(timezone.utc)
    row.updated_by_user_id = operator.id
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
