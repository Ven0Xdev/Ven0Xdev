"""Alpha Vantage provider tests over stubbed HTTP (httpx.MockTransport).

Fixtures mirror Alpha Vantage's documented response shapes exactly — all
requests hit the same /query path, routed by the `function` query param, and
errors surface as HTTP-200 bodies with an "Error Message"/"Note"/
"Information" key instead of a non-200 status, so the tests specifically
cover that in-body validation.
"""
from datetime import datetime, timezone

import httpx
import pytest

from app.services.data_providers.alphavantage_provider import (
    AlphaVantageProvider,
    ProviderDataUnavailable,
)

_GLOBAL_QUOTE = {
    "Global Quote": {
        "01. symbol": "AAA",
        "05. price": "1.12",
        "07. latest trading day": "2025-06-13",
    }
}

_TIME_SERIES_DAILY = {
    "Time Series (Daily)": {
        "2025-06-11": {"1. open": "1.00", "2. high": "1.08", "3. low": "0.98", "4. close": "1.05", "5. volume": "120000"},
        "2025-06-12": {"1. open": "1.05", "2. high": "1.12", "3. low": "1.02", "4. close": "1.10", "5. volume": "90000"},
        "2025-06-13": {"1. open": "1.10", "2. high": "1.15", "3. low": "1.07", "4. close": "1.12", "5. volume": "150000"},
    }
}

_OVERVIEW = {
    "Symbol": "AAA",
    "Name": "Alpha Inc",
    "Exchange": "NASDAQ",
    "Sector": "Technology",
    "Industry": "Software",
    "MarketCapitalization": "12300000",
    "SharesOutstanding": "55500000",
    "SharesFloat": "50000000",
    "RevenueTTM": "1000000",
}

_NEWS_SENTIMENT = {
    "feed": [
        {
            "title": "Alpha Inc announces partnership",
            "url": "https://example.com/1",
            "time_published": "20250611T120000",
            "source": "PRNewswire",
            "overall_sentiment_score": "0.35",
        }
    ]
}

_SPLITS = {"symbol": "AAA", "data": [{"effective_date": "2020-08-31", "split_factor": "4"}]}


def _transport(overrides: dict | None = None):
    routes = {
        "GLOBAL_QUOTE": _GLOBAL_QUOTE,
        "TIME_SERIES_DAILY": _TIME_SERIES_DAILY,
        "OVERVIEW": _OVERVIEW,
        "NEWS_SENTIMENT": _NEWS_SENTIMENT,
        "SPLITS": _SPLITS,
    }
    routes.update(overrides or {})

    def handler(request: httpx.Request) -> httpx.Response:
        function = request.url.params.get("function")
        payload = routes.get(function)
        if payload is None:
            return httpx.Response(404, json={})
        if isinstance(payload, httpx.Response):
            return payload
        return httpx.Response(200, json=payload)

    return httpx.MockTransport(handler)


def _provider(overrides=None):
    return AlphaVantageProvider(api_key="test-key", transport=_transport(overrides), calls_per_minute=10_000)


def test_requires_api_key():
    with pytest.raises(ProviderDataUnavailable):
        AlphaVantageProvider(api_key=None)


def test_quote_mapping():
    quote = _provider().get_quote("aaa")
    assert quote.last == 1.12
    assert quote.bid is None and quote.ask is None  # never fabricated
    assert quote.timestamp == datetime(2025, 6, 13, tzinfo=timezone.utc)


def test_ohlcv_mapping():
    df = _provider().get_ohlcv("AAA", lookback_days=10)
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert "bid" not in df.columns
    assert len(df) == 3
    assert df["close"].iloc[-1] == 1.12
    assert df.index.tz is not None


def test_ohlcv_no_data_raises():
    provider = _provider({"TIME_SERIES_DAILY": {}})
    with pytest.raises(ProviderDataUnavailable):
        provider.get_ohlcv("AAA")


def test_universe_is_explicitly_unsupported():
    with pytest.raises(ProviderDataUnavailable, match="Twelve Data"):
        _provider().get_universe()


def test_ticker_meta_and_fundamentals_mapping():
    meta = _provider().get_ticker_meta("AAA")
    assert meta.company_name == "Alpha Inc"
    assert meta.sector == "Technology"

    fund = _provider().get_fundamentals("AAA")
    assert fund.market_cap == pytest.approx(12_300_000)
    assert fund.shares_outstanding == pytest.approx(55_500_000)
    assert fund.dilution_12m_pct == 0.0  # explicit neutral default, never fabricated


def test_news_real_sentiment_is_used_not_neutralized():
    news = _provider().get_news("AAA")
    assert len(news) == 1
    assert news[0].sentiment == pytest.approx(0.35)  # vendor's own score, not keyword-guessed
    assert news[0].is_press_release is True


def test_corporate_actions_mapping():
    actions = _provider().get_corporate_actions("AAA")
    assert len(actions) == 1
    assert actions[0].action_type == "split"  # factor 4 >= 1 is a forward split


def test_in_body_rate_limit_note_is_typed_even_with_http_200():
    provider = _provider({"GLOBAL_QUOTE": {"Note": "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day."}})
    with pytest.raises(ProviderDataUnavailable, match="rate limit"):
        provider.get_quote("AAA")


def test_in_body_error_message_is_typed():
    provider = _provider({"OVERVIEW": {"Error Message": "Invalid API call"}})
    with pytest.raises(ProviderDataUnavailable, match="Invalid API call"):
        provider.get_ticker_meta("AAA")


def test_cache_collapses_repeat_calls_and_flips_data_mode():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json=_GLOBAL_QUOTE)

    provider = AlphaVantageProvider(api_key="k", transport=httpx.MockTransport(handler), calls_per_minute=10_000)
    provider.get_quote("AAA")
    assert provider.data_mode == "delayed"
    provider.get_quote("AAA")
    assert provider.data_mode == "cached"
    assert calls["n"] == 1
