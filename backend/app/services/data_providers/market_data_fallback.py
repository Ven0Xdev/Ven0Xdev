"""Primary/fallback composite: Twelve Data first, Alpha Vantage second.

Registered under the config name "twelvedata" — selecting Twelve Data *is*
choosing this behavior: every call tries Twelve Data first and transparently
falls back to Alpha Vantage only when Twelve Data raises
`ProviderDataUnavailable` (missing key, rate limit, vendor outage, symbol
not covered, etc). If both vendors fail, callers get one
`ProviderDataUnavailable` naming both failures — never a silent empty
result and never fabricated data.

Indicators: `.name` and `.data_mode` are instance attributes (not fixed
class constants) that this composite updates after every call to reflect
what actually happened:

- `name`      -> "twelvedata_only" or "alphavantage", whichever vendor
                 actually answered the most recent call.
- `data_mode` -> "delayed" (fresh vendor response) or "cached" (served
                 from that vendor's local TTL cache), taken from whichever
                 sub-provider answered.

`get_universe()`/`get_ticker_meta()`/etc. read these off `provider.name`
and `provider.data_mode` after the call (see
`api/v1/endpoints/stocks.py::search_and_validate` for the existing
pattern) — no schema changes needed elsewhere for the live/delayed/cached
indicator to reach the API and, from there, the frontend's `DataBadge`.
The "offline" state (both vendors down) is already handled by the
existing `ProviderDataUnavailable` -> HTTP 503 `provider_unavailable`
degraded-mode path in `main.py`.
"""
from __future__ import annotations

import logging

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

logger = logging.getLogger(__name__)

__all__ = ["FallbackMarketDataProvider"]


class FallbackMarketDataProvider(MarketDataProvider):
    name = "twelvedata"
    data_mode = "unspecified"

    def __init__(
        self,
        primary: MarketDataProvider | None,
        fallback: MarketDataProvider | None,
        primary_unavailable_reason: str | None = None,
    ):
        # `primary` is None when TWELVE_DATA_API_KEY was never set — the
        # composite still works, it just goes straight to Alpha Vantage on
        # every call instead of failing to build entirely (mirrors how a
        # single provider degrades, but one level up).
        self._primary = primary
        self._fallback = fallback
        self._primary_unavailable_reason = primary_unavailable_reason or "Twelve Data is not configured"
        self.name = "twelvedata"
        self.data_mode = "unspecified"

    def _call(self, method: str, *args, **kwargs):
        if self._primary is None:
            primary_error: Exception = ProviderDataUnavailable(self._primary_unavailable_reason)
        else:
            try:
                result = getattr(self._primary, method)(*args, **kwargs)
                self.name = self._primary.name
                self.data_mode = getattr(self._primary, "data_mode", "unspecified")
                return result
            except ProviderDataUnavailable as exc:
                primary_error = exc

        logger.warning("TwelveData.%s failed, trying Alpha Vantage fallback: %s", method, primary_error)
        if self._fallback is None:
            raise ProviderDataUnavailable(
                f"Twelve Data failed ({primary_error}) and no Alpha Vantage fallback is "
                f"configured — set ALPHA_VANTAGE_API_KEY in .env."
            )
        try:
            result = getattr(self._fallback, method)(*args, **kwargs)
            self.name = self._fallback.name
            self.data_mode = getattr(self._fallback, "data_mode", "unspecified")
            return result
        except ProviderDataUnavailable as fallback_error:
                raise ProviderDataUnavailable(
                    f"Both market data providers failed for {method}: "
                    f"Twelve Data: {primary_error} | Alpha Vantage: {fallback_error}"
                )

    def get_universe(self, limit: int | None = None) -> list[TickerMeta]:
        return self._call("get_universe", limit)

    def get_ticker_meta(self, symbol: str) -> TickerMeta:
        return self._call("get_ticker_meta", symbol)

    def get_ohlcv(self, symbol: str, timeframe: str = "1d", lookback_days: int = 250) -> pd.DataFrame:
        return self._call("get_ohlcv", symbol, timeframe, lookback_days)

    def get_quote(self, symbol: str) -> Quote:
        return self._call("get_quote", symbol)

    def get_fundamentals(self, symbol: str) -> Fundamentals:
        return self._call("get_fundamentals", symbol)

    def get_news(self, symbol: str, limit: int = 20) -> list[NewsArticle]:
        return self._call("get_news", symbol, limit)

    def get_corporate_actions(self, symbol: str) -> list[CorporateAction]:
        return self._call("get_corporate_actions", symbol)


from app.services.data_providers.registry import register_provider  # noqa: E402
from app.services.data_providers.twelvedata_provider import TwelveDataProvider  # noqa: E402
from app.services.data_providers.alphavantage_provider import AlphaVantageProvider  # noqa: E402


@register_provider("twelvedata")
def _build_twelvedata_with_fallback(settings) -> FallbackMarketDataProvider:
    primary: TwelveDataProvider | None = None
    primary_unavailable_reason: str | None = None
    try:
        primary = TwelveDataProvider(
            settings.twelve_data_api_key,
            universe_limit=settings.universe_max_tickers,
        )
    except ProviderDataUnavailable as exc:
        # No TWELVE_DATA_API_KEY set — the composite still builds and goes
        # straight to Alpha Vantage on every call, rather than failing to
        # construct at all.
        primary_unavailable_reason = str(exc)

    fallback: AlphaVantageProvider | None = None
    try:
        if settings.alpha_vantage_api_key:
            fallback = AlphaVantageProvider(settings.alpha_vantage_api_key)
    except ProviderDataUnavailable:
        fallback = None

    return FallbackMarketDataProvider(primary, fallback, primary_unavailable_reason)
