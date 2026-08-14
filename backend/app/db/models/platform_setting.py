from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlatformSetting(Base):
    """Singleton row (id is always 1) holding operator-controlled runtime
    overrides — settings an operator needs to flip without a redeploy.

    Distinct from app/core/config.py's `Settings` (env-derived, fixed for
    the lifetime of the process, cached via `@lru_cache`): a value here can
    be `None` to mean "no override, follow the env default" or an explicit
    True/False to override it live. Currently holds only Safe Mode, the
    platform-wide kill switch (services/risk/engine.py's evaluate_risk());
    a genuinely new admin capability, not present anywhere before Phase 11.
    """

    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    safe_mode_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
