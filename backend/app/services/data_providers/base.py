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
from enum import Enum

import pandas as pd

from app.services.data_providers.http_base import ProviderDataUnavailable


class AssetType(str, Enum):
    """The platform's unified asset taxonomy (multi-asset expansion,
    see /OTC_TO_MULTI_ASSET_MIGRATION.md §1). OTC_STOCK is one member
    among many now, not the implicit default for every symbol.
    """

    STOCK = "STOCK"
    ETF = "ETF"
    INDEX = "INDEX"                 # non-tradable (S&P 500, Nasdaq Composite, VIX)
    COMMODITY = "COMMODITY"         # oil, natural gas
    PRECIOUS_METAL = "PRECIOUS_METAL"  # gold/silver spot
    FOREX = "FOREX"
    CRYPTO = "CRYPTO"
    OTC_STOCK = "OTC_STOCK"


@dataclass
class OTCProfile:
    """OTC-only red-flag fields. Populated ONLY when asset_type ==
    OTC_STOCK — a NASDAQ/NYSE stock's AssetMeta.otc is always None, so
    no OTC warning can ever be computed or rendered for it.
    """

    tier: str  # Pink, PinkLimited, Expert, QX, QB
    caveat_emptor: bool = False
    shell_risk: bool = False
    disclosure_status: str = "unknown"
    reverse_split_count_3y: int = 0


@dataclass
class AssetMeta:
    """Unified symbol record for every asset class the platform supports.
    This is the multi-asset replacement for the OTC-only TickerMeta below
    (kept as-is for backward compatibility — see its docstring)."""

    symbol: str
    asset_type: AssetType
    name: str
    exchange: str            # NASDAQ, NYSE, ARCA, CBOE, OTC, INDEX, SPOT
    currency: str = "USD"
    provider: str = "unknown"       # which adapter is authoritative for this symbol
    is_active: bool = True
    tradable: bool = True            # False for INDEX — no entry/stop/targets
    trading_hours: str = "09:30-16:00 ET"
    data_delay: str = "unspecified"  # "realtime" | "delayed_15m" | "eod" | "synthetic"
    supported_timeframes: list[str] = field(default_factory=lambda: ["1d"])
    otc: OTCProfile | None = None    # only set when asset_type == OTC_STOCK

    def __post_init__(self) -> None:
        if self.asset_type != AssetType.OTC_STOCK and self.otc is not None:
            raise ValueError(
                f"{self.symbol}: OTCProfile set on a non-OTC asset_type "
                f"({self.asset_type}) — OTC fields must never attach to a "
                f"standard NASDAQ/NYSE/ETF/index/commodity asset."
            )
        if self.asset_type == AssetType.INDEX and self.tradable:
            raise ValueError(
                f"{self.symbol}: INDEX assets are never tradable (no entry/stop/"
                f"targets) — did you mean an ETF that tracks this index?"
            )


@dataclass
class TickerMeta:
    """The provider-facing OTC ticker record. Kept unchanged (existing
    providers, scorer, and tests all depend on this exact shape) — this is
    now the OTC_STOCK-specific view; AssetMeta above is the multi-asset
    record. Fields here map onto AssetMeta.otc (OTCProfile) once a symbol
    is asset-typed; see /OTC_TO_MULTI_ASSET_MIGRATION.md §1.
    """

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
    """Top-of-book quote. bid/ask are None when the underlying data vendor
    does not supply quote depth (e.g. Finnhub's free tier) — never
    approximated, per the platform's no-fabricated-market-data rule.
    Spread-dependent signals degrade explicitly rather than silently.
    """

    symbol: str
    last: float
    timestamp: datetime
    bid: float | None = None
    ask: float | None = None
    bid_size: float | None = None
    ask_size: float | None = None

    @property
    def spread(self) -> float | None:
        if self.bid is None or self.ask is None:
            return None
        return max(self.ask - self.bid, 0.0)

    @property
    def spread_pct(self) -> float | None:
        if self.bid is None or self.ask is None:
            return None
        mid = (self.bid + self.ask) / 2 or 1e-9
        return (self.ask - self.bid) / mid * 100


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
    # False means every field above is a neutral placeholder (zeros/False),
    # not a real "the company has zero cash" observation — set when a
    # provider genuinely cannot supply fundamentals for this symbol (e.g.
    # neither Twelve Data's paid-only /statistics nor Alpha Vantage's
    # stock-only OVERVIEW cover ETFs like SPY/XLK). Callers must render
    # "fundamentals unavailable", never a real-looking score built from
    # fabricated zeros — see services/scoring/scorer.py's fallback
    # construction and features/fundamental.py's neutral-score branch.
    data_available: bool = True


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
    # Provenance label propagated into every analysis response (P0-1):
    # "synthetic" (generated demo data) | "delayed" (real, not real-time,
    # e.g. EOD candles) | "live" | "unspecified". The UI renders this as a
    # visible badge — demo data is never silent.
    data_mode: str = "unspecified"

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

    def get_intraday_bars(self, symbol: str, lookback_minutes: int = 390) -> pd.DataFrame:
        """Real minute-level history for intraday chart backfill (see
        services/signals/engine.py::bars_for_timeframe, which merges this
        with whatever the live stream has accumulated so a chart isn't
        empty just because a symbol was only just subscribed).

        Deliberately NOT abstract: most free-tier vendors here (mock,
        Twelve Data, Alpha Vantage, Finnhub) have no minute-bar endpoint on
        their free plan, and requiring every adapter to implement this
        would mean either fabricating minute bars or duplicating this same
        raise everywhere. The default here IS the honest answer for all of
        them; only AlpacaProvider overrides it with a real fetch.
        """
        raise ProviderDataUnavailable(
            f"{self.name} does not provide intraday minute-bar history — the chart falls back to "
            f"whatever has actually streamed, with no fabricated backfill."
        )
