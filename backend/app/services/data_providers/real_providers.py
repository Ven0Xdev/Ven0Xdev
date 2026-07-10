"""Stubs for production OTC data providers.

These wire up the exact same `MarketDataProvider` contract to real vendors.
They intentionally raise `NotImplementedError` with a pointer to the vendor
docs rather than half-implementing paid, key-gated integrations blind. Fill
these in once the corresponding API key is provisioned in `.env`:

- PolygonOTCProvider   -> https://polygon.io/docs (OTC/grey-market feeds)
- FinnhubProvider      -> https://finnhub.io/docs/api (fundamentals, news, sentiment)
- OTCMarketsProvider   -> https://www.otcmarkets.com/corporate-services/data-api (tier,
                           disclosure, Level II)
- SECEdgarClient       -> https://www.sec.gov/edgar/sec-api-documentation (filings,
                           insider Form 3/4/5, delinquency)

All of them should still satisfy `MarketDataProvider` so `services/scoring`,
`services/features`, and `services/backtest` need zero changes when a real
key is added — only `services/data_providers/factory.py` routes to them.
"""
from __future__ import annotations

import pandas as pd

from app.services.data_providers.base import (
    CorporateAction,
    Fundamentals,
    MarketDataProvider,
    NewsArticle,
    Quote,
    TickerMeta,
)


class _UnconfiguredProvider(MarketDataProvider):
    """Raised in place of a real provider until its API key is configured."""

    name = "unconfigured"

    def __init__(self, vendor: str, docs_url: str) -> None:
        self.vendor = vendor
        self.docs_url = docs_url

    def _fail(self):
        raise NotImplementedError(
            f"{self.vendor} is not configured. Set the matching API key in .env "
            f"and implement app/services/data_providers/real_providers.py "
            f"(see {self.docs_url})."
        )

    def get_universe(self, limit: int | None = None) -> list[TickerMeta]:
        self._fail()

    def get_ticker_meta(self, symbol: str) -> TickerMeta:
        self._fail()

    def get_ohlcv(self, symbol: str, timeframe: str = "1d", lookback_days: int = 250) -> pd.DataFrame:
        self._fail()

    def get_quote(self, symbol: str) -> Quote:
        self._fail()

    def get_fundamentals(self, symbol: str) -> Fundamentals:
        self._fail()

    def get_news(self, symbol: str, limit: int = 20) -> list[NewsArticle]:
        self._fail()

    def get_corporate_actions(self, symbol: str) -> list[CorporateAction]:
        self._fail()


class PolygonOTCProvider(_UnconfiguredProvider):
    name = "polygon"

    def __init__(self, api_key: str | None):
        super().__init__("Polygon.io", "https://polygon.io/docs")
        self.api_key = api_key


class FinnhubProvider(_UnconfiguredProvider):
    name = "finnhub"

    def __init__(self, api_key: str | None):
        super().__init__("Finnhub", "https://finnhub.io/docs/api")
        self.api_key = api_key


class OTCMarketsProvider(_UnconfiguredProvider):
    name = "otc_markets"

    def __init__(self, api_key: str | None):
        super().__init__("OTC Markets Group", "https://www.otcmarkets.com/corporate-services/data-api")
        self.api_key = api_key
