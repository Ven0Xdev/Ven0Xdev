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
