import pytest

from app.core.config import get_settings
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.registry import build_provider, registered_providers


def test_all_expected_providers_registered():
    names = registered_providers()
    for expected in ("mock", "finnhub", "polygon", "otc_markets", "alpaca"):
        assert expected in names


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
