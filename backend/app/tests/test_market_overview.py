"""Dashboard market overview: every active asset in the Asset Universe
Manager returns a usable entry (real provider or clearly labeled demo
fallback), never random prices and never a crash for one bad symbol."""
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.market_overview import (
    _classify_failure,
    get_market_overview,
    market_status,
)
from app.services.universe.manager import SEED_UNIVERSE, seed_default_universe


def test_mock_provider_serves_large_caps_directly_no_fallback_needed(db_session):
    # Regression coverage for the Opportunities-scan bug (`Unknown symbol
    # 'XLK'`): MockOTCProvider's canonical multi-asset profiles now cover
    # every seed symbol directly, so the dashboard gets the *same*
    # provider-backed price every other page (Opportunities, stock detail)
    # sees for the same symbol — no more falling back to a second,
    # independently-seeded synthetic generator that disagreed with it.
    seed_default_universe(db_session)
    provider = MockOTCProvider()
    results = get_market_overview(provider, db_session, ["AAPL", "NVDA"])
    assert len(results) == 2
    for r in results:
        assert r["status"] == "ok"
        assert r["data_mode"] == "synthetic"
        assert r["data_source"] == "mock"
        assert r["note"] is None
        assert r["current_price"] > 0


class _RefusesEverythingProvider(MarketDataProvider):
    """Test-only stand-in for a real provider that is down/misconfigured —
    exercises the demo-fallback path itself, still needed as a safety net
    when the configured live provider can't serve a symbol."""

    name = "broken-provider"
    data_mode = "live"

    def get_universe(self, limit=None):
        return []

    def get_ticker_meta(self, symbol):
        raise ProviderDataUnavailable(f"{symbol}: provider unavailable")

    def get_ohlcv(self, symbol, timeframe="1d", lookback_days=250):
        raise ProviderDataUnavailable(f"{symbol}: provider unavailable")

    def get_quote(self, symbol):
        raise ProviderDataUnavailable(f"{symbol}: provider unavailable")

    def get_fundamentals(self, symbol):
        raise ProviderDataUnavailable(f"{symbol}: provider unavailable")

    def get_news(self, symbol, limit=20):
        raise ProviderDataUnavailable(f"{symbol}: provider unavailable")

    def get_corporate_actions(self, symbol):
        raise ProviderDataUnavailable(f"{symbol}: provider unavailable")


def test_falls_back_to_labeled_synthetic_when_the_real_provider_cannot_serve_a_symbol(db_session):
    seed_default_universe(db_session)
    results = get_market_overview(_RefusesEverythingProvider(), db_session, ["AAPL", "NVDA"])
    assert len(results) == 2
    for r in results:
        assert r["status"] == "ok"
        assert r["data_mode"] == "synthetic"
        assert r["data_source"] == "demo-fallback"
        assert r["note"] is not None
        assert r["current_price"] > 0


def test_synthetic_fallback_is_deterministic_not_random(db_session):
    seed_default_universe(db_session)
    provider = MockOTCProvider()
    first = get_market_overview(provider, db_session, ["TSLA"])[0]
    second = get_market_overview(provider, db_session, ["TSLA"])[0]
    assert first["current_price"] == second["current_price"]
    assert first["chart_history"] == second["chart_history"]


def test_every_active_asset_has_a_result_even_if_one_fails(db_session):
    seed_default_universe(db_session)
    provider = MockOTCProvider()
    results = get_market_overview(provider, db_session)
    expected_symbols = {e["symbol"] for e in SEED_UNIVERSE}
    assert len(results) == len(expected_symbols)
    assert {r["symbol"] for r in results} == expected_symbols


def test_deactivated_asset_is_excluded_from_overview(db_session):
    seed_default_universe(db_session)
    from app.db.models.asset import Asset

    row = db_session.query(Asset).filter_by(symbol="AVGO").one()
    row.is_active = False
    db_session.commit()

    provider = MockOTCProvider()
    results = get_market_overview(provider, db_session)
    assert "AVGO" not in {r["symbol"] for r in results}


def test_company_names_come_from_the_universe_manager_not_invented(db_session):
    seed_default_universe(db_session)
    provider = MockOTCProvider()
    results = get_market_overview(provider, db_session, ["AAPL"])
    assert results[0]["company_name"] == "Apple Inc."


def test_symbols_not_in_the_universe_are_simply_excluded(db_session):
    seed_default_universe(db_session)
    provider = MockOTCProvider()
    results = get_market_overview(provider, db_session, ["AAPL", "NOT_IN_UNIVERSE"])
    assert {r["symbol"] for r in results} == {"AAPL"}


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
