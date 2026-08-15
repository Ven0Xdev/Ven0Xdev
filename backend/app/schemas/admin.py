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
