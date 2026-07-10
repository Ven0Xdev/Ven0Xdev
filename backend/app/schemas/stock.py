from pydantic import BaseModel, Field


class HorizonProbabilities(BaseModel):
    horizon_days: int
    prob_up_5: float
    prob_up_10: float
    prob_up_20: float


class ManipulationFlagOut(BaseModel):
    code: str
    severity: float
    reason: str


class TopFactor(BaseModel):
    feature: str
    label: str
    impact: float
    direction: str


class StockAnalysis(BaseModel):
    ticker: str
    company_name: str
    current_price: float = Field(..., description="Latest traded/last price")
    tier: str
    sector: str

    liquidity_score: float = Field(..., ge=0, le=100)
    manipulation_risk: float = Field(..., ge=0, le=100)
    fundamental_score: float = Field(..., ge=0, le=100)
    technical_score: float = Field(..., ge=0, le=100)
    sentiment_score: float = Field(..., ge=0, le=100)
    catalyst_score: float = Field(..., ge=0, le=100)
    overall_ai_score: float = Field(..., ge=0, le=100)
    confidence_score: float = Field(..., ge=0, le=100)

    probability_matrix: list[HorizonProbabilities]
    probability_downside_before_upside: float = Field(..., ge=0, le=1)

    suggested_entry_zone_low: float
    suggested_entry_zone_high: float
    ideal_entry_price: float
    stop_loss: float
    take_profit_1: float
    take_profit_2: float
    take_profit_3: float
    max_allocation_pct: float
    expected_risk_reward: float
    estimated_holding_period_days: int

    explanation: str
    manipulation_flags: list[ManipulationFlagOut]
    top_factors: list[TopFactor]

    class Config:
        from_attributes = True
