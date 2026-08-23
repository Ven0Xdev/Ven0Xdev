"""_RedactSecretsFilter (core/logging.py) — two real, observed leaks, not
hypothetical ones:

1. httpx's own internal request logger logs each outbound request's full
   URL, including our TWELVE_DATA_API_KEY/ALPHA_VANTAGE_API_KEY query
   param, at INFO level — bypasses services/data_providers/http_base.py's
   sanitize_url() (which only covers this codebase's own log calls).
2. `websockets`'s own DEBUG-level frame logging printed Alpaca's raw WS
   auth JSON body ({"action":"auth","key":"...","secret":"..."}) to
   `docker logs` in plaintext — a completely different shape (JSON field,
   not query param) than leak #1, confirmed live.

A vendor key must never reach a log line by any path, in any format.
"""
import logging

import pytest

from app.core import logging as logging_module
from app.core.logging import _RedactSecretsFilter, register_secret


@pytest.fixture(autouse=True)
def _reset_registered_secrets():
    logging_module._registered_secrets = []
    yield
    logging_module._registered_secrets = []


def _filtered_message(msg: str, args: tuple = ()) -> str:
    record = logging.LogRecord(
        name="httpx", level=logging.INFO, pathname=__file__, lineno=1,
        msg=msg, args=args, exc_info=None,
    )
    _RedactSecretsFilter().filter(record)
    return record.getMessage()


def test_redacts_apikey_query_param():
    out = _filtered_message('HTTP Request: GET https://api.twelvedata.com/quote?apikey=SUPERSECRET123&symbol=XLK "HTTP/1.1 200 OK"')
    assert "SUPERSECRET123" not in out
    assert "apikey=***" in out
    assert "symbol=XLK" in out  # non-secret params untouched


def test_redacts_apikey_regardless_of_case():
    out = _filtered_message("GET /x?ApiKey=SECRETVALUE&symbol=AAPL")
    assert "SECRETVALUE" not in out


def test_redacts_token_and_key_params():
    assert "T0K3N" not in _filtered_message("GET /x?token=T0K3N")
    assert "K3YVAL" not in _filtered_message("GET /x?key=K3YVAL")


def test_redacts_when_message_built_from_percent_args():
    # httpx's actual call shape: logger.info("HTTP Request: %s %s ...", method, url)
    out = _filtered_message(
        "HTTP Request: %s %s",
        ("GET", "https://api.twelvedata.com/quote?apikey=REALKEY999&symbol=SPY"),
    )
    assert "REALKEY999" not in out


def test_leaves_ordinary_messages_unchanged():
    out = _filtered_message("Starting Nexora — AI Financial Intelligence (environment=development)")
    assert out == "Starting Nexora — AI Financial Intelligence (environment=development)"


def test_redacts_alpaca_ws_auth_json_body():
    # The exact shape confirmed live: websockets' DEBUG frame logger
    # printed this whole line verbatim, including the real key/secret.
    raw = '> TEXT \'{"action": "auth", "key": "PKHWBUPEO4VLVPJECYNJ", "secret": "iz9bJ2X78USFKxaWVrLvu"}\' [113 bytes]'
    out = _filtered_message(raw)
    assert "PKHWBUPEO4VLVPJECYNJ" not in out
    assert "iz9bJ2X78USFKxaWVrLvu" not in out
    assert '"key": "***"' in out
    assert '"secret": "***"' in out
    assert '"action": "auth"' in out  # non-secret fields untouched


def test_redacts_json_field_regardless_of_field_name_case():
    out = _filtered_message('{"apiKey": "SUPERSECRET"}')
    assert "SUPERSECRET" not in out


def test_registered_secret_value_redacted_regardless_of_surrounding_format():
    # Belt-and-suspenders: a registered secret is redacted verbatim even in
    # a shape neither pattern-based regex anticipates.
    register_secret("MyVeryRealSecretValue123")
    out = _filtered_message("some future library logs: key=MyVeryRealSecretValue123 embedded oddly")
    assert "MyVeryRealSecretValue123" not in out


def test_short_values_are_not_registered_to_avoid_over_redaction():
    register_secret("ab")  # too short to plausibly be a real secret
    out = _filtered_message("this message happens to contain ab somewhere")
    assert "ab" in out  # not mangled by an accidental short-value match


def test_register_secret_ignores_none_and_empty():
    register_secret(None)
    register_secret("")
    out = _filtered_message("ordinary message")
    assert out == "ordinary message"
