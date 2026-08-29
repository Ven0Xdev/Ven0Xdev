"""Alembic environment.

The DSN always comes from VYRAXIS settings, never from alembic.ini, so that
migrations cannot be pointed at a different database than the application by
editing a config file nobody reads.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from vyraxis.core.config import get_settings
from vyraxis.storage.models import Base

config = context.config

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(
    _obj: object,
    _name: str | None,
    type_: str,
    _reflected: bool,
    _compare_to: object,
) -> bool:
    """Filter objects considered by autogenerate and ``alembic check``.

    CHECK constraints are excluded from comparison. Every CHECK in this schema
    comes from ``string_enum`` (VARCHAR + allowed-values check). SQLAlchemy
    creates those via DDL events rather than persistent metadata constraints, so
    autogenerate sees them in the live database but not in ``Base.metadata`` and
    reports all eight as drift on every run. Excluding them keeps ``alembic
    check`` a meaningful signal for the drift it *can* detect: added or removed
    tables, columns, indexes, foreign keys and types.

    Consequence to remember: **adding a member to a StrEnum will not be picked
    up by autogenerate.** The corresponding CHECK constraint must be updated in
    a hand-written migration. See docs/DATA_MODEL.md.
    """
    return type_ != "check_constraint"


def _dsn() -> str:
    override = config.attributes.get("dsn")
    if override:
        return str(override)
    return get_settings().database.dsn


def run_migrations_offline() -> None:
    context.configure(
        url=_dsn(),
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        {"sqlalchemy.url": _dsn()},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    connectable = config.attributes.get("connection")
    if connectable is not None:
        do_run_migrations(connectable)
        return
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
