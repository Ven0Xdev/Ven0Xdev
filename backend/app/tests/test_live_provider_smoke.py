"""Explicit LIVE-vendor smoke test — NOT part of the default `pytest` run's
guaranteed-green contract in the sense that it requires real credentials.
It is not `pytest.mark.skip`-disabled by fiat; it self-skips at collection
time via `skipif` when TWELVE_DATA_API_KEY / ALPHA_VANTAGE_API_KEY are both
absent from the environment, which is the honest way to represent "cannot
be verified here" without ever reporting a fabricated pass.

Run explicitly once real keys are configured:

    TWELVE_DATA_API_KEY=... ALPHA_VANTAGE_API_KEY=... \
        pytest app/tests/test_live_provider_smoke.py -v -s

This test module makes real outbound HTTP calls to twelvedata.com and/or
alphavantage.co — it is deliberately excluded from CI's default `pytest
app/tests -q` expectations for that reason (no vendor credentials are
provisioned in CI), matching the mocked-transport coverage in
test_twelvedata_provider.py / test_alphavantage_provider.py /
test_market_data_fallback.py, which already exercise this exact logic
(quote/OHLCV mapping, fallback, cache, rate-limit, invalid-symbol, typed
errors) against a fake transport and run in every `pytest` invocation.
"""
from __future__ import annotations

import os

import pytest

from app.core.config import get_settings
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.data_providers.registry import build_provider

HAS_LIVE_CREDENTIALS = bool(os.environ.get("TWELVE_DATA_API_KEY")) or bool(os.environ.get("ALPHA_VANTAGE_API_KEY"))

pytestmark = pytest.mark.skipif(
    not HAS_LIVE_CREDENTIALS,
    reason="No TWELVE_DATA_API_KEY/ALPHA_VANTAGE_API_KEY in this environment — live provider verification is blocked, not passing.",
)

SYMBOLS = ["AAPL", "NVDA", "SPY", "GLD"]


@pytest.fixture(scope="module")
def live_provider():
    return build_provider("twelvedata", get_settings())


@pytest.mark.parametrize("symbol", SYMBOLS)
def test_live_quote(live_provider, symbol):
    quote = live_provider.get_quote(symbol)
    assert quote.symbol == symbol
    assert quote.last > 0
    assert live_provider.data_mode in ("delayed", "cached")


@pytest.mark.parametrize("symbol", SYMBOLS)
def test_live_ohlcv(live_provider, symbol):
    df = live_provider.get_ohlcv(symbol, lookback_days=30)
    assert len(df) > 0
    assert {"open", "high", "low", "close", "volume"} <= set(df.columns)


def test_invalid_symbol_fails_honestly(live_provider):
    with pytest.raises(ProviderDataUnavailable):
        live_provider.get_quote("ZZZZZZ_NOT_A_REAL_SYMBOL")


def test_no_secrets_in_error_message(live_provider):
    """Every ProviderDataUnavailable message must be safe to log/display —
    confirms sanitize_url()'s redaction reaches this call path even under
    real (not mocked) vendor responses."""
    try:
        live_provider.get_quote("ZZZZZZ_NOT_A_REAL_SYMBOL")
    except ProviderDataUnavailable as exc:
        message = str(exc)
        for key_name in ("TWELVE_DATA_API_KEY", "ALPHA_VANTAGE_API_KEY"):
            key_value = os.environ.get(key_name)
            if key_value:
                assert key_value not in message
