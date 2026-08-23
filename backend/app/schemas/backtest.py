from datetime import datetime

from pydantic import BaseModel


class BacktestRequest(BaseModel):
    symbols: list[str] | None = None
    universe_limit: int = 15
    lookback_days: int = 300
    max_hold_days: int = 20
    position_size_dollars: float = 2000.0
    commission_bps: float = 10.0
    slippage_bps: float = 15.0


class TradeOut(BaseModel):
    symbol: str
    entry_ts: datetime
    exit_ts: datetime | None
    entry_price: float
    exit_price: float | None
    quantity: float
    pnl_pct: float | None
    exit_reason: str | None
    hold_days: int
    was_partial_entry: bool
    was_halted_entry: bool


class BacktestResponse(BaseModel):
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown_pct: float
    profit_factor: float
    expectancy_pct: float
    win_rate_pct: float
    avg_hold_time_days: float
    total_return_pct: float
    num_trades: int
    equity_curve: list[float]
    trades: list[TradeOut]
