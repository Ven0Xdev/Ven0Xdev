from datetime import datetime

from pydantic import BaseModel, Field


class PaperAccountOut(BaseModel):
    id: int
    simulation_number: int
    label: str | None = None
    cash_balance: float
    starting_balance: float
    is_active: bool
    archived_at: datetime | None = None
    created_at: datetime
    # Mark-to-market, filled in by the endpoint (open positions' current
    # value), never by the ORM row itself — equity = cash + open positions'
    # market value, unrealized_pnl_dollars = equity - starting_balance.
    equity: float | None = None
    unrealized_pnl_dollars: float | None = None
    autonomous_trading_enabled: bool = False

    class Config:
        from_attributes = True


class PaperSimulationSummary(BaseModel):
    """One row in the "Paper Simulations History" list — includes
    realized-only P&L (no live mark-to-market for archived simulations,
    since by definition they have no open positions left) and basic trade
    stats, computed by the endpoint from that simulation's closed
    positions."""

    id: int
    simulation_number: int
    label: str | None = None
    starting_balance: float
    is_active: bool
    created_at: datetime
    archived_at: datetime | None = None
    closed_trade_count: int
    realized_pnl_dollars: float
    win_rate_pct: float | None = None

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
    opened_by: str = "manual"
    ncs_signal_id: int | None = None

    class Config:
        from_attributes = True


class PaperOpenRequest(BaseModel):
    ticker_symbol: str
    quantity: float


class PaperStartSimulationRequest(BaseModel):
    starting_capital: float = Field(gt=0)
    label: str | None = Field(default=None, max_length=64)


class AutonomousTradingToggleRequest(BaseModel):
    enabled: bool
