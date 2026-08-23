from datetime import datetime

from pydantic import BaseModel


class WatchlistItemOut(BaseModel):
    ticker_symbol: str
    added_at: datetime
    note: str | None = None

    class Config:
        from_attributes = True


class WatchlistAddRequest(BaseModel):
    ticker_symbol: str
    note: str | None = None


class PortfolioPositionOut(BaseModel):
    ticker_symbol: str
    quantity: float
    avg_entry_price: float
    opened_at: datetime
    status: str
    current_price: float | None = None
    unrealized_pnl_pct: float | None = None

    class Config:
        from_attributes = True


class PortfolioPositionCreate(BaseModel):
    ticker_symbol: str
    quantity: float
    avg_entry_price: float
