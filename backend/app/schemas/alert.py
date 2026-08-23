from datetime import datetime

from pydantic import BaseModel


class AlertRuleCreate(BaseModel):
    ticker_symbol: str
    condition_type: str  # "price" | "ai_score" | "manipulation_risk" | "signal_status"
    comparison: str  # "above" | "below" | "equals"
    threshold_value: float | None = None
    target_status: str | None = None


class AlertRuleOut(BaseModel):
    id: int
    ticker_symbol: str
    condition_type: str
    comparison: str
    threshold_value: float | None
    target_status: str | None
    is_active: bool
    created_at: datetime
    last_fired_at: datetime | None

    class Config:
        from_attributes = True


class AlertEventOut(BaseModel):
    id: int
    rule_id: int
    ticker_symbol: str
    fired_at: datetime
    message: str
    observed_value: float | None
    observed_status: str | None
    acknowledged: bool

    class Config:
        from_attributes = True
