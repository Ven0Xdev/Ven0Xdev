"""Async engine and session management."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from vyraxis.core.config import DatabaseSettings
from vyraxis.core.errors import StorageError
from vyraxis.core.logging import get_logger

log = get_logger(__name__)


def create_engine(settings: DatabaseSettings) -> AsyncEngine:
    """Build an ``AsyncEngine`` from settings.

    ``pool_pre_ping`` is on because ingestion runs for days at a time and a
    connection killed by an idle timeout must be replaced transparently rather
    than surfacing as a spurious ingestion failure.
    """
    return create_async_engine(
        settings.dsn,
        echo=settings.echo_sql,
        pool_size=settings.pool_size,
        max_overflow=settings.max_overflow,
        pool_timeout=settings.pool_timeout_seconds,
        pool_pre_ping=True,
        connect_args={
            "command_timeout": settings.command_timeout_seconds,
            "server_settings": {"application_name": "vyraxis"},
        },
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=engine,
        expire_on_commit=False,
        autoflush=False,
    )


class Database:
    """Owns the engine and hands out sessions.

    Held by the application, not imported as a module-level global, so tests
    and multiple workers can each have their own.
    """

    def __init__(self, settings: DatabaseSettings) -> None:
        self._settings = settings
        self._engine: AsyncEngine = create_engine(settings)
        self._session_factory = create_session_factory(self._engine)

    @property
    def engine(self) -> AsyncEngine:
        return self._engine

    @property
    def safe_dsn(self) -> str:
        return self._settings.safe_dsn

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """Yield a session inside a transaction, rolling back on any exception."""
        async with self._session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def ping(self) -> float:
        """Round-trip a trivial query; returns latency in milliseconds."""
        started = time.perf_counter()
        try:
            async with self._engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception as exc:
            raise StorageError("database ping failed", error=str(exc)) from exc
        return (time.perf_counter() - started) * 1000.0

    async def server_version(self) -> str:
        async with self._engine.connect() as conn:
            result = await conn.execute(text("SHOW server_version"))
            return str(result.scalar_one())

    async def dispose(self) -> None:
        await self._engine.dispose()

    async def __aenter__(self) -> Database:
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.dispose()
