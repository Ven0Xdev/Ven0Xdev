import pytest

from app.core.config import Settings, get_settings
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.registry import build_provider, registered_providers


def test_all_expected_providers_registered():
    names = registered_providers()
    for expected in (
        "mock", "finnhub", "polygon", "otc_markets", "alpaca",
        "twelvedata", "twelvedata_only", "alphavantage",
    ):
        assert expected in names


def test_twelvedata_builds_with_fallback_when_no_keys_set():
    # Explicit Settings with both keys forced off — must not depend on
    # whatever happens to be in the local .env, and must never make a real
    # network call in this suite. The composite must still *build* (never a
    # hard failure at construction time) and report an honest offline error
    # on first use rather than silently succeeding or fabricating data.
    settings = Settings(twelve_data_api_key=None, alpha_vantage_api_key=None)
    provider = build_provider("twelvedata", settings)
    assert provider.name == "twelvedata"
    with pytest.raises(ProviderDataUnavailable):
        provider.get_quote("AAA")


def test_unknown_provider_fails_with_registered_list():
    with pytest.raises(ValueError, match="Registered providers"):
        build_provider("does_not_exist", get_settings())


def test_mock_builds_and_serves():
    provider = build_provider("mock", get_settings())
    assert provider.get_universe(limit=3)


def test_unimplemented_adapters_fail_loud_and_named():
    for name, vendor in (("polygon", "Polygon"), ("otc_markets", "OTC Markets"), ("alpaca", "Alpaca")):
        provider = build_provider(name, get_settings())
        with pytest.raises(ProviderDataUnavailable, match=vendor):
            provider.get_quote("ANY")


def test_provider_name_case_insensitive():
    provider = build_provider("MOCK", get_settings())
    assert provider.name == "mock"
