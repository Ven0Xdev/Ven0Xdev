from datetime import datetime

from pydantic import BaseModel


class PredictionOut(BaseModel):
    id: int
    ticker_symbol: str
    created_at: datetime
    current_price: float
    overall_ai_score: float
    confidence_score: float
    manipulation_risk: float
    prob_up_10: float
    explanation: str
    engine_mode: str
    model_version: str | None = None
    risk_policy_version: str

    class Config:
        from_attributes = True


class ModelPerformanceSummary(BaseModel):
    total_predictions: int
    total_outcomes: int
    avg_realized_return_pct: float | None
    hit_rate_take_profit_1_pct: float | None
    hit_rate_stop_loss_pct: float | None
    note: str | None = None
