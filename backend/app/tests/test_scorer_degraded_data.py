"""analyze_ticker() must degrade honestly when a provider can supply price
data but not fundamentals/news/corporate-actions (the exact real-world case
that blocked every ETF: Twelve Data's /statistics needs a paid plan and
Alpha Vantage's OVERVIEW doesn't cover ETFs at all) — never hard-fail the
whole analysis over one missing, individually-optional signal.
"""
import pytest

from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.mock_provider import MockOTCProvider
from app.services.scoring.scorer import analyze_ticker

_SYMBOL = "BLKM"  # a real symbol in MockOTCProvider's own OTC universe


class _NoFundamentalsNoNewsProvider(MockOTCProvider):
    """Price data (meta/OHLCV/quote) works exactly like the real mock
    provider; fundamentals/news/corporate-actions are unavailable — mirrors
    a real vendor gap (e.g. an ETF on a free-tier plan), not a broken
    provider."""

    def get_fundamentals(self, symbol):
        raise ProviderDataUnavailable(f"{symbol}: fundamentals not available on this plan")

    def get_news(self, symbol, limit=20):
        raise ProviderDataUnavailable(f"{symbol}: news not available")

    def get_corporate_actions(self, symbol):
        raise ProviderDataUnavailable(f"{symbol}: corporate actions not available")


def test_analysis_succeeds_despite_missing_fundamentals_news_and_corp_actions():
    provider = _NoFundamentalsNoNewsProvider()
    analysis = analyze_ticker(_SYMBOL, provider=provider)  # must not raise

    assert analysis.ticker == _SYMBOL
    assert analysis.current_price > 0
    assert 0 <= analysis.fundamental_score <= 100


def test_degraded_fundamentals_are_labeled_unavailable_not_silently_scored():
    provider = _NoFundamentalsNoNewsProvider()
    analysis = analyze_ticker(_SYMBOL, provider=provider)

    assert analysis.fundamentals_available is False
    assert analysis.fundamental_score == 50.0  # neutral, not a fabricated real-looking score


def test_healthy_provider_reports_fundamentals_available():
    provider = MockOTCProvider()
    analysis = analyze_ticker(_SYMBOL, provider=provider)
    assert analysis.fundamentals_available is True


def test_price_data_failure_still_raises_no_degraded_state_for_that():
    class _NoPriceProvider(MockOTCProvider):
        def get_ohlcv(self, symbol, timeframe="1d", lookback_days=250):
            raise ProviderDataUnavailable(f"{symbol}: no price data")

    with pytest.raises(ProviderDataUnavailable):
        analyze_ticker(_SYMBOL, provider=_NoPriceProvider())
