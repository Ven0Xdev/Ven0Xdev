"""Registered-but-unimplemented vendor adapters.

Each class here satisfies the `MarketDataProvider` port and is registered in
the provider registry, so selecting it in config is already valid — using it
raises `ProviderDataUnavailable` pointing at the vendor docs until the field
mapping is written. This keeps "supported provider" and "implemented
provider" as two separate, honest states: config never lies about what
exists, and the error a user sees names exactly what's missing.

Implementation notes for whoever picks these up (use
`finnhub_provider.FinnhubProvider` as the template — all infrastructure is
in `http_base.RateLimitedHttpClient`, an adapter is only field mapping):

- PolygonOTCProvider   https://polygon.io/docs — aggregates (OHLCV) support
                       OTC via `adjusted` aggs; quotes/trades need the OTC
                       entitlement on the key.
- OTCMarketsProvider   https://www.otcmarkets.com/market-data — tier,
                       disclosure status, Level II; the authoritative OTC
                       source, licensing-gated.
- AlpacaProvider       https://docs.alpaca.markets — market data API v2
                       (bars/quotes/news); note OTC symbols require the
                       paid data tier; auth is header-based
                       (APCA-API-KEY-ID / APCA-API-SECRET-KEY), pass via
                       `headers=` on RateLimitedHttpClient.

SEC EDGAR is intentionally NOT here: it is a scheduled *facts ingester*
(`edgar_client.py` + `edgar_enricher.py`, architecture D7), not a
quotes/candles provider behind this port.
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
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.registry import register_provider


class _UnimplementedProvider(MarketDataProvider):
    """Base for adapters that are registered but not yet field-mapped."""

    name = "unimplemented"

    def __init__(self, vendor: str, docs_url: str, has_key: bool):
        self.vendor = vendor
        self.docs_url = docs_url
        self.has_key = has_key

    def _fail(self):
        key_note = "" if self.has_key else " (its API key is also not configured in .env)"
        raise ProviderDataUnavailable(
            f"The {self.vendor} adapter is registered but not implemented yet{key_note}. "
            f"Implement it in app/services/data_providers/real_providers.py using the Finnhub "
            f"adapter as the template — see {self.docs_url}."
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


class PolygonOTCProvider(_UnimplementedProvider):
    name = "polygon"

    def __init__(self, api_key: str | None):
        super().__init__("Polygon.io", "https://polygon.io/docs", has_key=bool(api_key))
        self.api_key = api_key


class OTCMarketsProvider(_UnimplementedProvider):
    name = "otc_markets"

    def __init__(self, api_key: str | None):
        super().__init__(
            "OTC Markets Group", "https://www.otcmarkets.com/market-data", has_key=bool(api_key)
        )
        self.api_key = api_key


class AlpacaProvider(_UnimplementedProvider):
    name = "alpaca"

    def __init__(self, api_key: str | None, api_secret: str | None):
        super().__init__(
            "Alpaca", "https://docs.alpaca.markets", has_key=bool(api_key and api_secret)
        )
        self.api_key = api_key
        self.api_secret = api_secret


@register_provider("polygon")
def _build_polygon(settings) -> PolygonOTCProvider:
    return PolygonOTCProvider(settings.polygon_api_key)


@register_provider("otc_markets")
def _build_otc_markets(settings) -> OTCMarketsProvider:
    return OTCMarketsProvider(settings.otc_markets_api_key)


@register_provider("alpaca")
def _build_alpaca(settings) -> AlpacaProvider:
    return AlpacaProvider(settings.alpaca_api_key, settings.alpaca_api_secret)
