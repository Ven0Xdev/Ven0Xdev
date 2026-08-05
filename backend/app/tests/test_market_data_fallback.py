"""Fallback composite tests: Twelve Data first, Alpha Vantage second, both
down -> one clear ProviderDataUnavailable naming both failures. No real
HTTP involved — the two sub-providers are simple stand-ins so the fallback
*logic* is tested in isolation from either vendor's field mapping (those
are covered by test_twelvedata_provider.py / test_alphavantage_provider.py)."""
import pytest

from app.services.data_providers.base import Quote
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.market_data_fallback import FallbackMarketDataProvider
from datetime import datetime, timezone


class _StubProvider:
    def __init__(self, name, data_mode, quote=None, error=None):
        self.name = name
        self.data_mode = data_mode
        self._quote = quote
        self._error = error

    def get_quote(self, symbol):
        if self._error:
            raise ProviderDataUnavailable(self._error)
        return self._quote

    def get_universe(self, limit=None):
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
