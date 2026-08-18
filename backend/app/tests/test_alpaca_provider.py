"""Alpaca provider tests over stubbed HTTP (httpx.MockTransport). Fixtures
mirror Alpaca's documented Data API v2 response shapes exactly, so these
tests verify our field mapping and failure handling — no live API, no key
needed, matching the Twelve Data/Alpha Vantage provider test conventions.
"""
from datetime import datetime, timezone

import httpx
import pytest

from app.services.data_providers.alpaca_provider import AlpacaProvider, ProviderDataUnavailable

_SNAPSHOT = {
    "symbol": "AAA",
    "latestTrade": {"t": "2025-06-13T20:00:00.123456789Z", "p": 1.12, "s": 100, "i": 42},
    "latestQuote": {"t": "2025-06-13T20:00:00.100000000Z", "bp": 1.10, "bs": 5, "ap": 1.14, "as": 3},
}

_BARS = {
    "symbol": "AAA",
    "bars": [
        {"t": "2025-06-11T04:00:00Z", "o": 1.00, "h": 1.08, "l": 0.98, "c": 1.05, "v": 120000},
        {"t": "2025-06-12T04:00:00Z", "o": 1.05, "h": 1.12, "l": 1.02, "c": 1.10, "v": 90000},
        {"t": "2025-06-13T04:00:00Z", "o": 1.10, "h": 1.15, "l": 1.07, "c": 1.12, "v": 150000},
    ],
    "next_page_token": None,
}


def _transport(overrides: dict | None = None):
    routes = {
        "/v2/stocks/AAA/snapshot": _SNAPSHOT,
        "/v2/stocks/AAA/bars": _BARS,
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
    return AlpacaProvider(
        api_key="test-key", api_secret="test-secret", transport=_transport(overrides), calls_per_minute=10_000
    )


def test_requires_both_key_and_secret():
    with pytest.raises(ProviderDataUnavailable, match="ALPACA_API_KEY"):
        AlpacaProvider(api_key=None, api_secret=None)
    with pytest.raises(ProviderDataUnavailable):
        AlpacaProvider(api_key="k", api_secret=None)
    with pytest.raises(ProviderDataUnavailable):
        AlpacaProvider(api_key=None, api_secret="s")


def test_auth_is_header_based_never_in_url():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = request.headers
        captured["url"] = str(request.url)
        return httpx.Response(200, json=_SNAPSHOT)

    provider = AlpacaProvider(
        api_key="MY-SECRET-KEY", api_secret="MY-SECRET-SECRET",
        transport=httpx.MockTransport(handler), calls_per_minute=10_000,
    )
    provider.get_quote("AAA")
    assert captured["headers"]["APCA-API-KEY-ID"] == "MY-SECRET-KEY"
    assert captured["headers"]["APCA-API-SECRET-KEY"] == "MY-SECRET-SECRET"
    assert "MY-SECRET-KEY" not in captured["url"]
    assert "MY-SECRET-SECRET" not in captured["url"]


def test_quote_mapping_includes_real_bid_ask():
    quote = _provider().get_quote("aaa")
    assert quote.last == 1.12
    assert quote.bid == 1.10 and quote.ask == 1.14  # real depth, unlike TD/AV free plans
    assert quote.bid_size == 5 and quote.ask_size == 3
    assert quote.timestamp == datetime(2025, 6, 13, 20, 0, 0, 123456, tzinfo=timezone.utc)


def test_quote_feed_param_is_iex():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["feed"] = request.url.params.get("feed")
        return httpx.Response(200, json=_SNAPSHOT)

    provider = AlpacaProvider(api_key="k", api_secret="s", transport=httpx.MockTransport(handler), calls_per_minute=10_000)
    provider.get_quote("AAA")
    assert captured["feed"] == "iex"


def test_quote_no_trade_raises():
    provider = _provider({"/v2/stocks/AAA/snapshot": {"symbol": "AAA", "latestTrade": {}, "latestQuote": {}}})
    with pytest.raises(ProviderDataUnavailable):
        provider.get_quote("AAA")


def test_ohlcv_mapping():
    df = _provider().get_ohlcv("AAA", lookback_days=10)
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert "bid" not in df.columns
    assert len(df) == 3
    assert df["close"].iloc[-1] == 1.12
    assert df.index.tz is not None


def test_ohlcv_no_data_raises():
    provider = _provider({"/v2/stocks/AAA/bars": {"symbol": "AAA", "bars": []}})
    with pytest.raises(ProviderDataUnavailable):
        provider.get_ohlcv("AAA")


def test_ticker_meta_is_honest_placeholder_never_fabricated():
    meta = _provider().get_ticker_meta("AAA")
    assert meta.symbol == "AAA"
    assert meta.company_name == "AAA"  # no company-profile data on this plan — never invented
    assert meta.tier == "IEX"
    assert meta.market_cap == 0.0


def test_ticker_meta_unknown_symbol_raises():
    provider = _provider({"/v2/stocks/AAA/snapshot": {"symbol": "AAA"}})
    with pytest.raises(ProviderDataUnavailable):
        provider.get_ticker_meta("AAA")


def test_fundamentals_news_corporate_actions_not_supported():
    provider = _provider()
    with pytest.raises(ProviderDataUnavailable, match="ALPHA_VANTAGE_API_KEY"):
        provider.get_fundamentals("AAA")
    with pytest.raises(ProviderDataUnavailable, match="ALPHA_VANTAGE_API_KEY"):
        provider.get_news("AAA")
    with pytest.raises(ProviderDataUnavailable, match="ALPHA_VANTAGE_API_KEY"):
        provider.get_corporate_actions("AAA")


def test_universe_not_supported_routes_callers_to_fallback():
    with pytest.raises(ProviderDataUnavailable, match="Trading API"):
        _provider().get_universe()


def test_data_mode_is_live_and_never_synthetic():
    provider = _provider()
    provider.get_quote("AAA")
    assert provider.data_mode in ("live", "cached")
    assert provider.data_mode != "synthetic"


def test_cache_collapses_repeat_calls_and_flips_data_mode():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json=_SNAPSHOT)

    provider = AlpacaProvider(api_key="k", api_secret="s", transport=httpx.MockTransport(handler), calls_per_minute=10_000)
    provider.get_quote("AAA")
    assert provider.data_mode == "live"
    provider.get_quote("AAA")
    assert provider.data_mode == "cached"
    assert calls["n"] == 1
