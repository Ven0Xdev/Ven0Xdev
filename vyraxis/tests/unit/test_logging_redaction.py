"""No secret may reach a log line, whatever the call site does."""

from __future__ import annotations

import pytest

from vyraxis.core.logging import REDACTED, redaction_processor, scrub_text


def _process(event: dict[str, object]) -> dict[str, object]:
    return redaction_processor(None, "info", event)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "key",
    [
        "password",
        "db_password",
        "API_KEY",
        "apikey",
        "rpc_token",
        "authorization",
        "private_key",
        "seed_phrase",
        "mnemonic",
        "keypair",
        "signing_key",
        "aws_credential",
    ],
)
def test_sensitive_keys_are_redacted(key: str) -> None:
    assert _process({key: "super-secret"})[key] == REDACTED


def test_dsn_password_is_removed() -> None:
    out = _process({"dsn": "postgresql+asyncpg://user:hunter2@db:5432/vyraxis"})
    assert "hunter2" not in str(out["dsn"])
    assert out["dsn"] == "postgresql+asyncpg://***:***@db:5432/vyraxis"


def test_api_key_in_query_string_is_removed() -> None:
    out = scrub_text("wss://mainnet.example-rpc.com/?api-key=abc123def")
    assert "abc123def" not in out
    assert REDACTED in out


def test_nested_structures_are_scrubbed() -> None:
    out = _process(
        {
            "config": {
                "database": {"password": "p"},
                "endpoints": ["https://u:pw@rpc.example.com"],
            }
        }
    )
    rendered = str(out)
    assert "'p'" not in rendered
    assert "pw@" not in rendered


def test_non_sensitive_values_pass_through_unchanged() -> None:
    out = _process({"slot": 123, "mint": "So11111111111111111111111111111111111111112"})
    assert out["slot"] == 123
    assert out["mint"] == "So11111111111111111111111111111111111111112"


def test_deeply_nested_input_does_not_recurse_forever() -> None:
    payload: dict[str, object] = {"level": "x"}
    for _ in range(50):
        payload = {"level": payload}
    _process(payload)  # must return, not raise RecursionError


def test_logging_survives_stderr_being_replaced() -> None:
    """A captured stderr handle that is later closed must not break logging.

    CLI test runners, log rotation and re-opened process streams all replace
    sys.stderr; a logger bound to the old object raises "I/O operation on
    closed file" on the next call.
    """
    import io
    import sys

    from vyraxis.core.logging import configure_logging, get_logger

    original = sys.stderr
    replacement = io.StringIO()
    try:
        sys.stderr = replacement
        configure_logging(level="INFO", fmt="json")
        get_logger("t").info("while_replaced")
        assert "while_replaced" in replacement.getvalue()
        replacement.close()
        sys.stderr = original
        # The old stream is now closed; logging must still work.
        get_logger("t").info("after_close")
    finally:
        sys.stderr = original
        configure_logging(level="WARNING", fmt="console")
