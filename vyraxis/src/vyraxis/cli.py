"""VYRAXIS command line.

Commands do exactly what their name says and report truthfully. Nothing here
fabricates data when a dependency is unavailable: if RPC is unreachable,
``programs verify`` reports that it could not verify, it does not print a
reassuring table.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Annotated, Any

import typer

from vyraxis.core.config import Settings, get_settings
from vyraxis.core.errors import ProviderError, VyraxisError
from vyraxis.core.logging import configure_logging

app = typer.Typer(
    name="vyraxis",
    help="VYRAXIS - Solana memecoin research platform (research only; no live trading).",
    no_args_is_help=True,
    add_completion=False,
)
db_app = typer.Typer(help="Database and migration commands.", no_args_is_help=True)
programs_app = typer.Typer(help="Program registry commands.", no_args_is_help=True)
ingest_app = typer.Typer(help="Data engine commands.", no_args_is_help=True)
app.add_typer(db_app, name="db")
app.add_typer(programs_app, name="programs")
app.add_typer(ingest_app, name="ingest")

REPO_ROOT = Path(__file__).resolve().parents[2]


@app.callback()
def _configure(ctx: typer.Context) -> None:
    """Configure logging before any command runs.

    Without this, structlog falls back to its default stdout logger and mixes
    log lines into a command's JSON output, breaking `vyraxis ... | jq`. Logs
    go to stderr; command results go to stdout.
    """
    if ctx.resilient_parsing:
        return
    try:
        settings = get_settings()
    except VyraxisError:
        configure_logging(level="INFO", fmt="console")
        return
    configure_logging(
        level=settings.app.log_level,
        fmt=settings.app.log_format,
        service_name=settings.app.service_name,
        instance_id=settings.app.instance_id,
    )


def _settings() -> Settings:
    try:
        return get_settings()
    except VyraxisError as exc:
        typer.secho(f"configuration error: {exc}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=2) from exc


def _print(payload: Any) -> None:
    typer.echo(json.dumps(payload, indent=2, default=str, sort_keys=True))


@app.command("config")
def show_config() -> None:
    """Print the effective configuration with secrets redacted."""
    _print(_settings().describe())


@app.command("version")
def show_version() -> None:
    from vyraxis import __version__

    typer.echo(__version__)


@db_app.command("upgrade")
def db_upgrade(revision: str = "head") -> None:
    """Apply migrations up to REVISION (default: head)."""
    from alembic import command
    from alembic.config import Config

    settings = _settings()
    config = Config(str(REPO_ROOT / "alembic.ini"))
    config.attributes["dsn"] = settings.database.dsn
    command.upgrade(config, revision)
    typer.secho(f"migrated to {revision}", fg=typer.colors.GREEN)


@db_app.command("current")
def db_current() -> None:
    """Show the applied migration revision."""
    from alembic import command
    from alembic.config import Config

    settings = _settings()
    config = Config(str(REPO_ROOT / "alembic.ini"))
    config.attributes["dsn"] = settings.database.dsn
    command.current(config, verbose=True)


@db_app.command("ping")
def db_ping() -> None:
    """Check database connectivity and report round-trip latency."""
    from vyraxis.storage.engine import Database

    settings = _settings()

    async def run() -> None:
        database = Database(settings.database)
        try:
            latency = await database.ping()
            version = await database.server_version()
            _print(
                {
                    "database": database.safe_dsn,
                    "latency_ms": round(latency, 3),
                    "server_version": version,
                }
            )
        finally:
            await database.dispose()

    asyncio.run(run())


@app.command("health")
def health() -> None:
    """Run every health check once and print the report.

    Exits non-zero when the aggregate status is not healthy, so it is usable as
    a container health probe.
    """
    from vyraxis.app import VyraxisApp
    from vyraxis.core.enums import HealthStatus

    settings = _settings()

    async def run() -> int:
        instance = VyraxisApp.build(settings, configure_logs=False)
        try:
            report = await instance.check_health()
            _print(report.to_dict())
            return 0 if report.status is HealthStatus.HEALTHY else 1
        finally:
            await instance.shutdown()

    raise typer.Exit(code=asyncio.run(run()))


@programs_app.command("list")
def programs_list() -> None:
    """List the program registry (structural validation only)."""
    from vyraxis.solana import programs as registry

    _print(
        [
            {
                "program_id": info.program_id,
                "label": info.label,
                "category": info.category,
                "default_watch": info.default_watch,
            }
            for info in registry.REGISTRY
        ]
    )


@programs_app.command("verify")
def programs_verify() -> None:
    """Verify every registry program ID against the chain via getAccountInfo.

    This is the check that turns the registry from "constants an engineer typed"
    into "accounts that exist on chain and are executable". It requires a
    reachable RPC endpoint; if RPC fails, the failure is reported and the
    command exits non-zero rather than claiming the IDs are fine.
    """
    from vyraxis.solana import programs as registry
    from vyraxis.solana.rpc import SolanaRpcClient

    settings = _settings()

    async def run() -> int:
        client = SolanaRpcClient(settings.solana)
        rows: list[dict[str, Any]] = []
        failures = 0
        try:
            for info in registry.REGISTRY:
                try:
                    account = await client.get_account_info(info.program_id)
                except ProviderError as exc:
                    failures += 1
                    rows.append(
                        {
                            "program_id": info.program_id,
                            "label": info.label,
                            "verified": False,
                            "error": str(exc),
                        }
                    )
                    continue
                if account is None:
                    failures += 1
                    rows.append(
                        {
                            "program_id": info.program_id,
                            "label": info.label,
                            "verified": False,
                            "error": "account not found on chain",
                        }
                    )
                    continue
                ok = account.executable
                if not ok:
                    failures += 1
                rows.append(
                    {
                        "program_id": info.program_id,
                        "label": info.label,
                        "verified": ok,
                        "executable": account.executable,
                        "owner": account.owner,
                        "lamports": account.lamports,
                    }
                )
        finally:
            await client.close()

        _print({"endpoint": settings.solana.rpc_http_url, "failures": failures, "programs": rows})
        return 1 if failures else 0

    raise typer.Exit(code=asyncio.run(run()))


@ingest_app.command("run")
def ingest_run(
    max_events: Annotated[
        int | None,
        typer.Option(help="Stop after this many events are queued. Omit to run indefinitely."),
    ] = None,
) -> None:
    """Run the data engine: subscribe, normalize, deduplicate and persist."""
    from vyraxis.app import VyraxisApp

    settings = _settings()

    async def run() -> None:
        instance = VyraxisApp.build(settings)
        try:
            stats = await instance.pipeline.run(max_events=max_events)
            _print(stats.snapshot())
        finally:
            await instance.shutdown()

    asyncio.run(run())


@ingest_app.command("status")
def ingest_status() -> None:
    """Print ingestion counters from the database (no live connection)."""
    from sqlalchemy import func, select

    from vyraxis.storage.engine import Database
    from vyraxis.storage.models import (
        IngestCheckpoint,
        MarketEvent,
        Observation,
        Pool,
        SystemEvent,
        Token,
        Wallet,
    )

    settings = _settings()

    async def run() -> None:
        database = Database(settings.database)
        try:
            async with database.session() as session:
                counts = {}
                for model in (Token, Pool, Wallet, MarketEvent, Observation, SystemEvent):
                    result = await session.execute(select(func.count()).select_from(model))
                    counts[model.__tablename__] = int(result.scalar_one())
                checkpoints = (await session.execute(select(IngestCheckpoint))).scalars().all()
                _print(
                    {
                        "row_counts": counts,
                        "checkpoints": [
                            {
                                "stream": cp.stream,
                                "last_slot": cp.last_slot,
                                "events_ingested": cp.events_ingested,
                                "updated_at": cp.updated_at.isoformat(),
                            }
                            for cp in checkpoints
                        ],
                    }
                )
        finally:
            await database.dispose()

    asyncio.run(run())


@app.command("serve")
def serve() -> None:
    """Serve the health/status API."""
    import uvicorn

    from vyraxis.api.server import create_app
    from vyraxis.app import VyraxisApp

    settings = _settings()
    instance = VyraxisApp.build(settings)
    uvicorn.run(
        create_app(instance),
        host=settings.api.host,
        port=settings.api.port,
        log_config=None,
    )


def main() -> None:
    app()


if __name__ == "__main__":
    main()
