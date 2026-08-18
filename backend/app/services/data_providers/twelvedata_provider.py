"""Twelve Data-backed market data provider (https://twelvedata.com/docs).

This is the **primary** vendor behind the "twelvedata" registry name — see
`market_data_fallback.py`, which wraps this class with an Alpha Vantage
fallback. It can also be selected on its own, with no fallback, via:

    MARKET_DATA_PROVIDER=twelvedata_only
    TWELVE_DATA_API_KEY=<your key>

Honesty contract — what this provider does and does NOT supply:

- Quotes (/quote), daily OHLCV (/time_series), and a real US-exchange
  symbol universe (/stocks) are real Twelve Data data, mapped 1:1.
- Bid/ask depth is not returned by /quote on the free plan, so
  `Quote.bid/ask` are always None — never approximated.
- Fundamentals (/statistics) and split history (/splits) are wired to the
  real endpoints, but both require a paid Twelve Data plan; on a free key
  they fail with an explicit `ProviderDataUnavailable` (HTTP 403 from the
  vendor), never silently empty data. The fallback composite treats that
  exactly like any other primary failure and tries Alpha Vantage next.
- Twelve Data's core API has no news endpoint (that's a separate paid
  product) — `get_news()` always raises `ProviderDataUnavailable` so the
  fallback composite routes news requests to Alpha Vantage, which has one.

Operational behavior:

- A token-bucket rate limiter (default 8 calls/min, the free-tier cap) plus
  a per-(endpoint, symbol) TTL cache.
- Twelve Data mostly maps errors to real HTTP status codes, but some (e.g.
  unknown symbol) come back as HTTP 200 with a `{"status": "error", ...}`
  body — `_check_errors()` inspects every payload so that case is never
  mistaken for real data.
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

_BASE_URL = "https://api.twelvedata.com"

__all__ = ["ProviderDataUnavailable", "TwelveDataProvider"]


def _check_errors(payload, vendor: str, context: str) -> None:
    """Twelve Data usually maps errors to real HTTP status codes (handled by
    RateLimitedHttpClient), but some failures (unknown symbol, bad params)
    come back as HTTP 200 with a `status: "error"` body instead."""
    if isinstance(payload, dict) and payload.get("status") == "error":
        message = payload.get("message") or "unknown error"
        raise ProviderDataUnavailable(f"{vendor} {context}: {message}")


class TwelveDataProvider(MarketDataProvider):
    name = "twelvedata_only"
    data_mode = "delayed"  # real market data; free plan is not sub-second real-time

    def __init__(
        self,
        api_key: str | None,
        calls_per_minute: int = 8,
        cache_ttl_seconds: float = 300.0,
        universe_limit: int = 500,
        transport: httpx.BaseTransport | None = None,
        redis_url: str | None = None,
    ):
        if not api_key:
            raise ProviderDataUnavailable(
                "TWELVE_DATA_API_KEY is not set. Get a free key at "
                "https://twelvedata.com/pricing and add it to .env."
            )
        from app.core.logging import register_secret

        register_secret(api_key)
        self._http = RateLimitedHttpClient(
            vendor="TwelveData",
            base_url=_BASE_URL,
            calls_per_minute=calls_per_minute,
            cache_ttl_seconds=cache_ttl_seconds,
            # Twelve Data's API only accepts the key as a query param (no
            # header auth option). sanitize_url() redacts "apikey" in every
            # log line, so it never leaks.
            default_params={"apikey": api_key},
            transport=transport,
            # Shared across every container (api/prediction-logger/scanner)
            # polling this same 20-symbol universe — see http_base.py's
            # SharedCache/SharedRateLimiter docstrings. None (unset Redis)
            # degrades to this process's own cache/limiter, same as before.
            redis_url=redis_url,
        )
        self._universe_limit = universe_limit
        # Updated after every successful call: "delayed" for a fresh vendor
        # response, "cached" when served from the local TTL cache — read by
        # the fallback composite to render an honest live/delayed/cached
        # indicator.
        self.data_mode = "delayed"

    # --- plumbing ---------------------------------------------------------
    def _get(self, path: str, params: dict, cache_key: tuple, context: str, ttl_seconds: float | None = None):
        payload, from_cache = self._http.get_json_cached(path, params, cache_key, ttl_seconds)
        _check_errors(payload, "TwelveData", context)
        self.data_mode = "cached" if from_cache else "delayed"
        return payload

    # --- universe / meta ----------------------------------------------------
    def get_universe(self, limit: int | None = None) -> list[TickerMeta]:
        payload = self._get(
            "/stocks",
            {"exchange": "NASDAQ", "country": "United States", "type": "Common Stock"},
            ("universe",),
            "/stocks",
        )
        rows = payload.get("data") or []
        cap = min(limit or self._universe_limit, self._universe_limit)
        return [
            TickerMeta(
                symbol=row["symbol"],
                company_name=row.get("name") or row["symbol"],
                tier=row.get("exchange", "NASDAQ"),
                sector="Unknown",
                industry="Unknown",
                float_shares=0.0,
                shares_outstanding=0.0,
                market_cap=0.0,
                reverse_split_count_3y=0,
            )
            for row in rows[:cap]
        ]

    def get_ticker_meta(self, symbol: str) -> TickerMeta:
        symbol = symbol.upper()
        quote = self._get("/quote", {"symbol": symbol}, ("quote_meta", symbol), "/quote")
        if not quote or not quote.get("symbol"):
            raise ProviderDataUnavailable(f"TwelveData has no profile for {symbol}")
        return TickerMeta(
            symbol=symbol,
            company_name=quote.get("name") or symbol,
            tier=quote.get("exchange") or "UNKNOWN",
            sector="Unknown",  # not returned by /quote; /statistics has it but is paid-plan only
            industry="Unknown",
            float_shares=0.0,
            shares_outstanding=0.0,
            market_cap=0.0,
            reverse_split_count_3y=0,
        )

    # --- OHLCV ----------------------------------------------------------------
    def get_ohlcv(self, symbol: str, timeframe: str = "1d", lookback_days: int = 250) -> pd.DataFrame:
        symbol = symbol.upper()
        payload = self._get(
            "/time_series",
            {"symbol": symbol, "interval": "1day", "outputsize": str(min(lookback_days, 5000))},
            ("time_series", symbol, lookback_days),
            "/time_series",
        )
        values = payload.get("values")
        if not values:
            raise ProviderDataUnavailable(f"TwelveData has no daily series for {symbol}")

        rows = sorted(values, key=lambda v: v["datetime"])  # vendor returns newest-first
        index = pd.to_datetime([v["datetime"] for v in rows], utc=True)
        df = pd.DataFrame(
            {
                "open": [float(v["open"]) for v in rows],
                "high": [float(v["high"]) for v in rows],
                "low": [float(v["low"]) for v in rows],
                "close": [float(v["close"]) for v in rows],
                "volume": [float(v.get("volume") or 0) for v in rows],
            },
            index=pd.DatetimeIndex(index, name="ts"),
        )
        # No bid/ask columns: /time_series carries no quote depth.
        return df.tail(lookback_days)

    # --- quotes -----------------------------------------------------------------
    def get_quote(self, symbol: str) -> Quote:
        symbol = symbol.upper()
        payload = self._get("/quote", {"symbol": symbol}, ("quote", symbol), "/quote")
        last = float(payload.get("close") or 0)
        if last <= 0:
            raise ProviderDataUnavailable(f"TwelveData has no live quote for {symbol}")
        ts = payload.get("timestamp")
        return Quote(
            symbol=symbol,
            last=last,
            timestamp=datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else datetime.now(timezone.utc),
            bid=None,  # not supplied by /quote on the free plan — never approximated
            ask=None,
        )

    # --- fundamentals -------------------------------------------------------------
    def get_fundamentals(self, symbol: str) -> Fundamentals:
        symbol = symbol.upper()
        payload = self._get(
            "/statistics", {"symbol": symbol}, ("statistics", symbol), "/statistics",
            ttl_seconds=LOW_FREQUENCY_TTL_SECONDS,
        )
        stats = payload.get("statistics") or {}
        valuations = stats.get("valuations_metrics") or {}
        stock_stats = stats.get("stock_statistics") or {}
        income = ((stats.get("financials") or {}).get("income_statement") or {})
        shares_out = float(stock_stats.get("shares_outstanding") or 0)
        return Fundamentals(
            symbol=symbol,
            market_cap=float(valuations.get("market_capitalization") or 0),
            float_shares=float(stock_stats.get("shares_float") or shares_out),
            shares_outstanding=shares_out,
            cash=0.0,  # balance-sheet detail not in /statistics' top-level summary
            total_debt=0.0,
            revenue_ttm=float(income.get("revenue_ttm") or 0),
            net_income_ttm=float(income.get("net_income_ttm") or 0),
            # Not derivable from /statistics — explicit neutral defaults,
            # same honesty convention as the Finnhub/Alpha Vantage adapters:
            dilution_12m_pct=0.0,
            going_concern_flag=False,
            last_filing_date=None,
            filing_delinquent=False,
        )

    # --- news -----------------------------------------------------------------------
    def get_news(self, symbol: str, limit: int = 20) -> list[NewsArticle]:
        # Twelve Data's core API has no news endpoint (it's a separate paid
        # product) — the fallback composite routes news to Alpha Vantage.
        raise ProviderDataUnavailable(
            "TwelveData's core API does not include a news endpoint on this plan."
        )

    # --- corporate actions -------------------------------------------------------------
    def get_corporate_actions(self, symbol: str) -> list[CorporateAction]:
        symbol = symbol.upper()
        payload = self._get(
            "/splits", {"symbol": symbol}, ("splits", symbol), "/splits",
            ttl_seconds=LOW_FREQUENCY_TTL_SECONDS,
        )
        actions = []
        for row in payload.get("splits") or []:
            try:
                from_factor = float(row.get("from_factor") or 1)
                to_factor = float(row.get("to_factor") or 1)
                date = datetime.strptime(row["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except (TypeError, ValueError, KeyError):
                continue
            actions.append(
                CorporateAction(
                    symbol=symbol,
                    date=date,
                    action_type="reverse_split" if to_factor < from_factor else "split",
                    details={"from_factor": row.get("from_factor"), "to_factor": row.get("to_factor")},
                )
            )
        return actions


from app.services.data_providers.registry import register_provider  # noqa: E402


@register_provider("twelvedata_only")
def _build_twelvedata_only(settings) -> TwelveDataProvider:
    return TwelveDataProvider(
        settings.twelve_data_api_key,
        universe_limit=settings.universe_max_tickers,
        redis_url=settings.redis_url,
    )
