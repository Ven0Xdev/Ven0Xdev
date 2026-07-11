"""Finnhub-backed market data provider (https://finnhub.io/docs/api).

Activated by setting in `.env`:

    MARKET_DATA_PROVIDER=finnhub
    FINNHUB_API_KEY=<your key>

Honesty contract — what this provider does and does NOT supply:

- OHLCV daily candles, live quotes, company profile, and company news are
  real Finnhub data, mapped 1:1.
- Bid/ask depth is NOT available on Finnhub's standard endpoints, so
  `Quote.bid/ask` are None and OHLCV frames carry no bid/ask columns.
  Spread-dependent features run in reduced-information mode (documented in
  `services/features/technical.py`) — nothing is approximated or invented.
- Dilution history, going-concern flags, and filing delinquency are NOT
  derivable from Finnhub. They are reported as explicit neutral defaults
  (0 dilution, no flags) and the fundamentals object should be treated as
  partial until the SEC EDGAR integration lands. The manipulation detector
  still runs fully on the price/volume/news channels it does have.
- Per-article sentiment is left neutral (0.0) until a real text classifier
  is wired in; headlines are never scored by keyword guessing here.

Operational behavior:

- A token-bucket rate limiter (default 55 calls/min, under Finnhub's free
  60/min) makes the provider safe to point the whole scan pipeline at
  without tripping 429s.
- A per-(endpoint, symbol) TTL cache collapses the many calls per scan
  cycle into one upstream request per fact per TTL window.
- HTTP failures raise `ProviderDataUnavailable` with the upstream status —
  callers see an explicit error, never silently empty data.
"""
from __future__ import annotations

import logging
import threading
import time
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

logger = logging.getLogger(__name__)

_BASE_URL = "https://finnhub.io/api/v1"
_OTC_MICS = {"OOTC", "OTCM", "OTCB", "OTCQ", "PSGM", "PINX"}


class ProviderDataUnavailable(RuntimeError):
    """Raised when the vendor cannot supply the requested data."""


class _TokenBucket:
    def __init__(self, calls_per_minute: int):
        self.capacity = calls_per_minute
        self.tokens = float(calls_per_minute)
        self.fill_rate = calls_per_minute / 60.0
        self.last = time.monotonic()
        self.lock = threading.Lock()

    def acquire(self) -> None:
        while True:
            with self.lock:
                now = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.fill_rate)
                self.last = now
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
                wait = (1 - self.tokens) / self.fill_rate
            time.sleep(wait)


class _TTLCache:
    def __init__(self, ttl_seconds: float):
        self.ttl = ttl_seconds
        self.store: dict = {}
        self.lock = threading.Lock()

    def get(self, key):
        with self.lock:
            hit = self.store.get(key)
            if hit and time.monotonic() - hit[0] < self.ttl:
                return hit[1]
        return None

    def put(self, key, value):
        with self.lock:
            self.store[key] = (time.monotonic(), value)


class FinnhubProvider(MarketDataProvider):
    name = "finnhub"

    def __init__(
        self,
        api_key: str | None,
        calls_per_minute: int = 55,
        cache_ttl_seconds: float = 300.0,
        universe_limit: int = 500,
        transport: httpx.BaseTransport | None = None,
    ):
        if not api_key:
            raise ProviderDataUnavailable(
                "FINNHUB_API_KEY is not set. Get a free key at https://finnhub.io and add it to .env."
            )
        self._client = httpx.Client(
            base_url=_BASE_URL,
            params={"token": api_key},
            timeout=20.0,
            transport=transport,
        )
        self._bucket = _TokenBucket(calls_per_minute)
        self._cache = _TTLCache(cache_ttl_seconds)
        self._universe_limit = universe_limit

    # --- plumbing ---------------------------------------------------------
    def _get(self, path: str, params: dict | None = None, cache_key: tuple | None = None):
        if cache_key is not None:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached

        self._bucket.acquire()
        response = self._client.get(path, params=params or {})
        if response.status_code == 429:
            raise ProviderDataUnavailable("Finnhub rate limit exceeded (HTTP 429) — lower calls_per_minute.")
        if response.status_code == 403:
            raise ProviderDataUnavailable(
                f"Finnhub returned 403 for {path} — this endpoint is not included in the current plan."
            )
        if response.status_code != 200:
            raise ProviderDataUnavailable(f"Finnhub {path} failed: HTTP {response.status_code}")

        payload = response.json()
        if cache_key is not None:
            self._cache.put(cache_key, payload)
        return payload

    # --- universe / meta ----------------------------------------------------
    def get_universe(self, limit: int | None = None) -> list[TickerMeta]:
        payload = self._get("/stock/symbol", {"exchange": "US"}, cache_key=("universe",))
        otc = [row for row in payload if row.get("mic") in _OTC_MICS]
        cap = min(limit or self._universe_limit, self._universe_limit)
        return [
            TickerMeta(
                symbol=row["symbol"],
                company_name=row.get("description") or row["symbol"],
                tier=row.get("mic", "OTC"),
                sector="Unknown",
                industry="Unknown",
                float_shares=0.0,
                shares_outstanding=0.0,
                market_cap=0.0,
                reverse_split_count_3y=0,
            )
            for row in otc[:cap]
        ]

    def get_ticker_meta(self, symbol: str) -> TickerMeta:
        symbol = symbol.upper()
        profile = self._get("/stock/profile2", {"symbol": symbol}, cache_key=("profile", symbol))
        if not profile:
            raise ProviderDataUnavailable(f"Finnhub has no profile for {symbol}")
        shares_out = float(profile.get("shareOutstanding") or 0) * 1_000_000
        return TickerMeta(
            symbol=symbol,
            company_name=profile.get("name") or symbol,
            tier=profile.get("exchange") or "OTC",
            sector=profile.get("finnhubIndustry") or "Unknown",
            industry=profile.get("finnhubIndustry") or "Unknown",
            float_shares=shares_out,  # Finnhub exposes outstanding, not float; float requires EDGAR
            shares_outstanding=shares_out,
            market_cap=float(profile.get("marketCapitalization") or 0) * 1_000_000,
            reverse_split_count_3y=0,  # not available from Finnhub; EDGAR integration
        )

    # --- OHLCV ----------------------------------------------------------------
    def get_ohlcv(self, symbol: str, timeframe: str = "1d", lookback_days: int = 250) -> pd.DataFrame:
        symbol = symbol.upper()
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=int(lookback_days * 1.5))  # calendar padding for weekends
        payload = self._get(
            "/stock/candle",
            {
                "symbol": symbol,
                "resolution": "D",
                "from": int(start.timestamp()),
                "to": int(now.timestamp()),
            },
            cache_key=("candle", symbol, lookback_days),
        )
        if payload.get("s") != "ok" or not payload.get("t"):
            raise ProviderDataUnavailable(f"Finnhub has no candle data for {symbol}")

        index = pd.to_datetime(payload["t"], unit="s", utc=True)
        df = pd.DataFrame(
            {
                "open": payload["o"],
                "high": payload["h"],
                "low": payload["l"],
                "close": payload["c"],
                "volume": payload["v"],
            },
            index=pd.DatetimeIndex(index, name="ts"),
        )
        # No bid/ask columns on purpose: Finnhub candles carry no quote depth.
        return df.tail(lookback_days)

    # --- quotes -----------------------------------------------------------------
    def get_quote(self, symbol: str) -> Quote:
        symbol = symbol.upper()
        payload = self._get("/quote", {"symbol": symbol}, cache_key=("quote", symbol))
        last = float(payload.get("c") or 0)
        if last <= 0:
            raise ProviderDataUnavailable(f"Finnhub has no live quote for {symbol}")
        ts = payload.get("t") or 0
        return Quote(
            symbol=symbol,
            last=last,
            timestamp=datetime.fromtimestamp(ts, tz=timezone.utc) if ts else datetime.now(timezone.utc),
            bid=None,   # not supplied by Finnhub — never approximated
            ask=None,
        )

    # --- fundamentals -------------------------------------------------------------
    def get_fundamentals(self, symbol: str) -> Fundamentals:
        symbol = symbol.upper()
        meta = self.get_ticker_meta(symbol)
        metrics = self._get(
            "/stock/metric", {"symbol": symbol, "metric": "all"}, cache_key=("metric", symbol)
        ).get("metric", {})

        revenue = float(metrics.get("revenuePerShareTTM") or 0) * (meta.shares_outstanding or 0)
        net_margin = float(metrics.get("netProfitMarginTTM") or 0) / 100
        return Fundamentals(
            symbol=symbol,
            market_cap=meta.market_cap,
            float_shares=meta.float_shares,
            shares_outstanding=meta.shares_outstanding,
            cash=float(metrics.get("cashPerSharePerShareTTM") or metrics.get("cashPerShareTTM") or 0)
            * (meta.shares_outstanding or 0),
            total_debt=0.0,  # Finnhub exposes only debt *ratios*; absolute debt needs EDGAR
            revenue_ttm=revenue,
            net_income_ttm=revenue * net_margin,
            # Not derivable from Finnhub — explicit neutral defaults, treated
            # as partial data until the SEC EDGAR integration:
            dilution_12m_pct=0.0,
            going_concern_flag=False,
            last_filing_date=None,
            filing_delinquent=False,
        )

    # --- news -----------------------------------------------------------------------
    def get_news(self, symbol: str, limit: int = 20) -> list[NewsArticle]:
        symbol = symbol.upper()
        now = datetime.now(timezone.utc)
        payload = self._get(
            "/company-news",
            {
                "symbol": symbol,
                "from": (now - timedelta(days=30)).strftime("%Y-%m-%d"),
                "to": now.strftime("%Y-%m-%d"),
            },
            cache_key=("news", symbol),
        )
        articles = []
        for row in payload[:limit]:
            articles.append(
                NewsArticle(
                    symbol=symbol,
                    published_at=datetime.fromtimestamp(row.get("datetime", 0), tz=timezone.utc),
                    source=row.get("source") or "unknown",
                    headline=row.get("headline") or "",
                    url=row.get("url") or "",
                    sentiment=0.0,  # neutral until a real text classifier is integrated
                    is_press_release=(row.get("source") or "").lower() in {"prnewswire", "globenewswire", "businesswire"},
                    is_promotional=False,  # requires the promotion classifier; never keyword-guessed
                )
            )
        return articles

    # --- corporate actions -------------------------------------------------------------
    def get_corporate_actions(self, symbol: str) -> list[CorporateAction]:
        # Split/dilution history is not on Finnhub's standard plan; the SEC
        # EDGAR integration is the correct source. Empty = "no data", and the
        # manipulation detector treats it as such rather than "no risk".
        return []
