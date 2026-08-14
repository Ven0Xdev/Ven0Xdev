from datetime import datetime

from pydantic import BaseModel


class PaperAccountOut(BaseModel):
    cash_balance: float
    starting_balance: float
    created_at: datetime

    class Config:
        from_attributes = True


class PaperPositionOut(BaseModel):
    id: int
    ticker_symbol: str
    quantity: float
    avg_entry_price: float
    opened_at: datetime
    closed_at: datetime | None = None
    exit_price: float | None = None
    status: str
    realized_pnl_dollars: float | None = None
    entry_confidence_pct: float | None = None
    entry_risk_reward: float | None = None
    planned_stop_loss: float | None = None
    planned_take_profit: float | None = None
    risk_policy_version: str
    entry_data_source: str
    entry_data_mode: str
    current_price: float | None = None
    unrealized_pnl_dollars: float | None = None
    unrealized_pnl_pct: float | None = None

    class Config:
        from_attributes = True


class PaperOpenRequest(BaseModel):
    ticker_symbol: str
    quantity: float
