"""CLI contract: clean stdout, honest exit codes, no secrets."""

from __future__ import annotations

import json

import pytest
from typer.testing import CliRunner

from vyraxis.cli import app

runner = CliRunner()


def test_version_is_printed() -> None:
    from vyraxis import __version__

    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert result.stdout.strip() == __version__


def test_config_output_is_valid_json_with_no_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    """`vyraxis config | jq` must work, and must never leak the password."""
    monkeypatch.setenv("VYRAXIS_DATABASE__URL", "postgresql+asyncpg://user:hunter2@db:5432/vyraxis")
    from vyraxis.core.config import reset_settings_cache

    reset_settings_cache()
    try:
        result = runner.invoke(app, ["config"])
        assert result.exit_code == 0
        payload = json.loads(result.stdout)
        assert "hunter2" not in result.stdout
        assert payload["database"]["url"] == "postgresql+asyncpg://***:***@db:5432/vyraxis"
        assert payload["safety"]["live_trading_enabled"] is False
    finally:
        reset_settings_cache()


def test_programs_list_is_valid_json() -> None:
    result = runner.invoke(app, ["programs", "list"])
    assert result.exit_code == 0
    rows = json.loads(result.stdout)
    assert len(rows) >= 10
    assert all({"program_id", "label", "category"} <= set(row) for row in rows)


def test_invalid_configuration_exits_with_a_clear_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A bad DSN must fail loudly at startup, not surface later as a query error."""
    monkeypatch.setenv("VYRAXIS_DATABASE__URL", "mysql://user:pw@host/db")
    from vyraxis.core.config import reset_settings_cache

    reset_settings_cache()
    try:
        result = runner.invoke(app, ["config"])
        assert result.exit_code == 2
        assert "configuration error" in result.output
    finally:
        reset_settings_cache()


def test_live_trading_flag_is_refused_by_the_cli(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VYRAXIS_SAFETY__LIVE_TRADING_ENABLED", "true")
    from vyraxis.core.config import reset_settings_cache

    reset_settings_cache()
    try:
        result = runner.invoke(app, ["config"])
        assert result.exit_code == 2
        assert "live trading is not implemented" in result.output
    finally:
        reset_settings_cache()


def test_help_states_that_live_trading_is_absent() -> None:
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "no live trading" in result.stdout
