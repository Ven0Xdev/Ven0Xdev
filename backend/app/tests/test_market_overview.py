"""Dashboard market overview: default large-cap symbols always return a
usable entry (real provider or clearly labeled demo fallback), never
random prices and never a crash for one bad symbol."""
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.market_overview import (
    DEFAULT_SYMBOLS,
    _classify_failure,
    get_market_overview,
    market_status,
)


def test_default_symbols_are_the_requested_ten():
    assert DEFAULT_SYMBOLS == ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META", "GOOGL", "AMD", "PLTR", "NFLX"]


def test_mock_provider_falls_back_to_labeled_synthetic_for_large_caps():
    # MockOTCProvider's universe is OTC-only synthetic tickers — none of
    # the large caps are in it, so every one of these must hit the demo
    # fallback path, clearly labeled, never silently blank.
    provider = MockOTCProvider()
    results = get_market_overview(provider, ["AAPL", "NVDA"])
    assert len(results) == 2
    for r in results:
        assert r["status"] == "ok"
        assert r["data_mode"] == "synthetic"
        assert r["data_source"] == "demo-fallback"
        assert r["note"] is not None
        assert r["current_price"] > 0


def test_synthetic_fallback_is_deterministic_not_random():
    provider = MockOTCProvider()
    first = get_market_overview(provider, ["TSLA"])[0]
    second = get_market_overview(provider, ["TSLA"])[0]
    assert first["current_price"] == second["current_price"]
    assert first["chart_history"] == second["chart_history"]


def test_every_symbol_has_a_result_even_if_one_fails():
    provider = MockOTCProvider()
    results = get_market_overview(provider, DEFAULT_SYMBOLS)
    assert len(results) == len(DEFAULT_SYMBOLS)
    assert {r["symbol"] for r in results} == set(DEFAULT_SYMBOLS)


def test_company_names_are_real_not_placeholder():
    provider = MockOTCProvider()
    results = get_market_overview(provider, ["AAPL"])
    assert results[0]["company_name"] == "Apple Inc."


def test_market_status_is_one_of_the_known_states():
    assert market_status() in ("open", "closed", "pre-market", "after-hours")


def test_market_status_weekend_is_closed():
    from datetime import datetime, timezone

    saturday_noon_utc = datetime(2026, 8, 8, 15, 0, tzinfo=timezone.utc)  # a Saturday
    assert market_status(saturday_noon_utc) == "closed"


def test_classify_failure_distinguishes_known_reasons():
    assert _classify_failure(Exception("TwelveData rate limit exceeded (HTTP 429)")) == "API rate limit reached"
    assert _classify_failure(Exception("ALPHA_VANTAGE_API_KEY is not set.")) == "Missing API key"
    assert _classify_failure(Exception("some other weird failure")) == "Data unavailable"
    assert _classify_failure(None) == "No live provider configured for this symbol"
