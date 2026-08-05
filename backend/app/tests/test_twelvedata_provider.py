"""Twelve Data provider tests over stubbed HTTP (httpx.MockTransport).

Fixtures mirror Twelve Data's documented response shapes exactly, so these
tests verify our field mapping and failure handling — no live API, no key
needed, matching the Finnhub provider test conventions.
"""
from datetime import datetime, timezone

import httpx
import pytest

from app.services.data_providers.twelvedata_provider import (
    ProviderDataUnavailable,
    TwelveDataProvider,
)

_QUOTE = {"symbol": "AAA", "name": "Alpha Inc", "exchange": "NASDAQ", "close": "1.12", "timestamp": 1749772800}

_TIME_SERIES = {
    "status": "ok",
    "values": [
        {"datetime": "2025-06-11", "open": "1.00", "high": "1.08", "low": "0.98", "close": "1.05", "volume": "120000"},
        {"datetime": "2025-06-12", "open": "1.05", "high": "1.12", "low": "1.02", "close": "1.10", "volume": "90000"},
        {"datetime": "2025-06-13", "open": "1.10", "high": "1.15", "low": "1.07", "close": "1.12", "volume": "150000"},
    ],
}

_STOCKS = {
    "data": [
        {"symbol": "AAA", "name": "Alpha Inc", "exchange": "NASDAQ"},
        {"symbol": "BBB", "name": "Beta Ltd", "exchange": "NASDAQ"},
    ]
}

_STATISTICS = {
    "statistics": {
        "valuations_metrics": {"market_capitalization": 12_300_000},
        "stock_statistics": {"shares_outstanding": 55_500_000, "shares_float": 50_000_000},
        "financials": {"income_statement": {"revenue_ttm": 1_000_000, "net_income_ttm": 200_000}},
    }
}

_SPLITS = {"symbol": "AAA", "splits": [{"date": "2020-08-31", "from_factor": 1, "to_factor": 4}]}


def _transport(overrides: dict | None = None):
    routes = {
        "/quote": _QUOTE,
        "/time_series": _TIME_SERIES,
        "/stocks": _STOCKS,
        "/statistics": _STATISTICS,
        "/splits": _SPLITS,
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
    return TwelveDataProvider(api_key="test-key", transport=_transport(overrides), calls_per_minute=10_000)


def test_requires_api_key():
    with pytest.raises(ProviderDataUnavailable):
        TwelveDataProvider(api_key=None)


def test_quote_mapping():
    quote = _provider().get_quote("aaa")
    assert quote.last == 1.12
    assert quote.bid is None and quote.ask is None  # never fabricated
    assert quote.timestamp == datetime.fromtimestamp(1749772800, tz=timezone.utc)


def test_ohlcv_mapping():
    df = _provider().get_ohlcv("AAA", lookback_days=10)
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert "bid" not in df.columns
    assert len(df) == 3
    assert df["close"].iloc[-1] == 1.12
    assert df.index.tz is not None


def test_ohlcv_no_data_raises():
    provider = _provider({"/time_series": {"status": "ok", "values": []}})
    with pytest.raises(ProviderDataUnavailable):
        provider.get_ohlcv("AAA")


def test_universe_mapping():
    universe = _provider().get_universe()
    assert {t.symbol for t in universe} == {"AAA", "BBB"}


def test_fundamentals_mapping():
    fund = _provider().get_fundamentals("AAA")
    assert fund.market_cap == pytest.approx(12_300_000)
    assert fund.shares_outstanding == pytest.approx(55_500_000)
    assert fund.dilution_12m_pct == 0.0  # explicit neutral default, never fabricated


def test_corporate_actions_mapping():
    actions = _provider().get_corporate_actions("AAA")
    assert len(actions) == 1
    assert actions[0].action_type == "split"  # 1 -> 4 is a forward split


def test_news_not_supported_on_core_api():
    with pytest.raises(ProviderDataUnavailable):
        _provider().get_news("AAA")


def test_in_body_error_is_typed_even_with_http_200():
    provider = _provider({"/quote": {"code": 400, "message": "symbol not found", "status": "error"}})
    with pytest.raises(ProviderDataUnavailable, match="symbol not found"):
        provider.get_quote("ZZZ")


def test_statistics_403_on_free_plan_is_typed():
    provider = _provider({"/statistics": httpx.Response(403, json={})})
    with pytest.raises(ProviderDataUnavailable, match="not included"):
        provider.get_fundamentals("AAA")


def test_cache_collapses_repeat_calls_and_flips_data_mode():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json=_QUOTE)

    provider = TwelveDataProvider(api_key="k", transport=httpx.MockTransport(handler), calls_per_minute=10_000)
    provider.get_quote("AAA")
    assert provider.data_mode == "delayed"
    provider.get_quote("AAA")
    assert provider.data_mode == "cached"
    assert calls["n"] == 1
