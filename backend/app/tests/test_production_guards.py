"""Production boot-safety guards in app/main.py.

These guards run as top-level module code (not inside a function), and rely
on a fresh, uncached Settings() resolved from the process environment — so
they can only be exercised honestly from a genuinely separate process, not
by monkeypatching the already-imported, already-lru_cache'd settings this
test session shares via conftest.py. A subprocess `python -c "import
app.main"` is the real boot path: success means no RuntimeError was raised
at import time; failure means a guard fired, and stderr carries the message.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]

# A minimal, explicit environment for every subprocess: only the guard-
# relevant variables are asserted on; everything else is deliberately
# absent so no ambient host env var (a stray API key, say) can change the
# outcome. USE_SQLITE_FALLBACK keeps this DB-connection-free (app.main's
# module-level guard code never touches the database — only its lifespan
# does, which we never trigger here).
BASE_ENV = {
    "PATH": os.environ.get("PATH", ""),
    "USE_SQLITE_FALLBACK": "true",
    "SQLITE_PATH": "sqlite:///:memory:",
    "CORS_ORIGINS": "http://localhost:3000",
    "CHAT_BACKEND": "template",
}


def _run_import(overrides: dict[str, str]) -> subprocess.CompletedProcess:
    env = dict(BASE_ENV, **overrides)
    return subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def test_production_refuses_default_secret_key():
    result = _run_import(
        {
            "ENVIRONMENT": "production",
            "SECRET_KEY": "CHANGE_ME_IN_PRODUCTION",
            "AUTH_REQUIRED": "true",
        }
    )
    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr


def test_production_refuses_auth_not_required():
    result = _run_import(
        {
            "ENVIRONMENT": "production",
            "SECRET_KEY": "a-real-production-secret-key-value",
            "AUTH_REQUIRED": "false",
        }
    )
    assert result.returncode != 0
    assert "AUTH_REQUIRED" in result.stderr


def test_production_refuses_silent_mock_provider():
    """The core new guard: MARKET_DATA_PROVIDER=mock (a synthetic provider)
    must not silently boot in production without an explicit opt-in."""
    result = _run_import(
        {
            "ENVIRONMENT": "production",
            "SECRET_KEY": "a-real-production-secret-key-value",
            "AUTH_REQUIRED": "true",
            "MARKET_DATA_PROVIDER": "mock",
        }
    )
    assert result.returncode != 0
    assert "synthetic" in result.stderr.lower()
    assert "ALLOW_SYNTHETIC_DATA" in result.stderr


def test_production_allows_mock_provider_with_explicit_opt_in():
    result = _run_import(
        {
            "ENVIRONMENT": "production",
            "SECRET_KEY": "a-real-production-secret-key-value",
            "AUTH_REQUIRED": "true",
            "MARKET_DATA_PROVIDER": "mock",
            "ALLOW_SYNTHETIC_DATA": "true",
        }
    )
    assert result.returncode == 0, result.stderr


def test_production_allows_misconfigured_real_provider_without_synthetic_opt_in():
    """A real provider missing its API key is NOT a synthetic-data risk — it
    fails loudly per request (ProviderDataUnavailable -> 503), which is
    already the platform's honest "unavailable" contract. It must not be
    blocked by the synthetic-data guard, and must not require
    ALLOW_SYNTHETIC_DATA."""
    result = _run_import(
        {
            "ENVIRONMENT": "production",
            "SECRET_KEY": "a-real-production-secret-key-value",
            "AUTH_REQUIRED": "true",
            "MARKET_DATA_PROVIDER": "twelvedata",
        }
    )
    assert result.returncode == 0, result.stderr


def test_development_boots_with_mock_provider_and_no_opt_in():
    """Non-production environments are completely unaffected by the new
    guard — local dev keeps working on the mock provider with zero config,
    exactly as before this change."""
    result = _run_import(
        {
            "ENVIRONMENT": "development",
            "MARKET_DATA_PROVIDER": "mock",
        }
    )
    assert result.returncode == 0, result.stderr
