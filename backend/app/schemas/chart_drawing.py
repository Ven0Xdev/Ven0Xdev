from datetime import datetime

from pydantic import BaseModel


class ChartDrawingCreate(BaseModel):
    ticker_symbol: str
    timeframe: str
    drawing_type: str
    data: dict
    locked: bool = False
    hidden: bool = False


class ChartDrawingUpdate(BaseModel):
    data: dict | None = None
    locked: bool | None = None
    hidden: bool | None = None


class ChartDrawingOut(BaseModel):
    id: int
    ticker_symbol: str
    timeframe: str
    drawing_type: str
    data: dict
    locked: bool
    hidden: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
