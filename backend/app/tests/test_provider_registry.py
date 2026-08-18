import pytest

from app.core.config import Settings, get_settings
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.registry import build_provider, registered_providers


def test_all_expected_providers_registered():
    names = registered_providers()
    for expected in (
        "mock", "finnhub", "polygon", "otc_markets", "alpaca", "alpaca_only",
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
    for name, vendor in (("polygon", "Polygon"), ("otc_markets", "OTC Markets")):
        provider = build_provider(name, get_settings())
        with pytest.raises(ProviderDataUnavailable, match=vendor):
            provider.get_quote("ANY")


def test_alpaca_only_builds_and_reports_offline_without_keys():
    # Explicit Settings with keys forced off — must not depend on whatever
    # happens to be in the local .env, and must never make a real network
    # call in this suite.
    settings = Settings(alpaca_api_key=None, alpaca_api_secret=None)
    with pytest.raises(ProviderDataUnavailable, match="ALPACA_API_KEY"):
        build_provider("alpaca_only", settings)


def test_alpaca_builds_with_fallback_when_no_keys_set():
    settings = Settings(
        alpaca_api_key=None, alpaca_api_secret=None,
        twelve_data_api_key=None, alpha_vantage_api_key=None,
    )
    provider = build_provider("alpaca", settings)
    assert provider.name == "alpaca"
    with pytest.raises(ProviderDataUnavailable):
        provider.get_quote("AAA")
    with pytest.raises(ProviderDataUnavailable):
        provider.get_fundamentals("AAA")


def test_provider_name_case_insensitive():
    provider = build_provider("MOCK", get_settings())
    assert provider.name == "mock"
