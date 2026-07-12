from datetime import datetime

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

    # --- Provenance (P0-1): every analysis says where its data came from,
    # what kind of data it is, and when it was computed. Consumers (UI,
    # chat, dossier) inherit these labels instead of inventing their own.
    data_source: str = Field("unknown", description="Provider that supplied the underlying data, e.g. 'mock', 'finnhub+edgar'")
    data_mode: str = Field("unspecified", description="'synthetic' | 'delayed' | 'live' | 'unspecified' — synthetic/delayed data is never unlabeled")
    as_of: datetime | None = Field(None, description="UTC time this analysis was computed")
    price_as_of: datetime | None = Field(None, description="Timestamp of the most recent price bar used")

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
    # Canonical model-input features at analysis time (name -> value).
    # Persisted into predictions.feature_snapshot so realized outcomes can
    # be joined back to the exact inputs — the training set for
    # challenger retraining (self-learning loop).
    feature_vector: dict[str, float] = Field(default_factory=dict)

    class Config:
        from_attributes = True
