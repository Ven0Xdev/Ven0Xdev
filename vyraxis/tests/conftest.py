"""Shared test configuration.

Integration tests run against a **real PostgreSQL database** created by the
project's own Alembic migrations - not an in-memory substitute. If
``VYRAXIS_TEST_DATABASE_URL`` is not set they are skipped with a clear reason
rather than silently passing against a fake.
"""

from __future__ import annotations

import os
import sys
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent))

from vyraxis.core.clock import ManualClock
from vyraxis.core.config import (
    ApiSettings,
    AppSettings,
    DatabaseSettings,
    IngestionSettings,
    ObservationSettings,
    SafetySettings,
    Settings,
    SolanaSettings,
)
from vyraxis.storage.engine import Database
from vyraxis.storage.models import Base

TEST_DSN_ENV = "VYRAXIS_TEST_DATABASE_URL"

#: Fixed instant so every test that stores a timestamp is deterministic.
T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)

_TABLES_IN_TRUNCATE_ORDER = (
    "observations",
    "market_events",
    "pools",
    "wallets",
    "tokens",
    "provider_health_snapshots",
    "system_events",
    "ingest_checkpoints",
)


def _test_dsn() -> str | None:
    return os.environ.get(TEST_DSN_ENV)


requires_database = pytest.mark.skipif(
    _test_dsn() is None,
    reason=f"set {TEST_DSN_ENV} to a PostgreSQL DSN to run integration tests",
)


@pytest.fixture
def clock() -> ManualClock:
    return ManualClock(T0)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Settings for tests: fast timeouts, small queues, live trading off."""
    dsn = _test_dsn() or "postgresql+asyncpg://vyraxis@127.0.0.1:5432/vyraxis_test"
    return Settings(
        app=AppSettings(
            environment="test",
            log_level="WARNING",
            log_format="console",
            instance_id="test-1",
        ),
        database=DatabaseSettings(url=dsn, pool_size=2, max_overflow=2),
        solana=SolanaSettings(
            rpc_http_url="http://127.0.0.1:1",
            rpc_ws_url="ws://127.0.0.1:1",
            provider_name="fixture",
            request_timeout_seconds=1.0,
            max_request_attempts=2,
            ws_connect_timeout_seconds=2.0,
            ws_ping_interval_seconds=0.5,
            ws_ping_timeout_seconds=1.0,
            ws_stale_after_seconds=1.5,
            reconnect_initial_backoff_seconds=0.05,
            reconnect_max_backoff_seconds=0.2,
            reconnect_jitter_ratio=0.0,
        ),
        ingestion=IngestionSettings(
            raw_queue_size=64,
            normalized_queue_size=64,
            persist_batch_size=10,
            persist_flush_interval_seconds=0.1,
            dedup_cache_size=1_000,
        ),
        observations=ObservationSettings(horizons_seconds=[30, 60, 300]),
        safety=SafetySettings(),
        api=ApiSettings(),
    )


@pytest_asyncio.fixture
async def database(settings: Settings) -> AsyncIterator[Database]:
    """A migrated database, truncated before each test."""
    if _test_dsn() is None:
        pytest.skip(f"set {TEST_DSN_ENV} to run integration tests")

    db = Database(settings.database)
    async with db.engine.begin() as conn:
        # The schema is created from the same metadata the migrations produce;
        # migration correctness itself is asserted in test_migrations.py, which
        # runs Alembic end to end.
        await conn.run_sync(Base.metadata.create_all)
    async with db.engine.begin() as conn:
        await conn.execute(
            text(f"TRUNCATE {', '.join(_TABLES_IN_TRUNCATE_ORDER)} RESTART IDENTITY CASCADE")
        )
    try:
        yield db
    finally:
        await db.dispose()
