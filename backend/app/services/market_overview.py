"""Lightweight quote-level market overview for the Asset Universe Manager's
active assets (dashboard's "Market overview" section) — deliberately
separate from the OTC scanner's universe/`MarketDataProvider.get_universe()`,
which is a different, unrelated list of synthetic micro-cap tickers.

The universe (which symbols, their display names/asset types) comes from
`services/universe/manager.py` — the single source of truth added in the
multi-asset migration. This module only adds live-quote logic on top.

Provider chain per symbol, cheapest and most honest first:
1. The app's configured real provider (Twelve Data with Alpha Vantage
   fallback, or whichever `MARKET_DATA_PROVIDER` is set) — real quote +
   daily history.
2. If that provider can't serve the symbol at all (unconfigured, vendor
   down/rate-limited, or — the common local-dev case — the mock provider,
   whose OTC-only universe doesn't include large caps) a clearly labeled,
   deterministic (seeded, never random) synthetic quote for *that symbol
   only*, using the real display name from the Asset Universe Manager. It
   is always tagged data_mode="synthetic" and a `note` field flags it as
   demo data — never presented as live, matching the platform's
   no-fabricated-market-data rule everywhere else.

Change/percent-change are computed from real OHLCV history (last close vs.
prior close), never invented outright.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

import numpy as np
from sqlalchemy.orm import Session

from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.universe.manager import get_active_universe

logger = logging.getLogger(__name__)

_NY = ZoneInfo("America/New_York")


def market_status(now: datetime | None = None) -> str:
    """Regular NYSE session hours (9:30-16:00 America/New_York, Mon-Fri) —
    a real computation from the current time, not a fabricated value.
    Deliberately does not account for market holidays (documented
    limitation, not silently pretended away): a holiday will show
    "open"/"closed" purely by hour/weekday.
    """
    now = (now or datetime.now(timezone.utc)).astimezone(_NY)
    if now.weekday() >= 5:
        return "closed"
    t = now.time()
    if time(9, 30) <= t < time(16, 0):
        return "open"
    if time(4, 0) <= t < time(9, 30):
        return "pre-market"
    if time(16, 0) <= t < time(20, 0):
        return "after-hours"
    return "closed"


def _seed_for(symbol: str) -> int:
    return int(hashlib.sha256(f"overview::{symbol}".encode()).hexdigest(), 16) % (2**32)


def _classify_failure(exc: Exception | None) -> str:
    """Maps the provider's own typed error message (see http_base.py's
    RateLimitedHttpClient, which already distinguishes these cases) to one
    of the plain states the UI should show — never a generic catch-all when
    the real cause is known."""
    if exc is None:
        return "No live provider configured for this symbol"
    text = str(exc).lower()
    if "rate limit" in text:
        return "API rate limit reached"
    if "api key" in text or "is not set" in text:
        return "Missing API key"
    if "timed out" in text or "connection failed" in text:
        return "Provider connection timed out"
    if "not included in the current plan" in text or "not available" in text:
        return "Not available on the current plan"
    return "Data unavailable"


def _synthetic_quote(symbol: str, company_name: str, reason: str) -> dict:
    """Deterministic, seeded-on-symbol demo values — same value every call,
    never random per the platform's honesty rule. Used only when no real
    provider can serve this symbol. `company_name` comes from the Asset
    Universe Manager's real record, never invented here."""
    rng = np.random.default_rng(_seed_for(symbol))
    base_price = float(rng.uniform(20, 500))
    n = 30
    log_returns = rng.normal(0.0003, 0.018, n)
    closes = base_price * np.exp(np.cumsum(log_returns))
    prev_close = float(closes[-2])
    last = float(closes[-1])
    volume = float(rng.uniform(5_000_000, 80_000_000))
    return {
        "symbol": symbol,
        "company_name": company_name,
        "current_price": round(last, 2),
        "change": round(last - prev_close, 2),
        "change_percent": round((last / prev_close - 1) * 100, 2) if prev_close else 0.0,
        "volume": volume,
        "market_status": market_status(),
        "chart_history": [round(c, 2) for c in closes[-20:]],
        "data_source": "demo-fallback",
        "data_mode": "synthetic",
        "status": "ok",
        "note": f"{reason} — showing local demo data, not real market data.",
    }


def _real_quote(provider: MarketDataProvider, symbol: str) -> dict:
    meta = provider.get_ticker_meta(symbol)
    quote = provider.get_quote(symbol)
    df = provider.get_ohlcv(symbol, lookback_days=30)

    prev_close = float(df["close"].iloc[-2]) if len(df) >= 2 else None
    change = (quote.last - prev_close) if prev_close else None
    change_pct = ((quote.last / prev_close - 1) * 100) if prev_close else None
    volume = float(df["volume"].iloc[-1]) if len(df) else None

    return {
        "symbol": symbol,
        "company_name": meta.company_name,
        "current_price": round(quote.last, 4),
        "change": round(change, 4) if change is not None else None,
        "change_percent": round(change_pct, 2) if change_pct is not None else None,
        "volume": volume,
        "market_status": market_status(),
        "chart_history": [round(float(c), 4) for c in df["close"].tail(20)] if len(df) else [],
        "data_source": provider.name,
        "data_mode": getattr(provider, "data_mode", "unspecified"),
        "status": "ok",
        "note": None,
    }


def get_market_overview(
    provider: MarketDataProvider, db: Session, symbols: list[str] | None = None
) -> list[dict]:
    """Assets come from the Asset Universe Manager, not a hardcoded list.
    `symbols`, when given, filters to that subset of the *active universe*
    (a symbol not in the universe is simply not returned — add it via
    POST /api/v1/universe first, never by editing source here)."""
    if symbols:
        wanted = {s.upper() for s in symbols}
        assets = [a for a in get_active_universe(db) if a.symbol in wanted]
    else:
        assets = get_active_universe(db)

    results = []
    for asset in assets:
        symbol = asset.symbol
        failure: Exception | None = None
        try:
            results.append(_real_quote(provider, symbol))
            continue
        except ProviderDataUnavailable as exc:
            failure = exc
            logger.info("market_overview: %s unavailable from %s (%s) — using demo fallback", symbol, provider.name, exc)
        except Exception as exc:
            failure = exc
            logger.warning("market_overview: unexpected error for %s: %s", symbol, exc)

        try:
            results.append(_synthetic_quote(symbol, asset.name, _classify_failure(failure)))
        except Exception as exc:
            logger.error("market_overview: demo fallback also failed for %s: %s", symbol, exc)
            results.append({
                "symbol": symbol, "status": "unavailable",
                "note": "Data unavailable — provider and demo fallback both failed.",
            })
    return results
