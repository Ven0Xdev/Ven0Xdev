"""Alpha Vantage-backed market data provider (https://www.alphavantage.co/documentation/).

Used as the **fallback** vendor behind Twelve Data — see
`market_data_fallback.py`. Also directly selectable on its own via:

    MARKET_DATA_PROVIDER=alphavantage
    ALPHA_VANTAGE_API_KEY=<your key>

Honesty contract — what this provider does and does NOT supply:

- Live/EOD quotes (GLOBAL_QUOTE), daily OHLCV (TIME_SERIES_DAILY), company
  overview/fundamentals (OVERVIEW), news with real per-article sentiment
  scores (NEWS_SENTIMENT), and stock split history (SPLITS) are real Alpha
  Vantage data, mapped 1:1 — sentiment here is the vendor's own score, never
  keyword-guessed the way Finnhub's neutral placeholder is.
- Bid/ask depth is not returned by GLOBAL_QUOTE, so `Quote.bid/ask` are
  always None — never approximated.
- `get_universe()` intentionally raises `ProviderDataUnavailable`: Alpha
  Vantage's only bulk symbol-listing endpoint (LISTING_STATUS) returns CSV,
  not JSON, and is out of scope for this per-symbol fallback integration.
  Twelve Data (the primary) is the universe/scan source; Alpha Vantage's
  job is per-symbol quote/OHLCV/fundamentals/news when Twelve Data fails.
- Going-concern flags and dilution history are not derivable from OVERVIEW
  and are reported as explicit neutral defaults, exactly like Finnhub.

Operational behavior:

- Alpha Vantage returns HTTP 200 even on failure — errors surface as an
  "Error Message", "Note" (rate limit), or "Information" (plan/key issue)
  key *inside* an otherwise-200 JSON body. `_check_errors()` below inspects
  every payload for these before it's used, so a silently-empty or
  rate-limited response can never be mistaken for real data.
- A conservative token-bucket rate limiter (default 5 calls/min, matching
  the free-tier per-minute cap) plus a per-(endpoint, symbol) TTL cache.
  Alpha Vantage's free tier also caps total *daily* calls; that budget
  cannot be enforced by an in-process token bucket and is the operator's
  responsibility to respect.
- HTTP/network failures and in-body vendor errors both raise
  `ProviderDataUnavailable` — callers see an explicit error, never a
  silently empty or fabricated result.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
import pandas as pd

from app.services.data_providers.base import (
    CorporateAction,
    Fundamentals,
    MarketDataProvider,
    NewsArticle,
    Quote,
    TickerMeta,
)
from app.services.data_providers.http_base import (
    LOW_FREQUENCY_TTL_SECONDS,
    ProviderDataUnavailable,
    RateLimitedHttpClient,
)

logger = logging.getLogger(__name__)

_BASE_URL = "https://www.alphavantage.co"

__all__ = ["AlphaVantageProvider", "ProviderDataUnavailable"]


def _check_errors(payload: dict, vendor: str, context: str) -> None:
    """Alpha Vantage signals failure via JSON body keys on an HTTP 200
    response, never a non-200 status. Catch it here so a rate-limited or
    keyless response is never treated as real data."""
    if not isinstance(payload, dict):
        return
    for key in ("Error Message", "Note", "Information"):
        if payload.get(key):
            raise ProviderDataUnavailable(f"{vendor} {context}: {payload[key]}")


class AlphaVantageProvider(MarketDataProvider):
    name = "alphavantage"
    data_mode = "delayed"  # real market data; GLOBAL_QUOTE is not sub-second real-time

    def __init__(
        self,
        api_key: str | None,
        calls_per_minute: int = 5,
        cache_ttl_seconds: float = 300.0,
        transport: httpx.BaseTransport | None = None,
        redis_url: str | None = None,
    ):
        if not api_key:
            raise ProviderDataUnavailable(
                "ALPHA_VANTAGE_API_KEY is not set. Get a free key at "
                "https://www.alphavantage.co/support/#api-key and add it to .env."
            )
        from app.core.logging import register_secret

        register_secret(api_key)
        self._http = RateLimitedHttpClient(
            vendor="AlphaVantage",
            base_url=_BASE_URL,
            calls_per_minute=calls_per_minute,
            cache_ttl_seconds=cache_ttl_seconds,
            # Alpha Vantage's free API only accepts the key as a query
            # param (no header auth option). sanitize_url() redacts
            # "apikey" in every log line, so it never leaks.
            default_params={"apikey": api_key},
            transport=transport,
            # Shared across every container polling this same universe —
            # this is the provider that actually needs it: Alpha Vantage's
            # free tier is 25 requests/day *total*, not per-process. See
            # http_base.py's SharedCache/SharedRateLimiter docstrings.
            redis_url=redis_url,
        )
        # Updated after every successful call: "delayed" for a fresh vendor
        # response, "cached" when served from the local TTL cache — read by
        # the fallback composite (and directly by callers of this provider
        # alone) to render an honest live/delayed/cached indicator.
        self.data_mode = "delayed"

    # --- plumbing ---------------------------------------------------------
    def _get(self, params: dict, cache_key: tuple, context: str, ttl_seconds: float | None = None) -> dict:
        payload, from_cache = self._http.get_json_cached("/query", params, cache_key, ttl_seconds)
        _check_errors(payload, "AlphaVantage", context)
        self.data_mode = "cached" if from_cache else "delayed"
        return payload

    # --- universe / meta ----------------------------------------------------
    def get_universe(self, limit: int | None = None) -> list[TickerMeta]:
        raise ProviderDataUnavailable(
            "AlphaVantage's free API has no JSON bulk symbol-listing endpoint "
            "(LISTING_STATUS returns CSV, out of scope here) — it serves as a "
            "per-symbol fallback only. Universe/scan requests need Twelve Data "
            "(the primary provider) to be reachable."
        )

    def get_ticker_meta(self, symbol: str) -> TickerMeta:
        symbol = symbol.upper()
        # Company profile changes rarely — same long TTL as get_fundamentals
        # below, which hits this identical endpoint/cache key.
        overview = self._get(
            {"function": "OVERVIEW", "symbol": symbol}, ("overview", symbol), "OVERVIEW",
            ttl_seconds=LOW_FREQUENCY_TTL_SECONDS,
        )
        if not overview or not overview.get("Symbol"):
            raise ProviderDataUnavailable(f"AlphaVantage has no company overview for {symbol}")
        return TickerMeta(
            symbol=symbol,
            company_name=overview.get("Name") or symbol,
            tier=overview.get("Exchange") or "UNKNOWN",
            sector=overview.get("Sector") or "Unknown",
            industry=overview.get("Industry") or "Unknown",
            float_shares=float(overview.get("SharesFloat") or overview.get("SharesOutstanding") or 0),
            shares_outstanding=float(overview.get("SharesOutstanding") or 0),
            market_cap=float(overview.get("MarketCapitalization") or 0),
            reverse_split_count_3y=0,  # not available from OVERVIEW; see get_corporate_actions
        )

    # --- OHLCV ----------------------------------------------------------------
    def get_ohlcv(self, symbol: str, timeframe: str = "1d", lookback_days: int = 250) -> pd.DataFrame:
        symbol = symbol.upper()
        outputsize = "full" if lookback_days > 100 else "compact"
        payload = self._get(
            {"function": "TIME_SERIES_DAILY", "symbol": symbol, "outputsize": outputsize},
            ("daily", symbol, outputsize),
            "TIME_SERIES_DAILY",
        )
        series = payload.get("Time Series (Daily)")
        if not series:
            raise ProviderDataUnavailable(f"AlphaVantage has no daily series for {symbol}")

        rows = sorted(series.items())  # ISO date strings sort chronologically
        index = pd.to_datetime([d for d, _ in rows], utc=True)
        df = pd.DataFrame(
            {
                "open": [float(v["1. open"]) for _, v in rows],
                "high": [float(v["2. high"]) for _, v in rows],
                "low": [float(v["3. low"]) for _, v in rows],
                "close": [float(v["4. close"]) for _, v in rows],
                "volume": [float(v["5. volume"]) for _, v in rows],
            },
            index=pd.DatetimeIndex(index, name="ts"),
        )
        # No bid/ask columns: Alpha Vantage's daily series carries no quote depth.
        return df.tail(lookback_days)

    # --- quotes -----------------------------------------------------------------
    def get_quote(self, symbol: str) -> Quote:
        symbol = symbol.upper()
        payload = self._get(
            {"function": "GLOBAL_QUOTE", "symbol": symbol}, ("quote", symbol), "GLOBAL_QUOTE"
        )
        row = payload.get("Global Quote") or {}
        last = float(row.get("05. price") or 0)
        if last <= 0:
            raise ProviderDataUnavailable(f"AlphaVantage has no live quote for {symbol}")
        trading_day = row.get("07. latest trading day")
        timestamp = (
            datetime.strptime(trading_day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if trading_day
            else datetime.now(timezone.utc)
        )
        return Quote(
            symbol=symbol,
            last=last,
            timestamp=timestamp,
            bid=None,  # not supplied by GLOBAL_QUOTE — never approximated
            ask=None,
        )

    # --- fundamentals -------------------------------------------------------------
    def get_fundamentals(self, symbol: str) -> Fundamentals:
        symbol = symbol.upper()
        overview = self._get(
            {"function": "OVERVIEW", "symbol": symbol}, ("overview", symbol), "OVERVIEW",
            ttl_seconds=LOW_FREQUENCY_TTL_SECONDS,
        )
        if not overview or not overview.get("Symbol"):
            raise ProviderDataUnavailable(f"AlphaVantage has no company overview for {symbol}")
        shares_out = float(overview.get("SharesOutstanding") or 0)
        return Fundamentals(
            symbol=symbol,
            market_cap=float(overview.get("MarketCapitalization") or 0),
            float_shares=float(overview.get("SharesFloat") or shares_out),
            shares_outstanding=shares_out,
            cash=0.0,  # not exposed by OVERVIEW; would need the balance-sheet endpoint
            total_debt=0.0,  # same
            revenue_ttm=float(overview.get("RevenueTTM") or 0),
            net_income_ttm=0.0,  # OVERVIEW exposes margins, not absolute net income
            # Not derivable from OVERVIEW — explicit neutral defaults, same
            # honesty convention as the Finnhub adapter:
            dilution_12m_pct=0.0,
            going_concern_flag=False,
            last_filing_date=None,
            filing_delinquent=False,
        )

    # --- news -----------------------------------------------------------------------
    def get_news(self, symbol: str, limit: int = 20) -> list[NewsArticle]:
        symbol = symbol.upper()
        payload = self._get(
            {"function": "NEWS_SENTIMENT", "tickers": symbol, "limit": str(limit)},
            ("news", symbol, limit),
            "NEWS_SENTIMENT",
            ttl_seconds=LOW_FREQUENCY_TTL_SECONDS,
        )
        feed = payload.get("feed") or []
        articles = []
        for row in feed[:limit]:
            published = row.get("time_published")  # "YYYYMMDDTHHMMSS"
            try:
                published_at = datetime.strptime(published, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
            except (TypeError, ValueError):
                published_at = datetime.now(timezone.utc)
            source = row.get("source") or "unknown"
            articles.append(
                NewsArticle(
                    symbol=symbol,
                    published_at=published_at,
                    source=source,
                    headline=row.get("title") or "",
                    url=row.get("url") or "",
                    # Alpha Vantage's own sentiment model — real, not keyword-guessed.
                    sentiment=float(row.get("overall_sentiment_score") or 0.0),
                    is_press_release=source.lower() in {"prnewswire", "globenewswire", "businesswire"},
                    is_promotional=False,  # requires the platform's own promotion classifier
                )
            )
        return articles

    # --- corporate actions -------------------------------------------------------------
    def get_corporate_actions(self, symbol: str) -> list[CorporateAction]:
        symbol = symbol.upper()
        payload = self._get(
            {"function": "SPLITS", "symbol": symbol}, ("splits", symbol), "SPLITS",
            ttl_seconds=LOW_FREQUENCY_TTL_SECONDS,
        )
        actions = []
        for row in payload.get("data") or []:
            try:
                factor = float(row.get("split_factor") or 1)
                date = datetime.strptime(row["effective_date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except (TypeError, ValueError, KeyError):
                continue
            actions.append(
                CorporateAction(
                    symbol=symbol,
                    date=date,
                    action_type="reverse_split" if factor < 1 else "split",
                    details={"split_factor": row.get("split_factor")},
                )
            )
        return actions


from app.services.data_providers.registry import register_provider  # noqa: E402


@register_provider("alphavantage")
def _build_alphavantage(settings) -> AlphaVantageProvider:
    return AlphaVantageProvider(settings.alpha_vantage_api_key, redis_url=settings.redis_url)
