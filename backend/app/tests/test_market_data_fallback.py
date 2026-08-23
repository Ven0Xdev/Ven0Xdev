"""Fallback composite tests: Twelve Data first, Alpha Vantage second, both
down -> one clear ProviderDataUnavailable naming both failures. No real
HTTP involved — the two sub-providers are simple stand-ins so the fallback
*logic* is tested in isolation from either vendor's field mapping (those
are covered by test_twelvedata_provider.py / test_alphavantage_provider.py).

Also covers MixedSourceProvider (Alpaca's price-chain + separate
reference-provider composite — see alpaca_provider.py's "alpaca" builder).
"""
from datetime import datetime, timezone

import pytest

from app.services.data_providers.base import Fundamentals, Quote
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.market_data_fallback import (
    FallbackMarketDataProvider,
    MixedSourceProvider,
)


class _StubProvider:
    def __init__(self, name, data_mode, quote=None, error=None, fundamentals=None):
        self.name = name
        self.data_mode = data_mode
        self._quote = quote
        self._error = error
        self._fundamentals = fundamentals

    def get_quote(self, symbol):
        if self._error:
            raise ProviderDataUnavailable(self._error)
        return self._quote

    def get_universe(self, limit=None):
        if self._error:
            raise ProviderDataUnavailable(self._error)
        return []

    def get_ticker_meta(self, symbol):
        if self._error:
            raise ProviderDataUnavailable(self._error)
        return None

    def get_ohlcv(self, symbol, timeframe="1d", lookback_days=250):
        if self._error:
            raise ProviderDataUnavailable(self._error)
        return None

    def get_fundamentals(self, symbol):
        if self._error:
            raise ProviderDataUnavailable(self._error)
        return self._fundamentals

    def get_news(self, symbol, limit=20):
        if self._error:
            raise ProviderDataUnavailable(self._error)
        return []

    def get_corporate_actions(self, symbol):
        if self._error:
            raise ProviderDataUnavailable(self._error)
        return []


_TS = datetime(2025, 1, 1, tzinfo=timezone.utc)


def test_primary_success_reports_primary_identity():
    primary = _StubProvider("twelvedata_only", "delayed", quote=Quote("AAA", 1.0, _TS))
    fallback = _StubProvider("alphavantage", "delayed", quote=Quote("AAA", 2.0, _TS))
    composite = FallbackMarketDataProvider(primary, fallback)

    quote = composite.get_quote("AAA")

    assert quote.last == 1.0
    assert composite.name == "twelvedata_only"
    assert composite.data_mode == "delayed"


def test_primary_cached_is_reported():
    primary = _StubProvider("twelvedata_only", "cached", quote=Quote("AAA", 1.0, _TS))
    composite = FallbackMarketDataProvider(primary, None)

    composite.get_quote("AAA")

    assert composite.data_mode == "cached"


def test_primary_failure_falls_back_to_alpha_vantage():
    primary = _StubProvider("twelvedata_only", "delayed", error="Twelve Data down")
    fallback = _StubProvider("alphavantage", "delayed", quote=Quote("AAA", 2.0, _TS))
    composite = FallbackMarketDataProvider(primary, fallback)

    quote = composite.get_quote("AAA")

    assert quote.last == 2.0
    assert composite.name == "alphavantage"
    assert composite.data_mode == "delayed"


def test_both_providers_down_raises_naming_both():
    primary = _StubProvider("twelvedata_only", "delayed", error="Twelve Data down")
    fallback = _StubProvider("alphavantage", "delayed", error="Alpha Vantage down")
    composite = FallbackMarketDataProvider(primary, fallback)

    with pytest.raises(ProviderDataUnavailable) as err:
        composite.get_quote("AAA")

    assert "Twelve Data down" in str(err.value)
    assert "Alpha Vantage down" in str(err.value)


def test_primary_failure_with_no_fallback_configured_is_explicit():
    primary = _StubProvider("twelvedata_only", "delayed", error="Twelve Data down")
    composite = FallbackMarketDataProvider(primary, None)

    with pytest.raises(ProviderDataUnavailable, match="no Alpha Vantage fallback"):
        composite.get_quote("AAA")


def test_missing_primary_key_goes_straight_to_fallback():
    fallback = _StubProvider("alphavantage", "delayed", quote=Quote("AAA", 3.0, _TS))
    composite = FallbackMarketDataProvider(
        None, fallback, primary_unavailable_reason="TWELVE_DATA_API_KEY is not set."
    )

    quote = composite.get_quote("AAA")

    assert quote.last == 3.0
    assert composite.name == "alphavantage"


def test_missing_primary_key_and_no_fallback_is_offline():
    composite = FallbackMarketDataProvider(
        None, None, primary_unavailable_reason="TWELVE_DATA_API_KEY is not set."
    )

    with pytest.raises(ProviderDataUnavailable, match="TWELVE_DATA_API_KEY is not set"):
        composite.get_quote("AAA")


def test_custom_labels_appear_in_fallback_error_message():
    # alpaca_provider.py reuses this exact class with primary_label="Alpaca",
    # fallback_label="Twelve Data" — the composed error must reflect that,
    # not the hardcoded "Twelve Data"/"Alpha Vantage" text.
    primary = _StubProvider("alpaca", "live", error="Alpaca down")
    composite = FallbackMarketDataProvider(primary, None, name="alpaca", primary_label="Alpaca", fallback_label="Twelve Data")

    with pytest.raises(ProviderDataUnavailable, match="no Twelve Data fallback"):
        composite.get_quote("AAA")


# --- MixedSourceProvider: price chain + separate reference provider --------

_FUND = Fundamentals(
    symbol="AAA", market_cap=1.0, float_shares=1.0, shares_outstanding=1.0,
    cash=1.0, total_debt=0.0, revenue_ttm=1.0, net_income_ttm=0.1,
    dilution_12m_pct=0.0, going_concern_flag=False, last_filing_date=None,
)


def test_price_calls_delegate_to_price_chain():
    price_chain = _StubProvider("alpaca", "live", quote=Quote("AAA", 5.0, _TS))
    mixed = MixedSourceProvider(price_chain, reference=None)

    quote = mixed.get_quote("AAA")

    assert quote.last == 5.0
    assert mixed.name == "alpaca"
    assert mixed.data_mode == "live"


def test_reference_calls_delegate_to_reference_provider():
    price_chain = _StubProvider("alpaca", "live", quote=Quote("AAA", 5.0, _TS))
    reference = _StubProvider("alphavantage", "delayed", fundamentals=_FUND)
    mixed = MixedSourceProvider(price_chain, reference)

    fund = mixed.get_fundamentals("AAA")

    assert fund is _FUND


def test_reference_call_never_overwrites_price_identity():
    # A fundamentals/news call answered by Alpha Vantage must never make
    # StockAnalysis.data_source/data_mode claim the price came from Alpha
    # Vantage — those fields describe the PRICE data's provenance only.
    price_chain = _StubProvider("alpaca", "live", quote=Quote("AAA", 5.0, _TS))
    reference = _StubProvider("alphavantage", "delayed", fundamentals=_FUND)
    mixed = MixedSourceProvider(price_chain, reference)

    mixed.get_quote("AAA")
    assert mixed.name == "alpaca" and mixed.data_mode == "live"

    mixed.get_fundamentals("AAA")
    assert mixed.name == "alpaca" and mixed.data_mode == "live"  # unchanged


def test_missing_reference_provider_is_explicit_per_method():
    price_chain = _StubProvider("alpaca", "live", quote=Quote("AAA", 5.0, _TS))
    mixed = MixedSourceProvider(price_chain, reference=None)

    with pytest.raises(ProviderDataUnavailable, match="ALPHA_VANTAGE_API_KEY"):
        mixed.get_fundamentals("AAA")
    with pytest.raises(ProviderDataUnavailable, match="ALPHA_VANTAGE_API_KEY"):
        mixed.get_news("AAA")
    with pytest.raises(ProviderDataUnavailable, match="ALPHA_VANTAGE_API_KEY"):
        mixed.get_corporate_actions("AAA")


def test_price_chain_failure_propagates_unchanged():
    price_chain = _StubProvider("alpaca", "live", error="Both price vendors down")
    mixed = MixedSourceProvider(price_chain, reference=None)

    with pytest.raises(ProviderDataUnavailable, match="Both price vendors down"):
        mixed.get_quote("AAA")
