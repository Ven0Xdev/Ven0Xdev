"""Regression coverage for conftest.py's MARKET_DATA_PROVIDER override.

backend/.env now legitimately holds real TWELVE_DATA_API_KEY/
ALPHA_VANTAGE_API_KEY credentials and MARKET_DATA_PROVIDER=twelvedata for
local live-data testing (set directly by the operator, never by this test
suite). Running `pytest` must never silently make real vendor HTTP calls
because of that — MOCK must never accidentally become LIVE just because the
developer's machine happens to have keys configured. conftest.py's
os.environ.setdefault("MARKET_DATA_PROVIDER", "mock") is what enforces
this; this file exists so a future edit that drops that line fails loudly
here instead of manifesting as random real-API-call test flakiness
elsewhere.
"""
from app.core.config import get_settings
from app.services.data_providers.factory import get_data_provider
from app.services.data_providers.mock_provider import MockOTCProvider


def test_settings_resolve_to_mock_under_the_test_session():
    # get_settings() is process-wide @lru_cache'd — if this is ever
    # anything other than "mock" while running under pytest, every test
    # relying on the implicit provider is silently hitting a real vendor.
    assert get_settings().market_data_provider == "mock"


def test_default_data_provider_is_the_mock_provider_under_test():
    assert isinstance(get_data_provider(), MockOTCProvider)


def test_default_data_provider_data_mode_is_synthetic_never_live():
    provider = get_data_provider()
    assert provider.data_mode == "synthetic"
