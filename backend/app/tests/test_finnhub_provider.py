"""Finnhub provider tests over stubbed HTTP (httpx.MockTransport).

Fixtures mirror Finnhub's documented response shapes exactly, so these tests
verify our field mapping and failure handling — no live API, no key needed.
"""
import json
from datetime import datetime, timezone

import httpx
import pytest

from app.services.data_providers.finnhub_provider import FinnhubProvider, ProviderDataUnavailable

_CANDLES = {
    "s": "ok",
    "t": [1749600000, 1749686400, 1749772800],
    "o": [1.00, 1.05, 1.10],
    "h": [1.08, 1.12, 1.15],
    "l": [0.98, 1.02, 1.07],
    "c": [1.05, 1.10, 1.12],
    "v": [120000, 90000, 150000],
}

_PROFILE = {
    "name": "Example Corp",
    "exchange": "OTC MARKETS",
    "finnhubIndustry": "Biotechnology",
    "shareOutstanding": 55.5,        # Finnhub reports in millions
    "marketCapitalization": 12.3,    # millions
}

_SYMBOLS = [
    {"symbol": "AAA", "description": "Alpha Inc", "mic": "OOTC"},
    {"symbol": "BBB", "description": "Beta Ltd", "mic": "XNAS"},   # Nasdaq — filtered out
    {"symbol": "CCC", "description": "Gamma Co", "mic": "PINX"},
]

_QUOTE = {"c": 1.12, "t": 1749772800}

_NEWS = [
    {
        "datetime": 1749700000,
        "headline": "Example Corp announces partnership",
        "source": "PRNewswire",
        "url": "https://example.com/1",
    }
]


def _transport(overrides: dict | None = None):
    routes = {
        "/api/v1/stock/candle": _CANDLES,
        "/api/v1/stock/profile2": _PROFILE,
        "/api/v1/stock/symbol": _SYMBOLS,
        "/api/v1/quote": _QUOTE,
        "/api/v1/company-news": _NEWS,
        "/api/v1/stock/metric": {"metric": {}},
    }
    routes.update(overrides or {})

    def handler(request: httpx.Request) -> httpx.Response:
        payload = routes.get(request.url.path)
        if payload is None:
            return httpx.Response(404, json={})
        if isinstance(payload, httpx.Response):
            return payload
        return httpx.Response(200, json=payload)

    return httpx.MockTransport(handler)


def _provider(overrides=None):
    return FinnhubProvider(api_key="test-key", transport=_transport(overrides), calls_per_minute=10_000)


def test_requires_api_key():
    with pytest.raises(ProviderDataUnavailable):
        FinnhubProvider(api_key=None)


def test_ohlcv_mapping():
    df = _provider().get_ohlcv("aaa", lookback_days=10)
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert "bid" not in df.columns  # quote depth is never fabricated
    assert len(df) == 3
    assert df["close"].iloc[-1] == 1.12
    assert df.index.tz is not None


def test_ohlcv_no_data_raises():
    provider = _provider({"/api/v1/stock/candle": {"s": "no_data"}})
    with pytest.raises(ProviderDataUnavailable):
        provider.get_ohlcv("AAA")


def test_universe_filters_to_otc_mics():
    universe = _provider().get_universe()
    symbols = {t.symbol for t in universe}
    assert symbols == {"AAA", "CCC"}   # XNAS-listed BBB excluded


def test_ticker_meta_scales_millions():
    meta = _provider().get_ticker_meta("AAA")
    assert meta.company_name == "Example Corp"
    assert meta.shares_outstanding == pytest.approx(55_500_000)
    assert meta.market_cap == pytest.approx(12_300_000)
    assert meta.sector == "Biotechnology"


def test_quote_has_no_fabricated_spread():
    quote = _provider().get_quote("AAA")
    assert quote.last == 1.12
    assert quote.bid is None
    assert quote.ask is None
    assert quote.spread_pct is None
    assert quote.timestamp == datetime.fromtimestamp(1749772800, tz=timezone.utc)


def test_news_mapping():
    news = _provider().get_news("AAA")
    assert len(news) == 1
    assert news[0].is_press_release is True     # PRNewswire recognized
    assert news[0].sentiment == 0.0             # neutral until real classifier
    assert news[0].is_promotional is False


def test_fundamentals_neutral_defaults_are_explicit():
    fund = _provider().get_fundamentals("AAA")
    assert fund.dilution_12m_pct == 0.0
    assert fund.going_concern_flag is False
    assert fund.filing_delinquent is False
    assert fund.shares_outstanding == pytest.approx(55_500_000)


def test_403_maps_to_clear_plan_error():
    provider = _provider({"/api/v1/stock/candle": httpx.Response(403, json={})})
    with pytest.raises(ProviderDataUnavailable, match="not included"):
        provider.get_ohlcv("AAA")


def test_cache_collapses_repeat_calls():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json=_QUOTE)

    provider = FinnhubProvider(api_key="k", transport=httpx.MockTransport(handler), calls_per_minute=10_000)
    provider.get_quote("AAA")
    provider.get_quote("AAA")
    provider.get_quote("AAA")
    assert calls["n"] == 1
