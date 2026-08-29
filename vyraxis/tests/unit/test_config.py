"""Configuration must fail closed and must never leak secrets."""

from __future__ import annotations

import pytest
from pydantic import SecretStr, ValidationError

from vyraxis.core.config import (
    DatabaseSettings,
    SafetySettings,
    Settings,
    SolanaSettings,
    get_settings,
    redact_dsn,
    reset_settings_cache,
)
from vyraxis.core.errors import ConfigurationError


def test_live_trading_cannot_be_enabled() -> None:
    with pytest.raises(ValidationError, match="live trading is not implemented"):
        SafetySettings(live_trading_enabled=True)


def test_live_trading_flag_from_environment_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VYRAXIS_SAFETY__LIVE_TRADING_ENABLED", "true")
    reset_settings_cache()
    with pytest.raises(ConfigurationError):
        get_settings()
    reset_settings_cache()


def test_database_url_must_be_postgres() -> None:
    with pytest.raises(ValidationError, match="postgresql\\+asyncpg"):
        DatabaseSettings(url=SecretStr("mysql://user:pw@host/db"))
    with pytest.raises(ValidationError, match="postgresql\\+asyncpg"):
        DatabaseSettings(url=SecretStr("sqlite+aiosqlite:///:memory:"))


def test_plain_postgres_url_is_upgraded_to_asyncpg() -> None:
    settings = DatabaseSettings(url=SecretStr("postgresql://user:pw@host:5432/db"))
    assert settings.dsn.startswith("postgresql+asyncpg://")


def test_dsn_credentials_are_redacted() -> None:
    settings = DatabaseSettings(url=SecretStr("postgresql+asyncpg://user:hunter2@host:5432/db"))
    assert "hunter2" not in settings.safe_dsn
    assert settings.safe_dsn == "postgresql+asyncpg://***:***@host:5432/db"


def test_describe_never_contains_the_password() -> None:
    settings = Settings(
        database=DatabaseSettings(url=SecretStr("postgresql+asyncpg://u:s3cr3t@h:5432/d"))
    )
    rendered = str(settings.describe())
    assert "s3cr3t" not in rendered


def test_secret_str_hides_password_in_repr() -> None:
    settings = DatabaseSettings(url=SecretStr("postgresql+asyncpg://u:s3cr3t@h:5432/d"))
    assert "s3cr3t" not in repr(settings)
    assert "s3cr3t" not in str(settings.url)


def test_websocket_url_scheme_is_validated() -> None:
    with pytest.raises(ValidationError, match="rpc_ws_url must be ws"):
        SolanaSettings(rpc_ws_url="http://example.com")
    with pytest.raises(ValidationError, match="rpc_http_url must be http"):
        SolanaSettings(rpc_http_url="ws://example.com")


def test_stale_window_must_exceed_ping_interval() -> None:
    # Otherwise every healthy idle connection is recycled on each ping cycle.
    with pytest.raises(ValidationError, match="ws_stale_after_seconds must exceed"):
        SolanaSettings(ws_ping_interval_seconds=30, ws_stale_after_seconds=10)


def test_backoff_ceiling_must_not_be_below_the_floor() -> None:
    with pytest.raises(ValidationError, match="reconnect_max_backoff_seconds"):
        SolanaSettings(reconnect_initial_backoff_seconds=10, reconnect_max_backoff_seconds=1)


def test_observation_horizons_are_sorted_and_unique() -> None:
    from vyraxis.core.config import ObservationSettings

    assert ObservationSettings(horizons_seconds=[300, 30, 60]).horizons_seconds == [30, 60, 300]
    with pytest.raises(ValidationError, match="unique"):
        ObservationSettings(horizons_seconds=[30, 30])
    with pytest.raises(ValidationError, match="positive"):
        ObservationSettings(horizons_seconds=[0])


def test_redact_dsn_handles_urls_without_credentials() -> None:
    assert redact_dsn("postgresql+asyncpg://host:5432/db") == "postgresql+asyncpg://host:5432/db"
