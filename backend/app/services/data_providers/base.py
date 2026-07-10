"""Abstract market data provider interface.

Every downstream service (feature engineering, scoring, backtesting) talks to
this interface only. Swapping the synthetic `MockOTCProvider` for a real feed
(Polygon.io OTC, OTC Markets Group API, Finnhub, IEX, dxFeed Level II, SEC
EDGAR full-text search, etc.) requires no changes outside
`services/data_providers/`.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime

import pandas as pd


@dataclass
class TickerMeta:
    symbol: str
    company_name: str
    tier: str  # Pink, PinkLimited, Expert, QX, QB
    sector: str
    industry: str
    float_shares: float
    shares_outstanding: float
    market_cap: float
    reverse_split_count_3y: int = 0
    institutional_ownership_pct: float | None = None
    insider_ownership_pct: float | None = None
    short_interest_pct: float | None = None


@dataclass
class Quote:
    symbol: str
    last: float
    bid: float
    ask: float
    bid_size: float
    ask_size: float
    timestamp: datetime

    @property
    def spread(self) -> float:
        return max(self.ask - self.bid, 0.0)

    @property
    def spread_pct(self) -> float:
        mid = (self.bid + self.ask) / 2 or 1e-9
        return self.spread / mid * 100


@dataclass
class Fundamentals:
    symbol: str
    market_cap: float
    float_shares: float
    shares_outstanding: float
    cash: float
    total_debt: float
    revenue_ttm: float
    net_income_ttm: float
    dilution_12m_pct: float
    going_concern_flag: bool
    last_filing_date: datetime | None
    filing_delinquent: bool = False


@dataclass
class NewsArticle:
    symbol: str
    published_at: datetime
    source: str
    headline: str
    url: str
    sentiment: float  # -1..1
    is_press_release: bool = False
    is_promotional: bool = False


@dataclass
class CorporateAction:
    symbol: str
    date: datetime
    action_type: str  # reverse_split, dilution, offering, name_change, uplisting
    details: dict = field(default_factory=dict)


class MarketDataProvider(ABC):
    """Contract every concrete data source must satisfy."""

    name: str = "base"

    @abstractmethod
    def get_universe(self, limit: int | None = None) -> list[TickerMeta]:
        """Return the tradable OTC universe (or a capped slice of it)."""

    @abstractmethod
    def get_ticker_meta(self, symbol: str) -> TickerMeta:
        ...

    @abstractmethod
    def get_ohlcv(self, symbol: str, timeframe: str = "1d", lookback_days: int = 250) -> pd.DataFrame:
        """Return a DataFrame indexed by timestamp with columns:
        open, high, low, close, volume, bid, ask
        """

    @abstractmethod
    def get_quote(self, symbol: str) -> Quote:
        ...

    @abstractmethod
    def get_fundamentals(self, symbol: str) -> Fundamentals:
        ...

    @abstractmethod
    def get_news(self, symbol: str, limit: int = 20) -> list[NewsArticle]:
        ...

    @abstractmethod
    def get_corporate_actions(self, symbol: str) -> list[CorporateAction]:
        ...
