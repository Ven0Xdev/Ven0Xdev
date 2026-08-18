"""_RedactSecretsFilter (core/logging.py) — a real, observed leak: httpx's
own internal request logger logs each outbound request's full URL,
including our TWELVE_DATA_API_KEY/ALPHA_VANTAGE_API_KEY query param, at
INFO level, completely bypassing services/data_providers/http_base.py's
sanitize_url() (which only covers this codebase's own log calls). Confirmed
live in `docker logs` before this filter existed. A vendor key must never
reach a log line by any path.
"""
import logging

from app.core.logging import _RedactSecretsFilter


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
