"""Alpaca Market Data API v2 provider — https://docs.alpaca.markets/docs/about-market-data-api

Market-data-only. This adapter never touches Alpaca's Trading API
(order placement, account/position endpoints) — only the read-only Data
API (`https://data.alpaca.markets`). ALPACA_API_KEY/ALPACA_API_SECRET
must be a PAPER account's key pair (paper-api.alpaca.markets), never a
live-trading key pair — enforced by operator discipline (documented in
.env.example), not by this code, since the Data API itself accepts either
kind of key identically.

Feed: hardcoded to IEX (`feed=iex` on every request) — the free tier on a
Basic Alpaca account. SIP (full consolidated tape) requires a paid
subscription; requesting it without one fails with a plan-gated 403,
exactly like Twelve Data's /statistics on a free key. IEX is real-time,
exchange-direct data, not delayed — data_mode is "live" here, distinct
from Twelve Data/Alpha Vantage's "delayed" EOD-oriented feeds (see
StockAnalysis.data_mode).

Honesty contract — what this provider does and does NOT supply:

- Quotes and daily OHLCV (via the snapshot and bars endpoints) are real
  Alpaca/IEX data, mapped 1:1 — including real bid/ask (unlike Twelve
  Data/Alpha Vantage's free plans, which never return quote depth).
- No company name, sector, market cap, share counts, fundamentals, or
  news are available from the Data API on a Basic plan — get_ticker_meta
  reports explicit honest placeholders (never fabricated), and
  get_fundamentals/get_news/get_corporate_actions raise
  ProviderDataUnavailable so the composite provider (see
  market_data_fallback.py's MixedSourceProvider) routes those to Alpha
  Vantage instead.
- get_universe() also raises ProviderDataUnavailable: a bulk US-equity
  listing lives on the separate Trading API base URL, out of scope for
  this data-only adapter — the composite falls back to Twelve Data's
  get_universe() for that, same mechanism as any other price-chain call.

Operational behavior:

- Auth is header-based (APCA-API-KEY-ID / APCA-API-SECRET-KEY) — the key
  never appears in a URL, so it can't leak via querystring logging the
  way Twelve Data's/Alpha Vantage's key-as-query-param scheme can.
- A token-bucket rate limiter (default 200 calls/min, Alpaca's documented
  Basic-plan cap) plus a per-(endpoint, symbol) TTL cache.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

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
    ProviderDataUnavailable,
    RateLimitedHttpClient,
)

_BASE_URL = "https://data.alpaca.markets"
_FEED = "iex"  # the only feed available on a free/Basic Alpaca account

__all__ = ["AlpacaProvider", "ProviderDataUnavailable"]


def _check_errors(payload, vendor: str, context: str) -> None:
    """Alpaca returns a JSON body with a "code"/"message" pair on failure,
    normally alongside a non-200 status (already handled by
    RateLimitedHttpClient) — this guards the rarer case of an in-body
    error on an otherwise-200 response, same discipline as every other
    adapter here."""
    if isinstance(payload, dict) and payload.get("code") and payload.get("message") and "symbol" not in payload:
        raise ProviderDataUnavailable(f"{vendor} {context}: {payload['message']}")


def _bars_to_df(bars: list[dict]) -> pd.DataFrame:
    """Shared mapping for both /bars (daily) and /bars?timeframe=1Min
    (intraday backfill) responses — identical field shape either way."""
    index = pd.to_datetime([b["t"] for b in bars], utc=True)
    return pd.DataFrame(
        {
            "open": [float(b["o"]) for b in bars],
            "high": [float(b["h"]) for b in bars],
            "low": [float(b["l"]) for b in bars],
            "close": [float(b["c"]) for b in bars],
            "volume": [float(b["v"]) for b in bars],
        },
        # No bid/ask columns: bars are trade-derived, not quote depth.
        index=pd.DatetimeIndex(index, name="ts"),
    )


class AlpacaProvider(MarketDataProvider):
    name = "alpaca"
    data_mode = "live"  # real-time IEX-direct data, not an EOD/delayed feed

    def __init__(
        self,
        api_key: str | None,
        api_secret: str | None,
        calls_per_minute: int = 200,
        cache_ttl_seconds: float = 15.0,
        transport: httpx.BaseTransport | None = None,
        redis_url: str | None = None,
    ):
        if not api_key or not api_secret:
            raise ProviderDataUnavailable(
                "ALPACA_API_KEY / ALPACA_API_SECRET are not set. Create a free PAPER account at "
                "https://alpaca.markets, generate a paper key pair (never a live-trading key pair), "
                "and add both to .env."
            )
        from app.core.logging import register_secret

        register_secret(api_key)
        register_secret(api_secret)
        self._http = RateLimitedHttpClient(
            vendor="Alpaca",
            base_url=_BASE_URL,
            calls_per_minute=calls_per_minute,
            cache_ttl_seconds=cache_ttl_seconds,
            # Header auth: the key/secret never appear in a URL, so there is
            # no querystring-logging leak path for this vendor at all.
            headers={"APCA-API-KEY-ID": api_key, "APCA-API-SECRET-KEY": api_secret},
            transport=transport,
            redis_url=redis_url,
        )
        self.data_mode = "live"

    # --- plumbing ---------------------------------------------------------
    def _get(self, path: str, params: dict, cache_key: tuple, context: str, ttl_seconds: float | None = None):
        payload, from_cache = self._http.get_json_cached(path, params, cache_key, ttl_seconds)
        _check_errors(payload, "Alpaca", context)
        # IEX is real-time — "cached" only means served from this
        # process/Redis's short TTL window, not that the underlying data is
        # stale/delayed the way a vendor-side EOD cache would be.
        self.data_mode = "cached" if from_cache else "live"
        return payload

    # --- universe / meta ----------------------------------------------------
    def get_universe(self, limit: int | None = None) -> list[TickerMeta]:
        raise ProviderDataUnavailable(
            "Alpaca's Data API has no bulk symbol-listing endpoint — that lives on the separate "
            "Trading API (out of scope for this market-data-only adapter). Universe/scan requests "
            "fall back to Twelve Data when Alpaca is the primary provider."
        )

    def get_ticker_meta(self, symbol: str) -> TickerMeta:
        symbol = symbol.upper()
        payload = self._get(
            f"/v2/stocks/{symbol}/snapshot", {"feed": _FEED}, ("snapshot_meta", symbol), "snapshot"
        )
        if not payload or not payload.get("latestTrade"):
            raise ProviderDataUnavailable(f"Alpaca has no data for {symbol} on the {_FEED} feed")
        # Alpaca's Data API (Basic plan) has no company-profile fields at
        # all — company_name/sector/market_cap/share counts are explicit
        # honest placeholders, never fabricated, same convention as Twelve
        # Data's own get_ticker_meta.
        return TickerMeta(
            symbol=symbol,
            company_name=symbol,
            tier=_FEED.upper(),
            sector="Unknown",
            industry="Unknown",
            float_shares=0.0,
            shares_outstanding=0.0,
            market_cap=0.0,
            reverse_split_count_3y=0,
        )

    # --- OHLCV ----------------------------------------------------------------
    def get_ohlcv(self, symbol: str, timeframe: str = "1d", lookback_days: int = 250) -> pd.DataFrame:
        # Every real adapter in this codebase serves daily bars regardless
        # of the `timeframe` argument (see twelvedata_provider.py/
        # alphavantage_provider.py/finnhub_provider.py) — matching that
        # existing convention rather than inventing per-adapter behavior.
        symbol = symbol.upper()
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=int(lookback_days * 1.6) + 10)  # calendar padding for weekends/holidays
        payload = self._get(
            f"/v2/stocks/{symbol}/bars",
            {
                "timeframe": "1Day",
                "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "feed": _FEED,
                "limit": "10000",
                "adjustment": "split",
            },
            ("bars", symbol, lookback_days),
            "bars",
        )
        bars = payload.get("bars")
        if not bars:
            raise ProviderDataUnavailable(f"Alpaca has no daily bars for {symbol} on the {_FEED} feed")
        return _bars_to_df(bars).tail(lookback_days)

    # --- intraday backfill ---------------------------------------------------
    def get_intraday_bars(self, symbol: str, lookback_minutes: int = 390) -> pd.DataFrame:
        """Real 1-minute bars for chart backfill (services/signals/engine.py
        merges these with whatever the live stream has accumulated so far).
        390 minutes is one regular NYSE session (9:30-16:00 ET).

        Returns the most recent `lookback_minutes` real trading bars by
        COUNT, not a wall-clock cutoff — a wall-clock "no older than N
        minutes ago" filter is wrong across any gap longer than N minutes
        (every weekend, holiday, and every overnight before the next
        session opens): during pre-market, the most recent real data is
        necessarily from the prior session's close, which is always more
        than a few hundred *calendar* minutes in the past despite being
        exactly the right data to backfill with. Same reasoning get_ohlcv
        above already applies via `.tail(lookback_days)`.
        """
        symbol = symbol.upper()
        now = datetime.now(timezone.utc)
        # 4 calendar days of padding safely covers a long weekend/holiday
        # combo — the feed itself only ever returns real trading minutes,
        # and the .tail() below trims to the actually-requested count.
        start = now - timedelta(minutes=lookback_minutes) - timedelta(days=4)
        payload = self._get(
            f"/v2/stocks/{symbol}/bars",
            {
                "timeframe": "1Min",
                "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "feed": _FEED,
                "limit": "10000",
                "adjustment": "split",
            },
            ("intraday_bars", symbol, lookback_minutes),
            "bars",
        )
        bars = payload.get("bars")
        if not bars:
            raise ProviderDataUnavailable(f"Alpaca has no intraday bars for {symbol} on the {_FEED} feed")
        return _bars_to_df(bars).tail(lookback_minutes)

    # --- quotes -----------------------------------------------------------------
    def get_quote(self, symbol: str) -> Quote:
        symbol = symbol.upper()
        # One snapshot call gets both the latest trade (for `last`) and the
        # latest quote (for real bid/ask) — cheaper than two separate calls
        # for the same information a real vendor would otherwise need.
        payload = self._get(
            f"/v2/stocks/{symbol}/snapshot", {"feed": _FEED}, ("snapshot", symbol), "snapshot",
        )
        trade = payload.get("latestTrade") or {}
        quote = payload.get("latestQuote") or {}
        last = float(trade.get("p") or 0)
        if last <= 0:
            raise ProviderDataUnavailable(f"Alpaca has no live trade for {symbol} on the {_FEED} feed")
        ts_raw = trade.get("t")
        try:
            timestamp = datetime.strptime(ts_raw[:26], "%Y-%m-%dT%H:%M:%S.%f").replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            timestamp = datetime.now(timezone.utc)
        bid = float(quote["bp"]) if quote.get("bp") else None
        ask = float(quote["ap"]) if quote.get("ap") else None
        return Quote(
            symbol=symbol,
            last=last,
            timestamp=timestamp,
            bid=bid,
            ask=ask,
            bid_size=float(quote["bs"]) if quote.get("bs") else None,
            ask_size=float(quote["as"]) if quote.get("as") else None,
        )

    # --- fundamentals / news / corporate actions ---------------------------
    # None of these are available on Alpaca's Data API (Basic plan) — the
    # composite provider (MixedSourceProvider) routes them to Alpha Vantage
    # instead of falling back through here. Implemented to fail honestly
    # for the rare case this adapter is selected standalone (alpaca_only).
    def get_fundamentals(self, symbol: str) -> Fundamentals:
        raise ProviderDataUnavailable(
            "Alpaca's Data API does not provide fundamentals on this plan — configure "
            "ALPHA_VANTAGE_API_KEY for fundamentals."
        )

    def get_news(self, symbol: str, limit: int = 20) -> list[NewsArticle]:
        raise ProviderDataUnavailable(
            "This adapter does not fetch news from Alpaca — configure ALPHA_VANTAGE_API_KEY for news."
        )

    def get_corporate_actions(self, symbol: str) -> list[CorporateAction]:
        raise ProviderDataUnavailable(
            "Alpaca's Corporate Actions API is not available on a Basic/free plan — configure "
            "ALPHA_VANTAGE_API_KEY for split history."
        )


from app.services.data_providers.registry import register_provider  # noqa: E402


@register_provider("alpaca_only")
def _build_alpaca_only(settings) -> AlpacaProvider:
    return AlpacaProvider(settings.alpaca_api_key, settings.alpaca_api_secret, redis_url=settings.redis_url)


@register_provider("alpaca")
def _build_alpaca_with_fallback(settings):
    """Alpaca (IEX) primary for prices, Twelve Data fallback for prices,
    Alpha Vantage the sole source for fundamentals/news/corporate actions
    (long-TTL cached — see http_base.LOW_FREQUENCY_TTL_SECONDS). This is
    the recommended `MARKET_DATA_PROVIDER=alpaca` config; `alpaca_only`
    above is Alpaca alone with no fallback at all.
    """
    from app.services.data_providers.alphavantage_provider import AlphaVantageProvider
    from app.services.data_providers.market_data_fallback import (
        FallbackMarketDataProvider,
        MixedSourceProvider,
    )
    from app.services.data_providers.twelvedata_provider import TwelveDataProvider

    alpaca: AlpacaProvider | None = None
    alpaca_unavailable_reason: str | None = None
    try:
        alpaca = AlpacaProvider(settings.alpaca_api_key, settings.alpaca_api_secret, redis_url=settings.redis_url)
    except ProviderDataUnavailable as exc:
        alpaca_unavailable_reason = str(exc)

    twelvedata: TwelveDataProvider | None = None
    if settings.twelve_data_api_key:
        try:
            twelvedata = TwelveDataProvider(
                settings.twelve_data_api_key,
                universe_limit=settings.universe_max_tickers,
                redis_url=settings.redis_url,
            )
        except ProviderDataUnavailable:
            twelvedata = None

    price_chain = FallbackMarketDataProvider(
        alpaca, twelvedata, primary_unavailable_reason=alpaca_unavailable_reason, name="alpaca",
        primary_label="Alpaca", fallback_label="Twelve Data",
    )

    reference: AlphaVantageProvider | None = None
    if settings.alpha_vantage_api_key:
        try:
            reference = AlphaVantageProvider(settings.alpha_vantage_api_key, redis_url=settings.redis_url)
        except ProviderDataUnavailable:
            reference = None

    return MixedSourceProvider(price_chain, reference)
