"""Runs `alembic upgrade head` as a distinct, fail-fast deployment step —
BEFORE the API process starts serving traffic, not from inside it.

Why a separate step, not app.main's lifespan: a schema migration must run
exactly once per deploy, not once per replica/worker process. Running it
from inside `lifespan()` means N concurrently-starting replicas would all
race to alter the same tables. This script is meant to be invoked by the
container entrypoint (see Dockerfile) before `uvicorn` is exec'd, so it
runs once, synchronously, and the deploy fails outright (non-zero exit) if
migrations fail — never a partially-migrated schema serving live traffic.

Race safety on Postgres: wraps the upgrade in a session-level
`pg_advisory_lock` so that if this script *does* end up invoked by more
than one replica at once (e.g. a rolling deploy overlap), only one holds
the lock and actually runs the migration; the others block until it
releases, then find the schema already at head and exit cleanly (Alembic's
own upgrade is a no-op once the target revision is already applied). Not
applicable to the SQLite dev/test fallback (a single local file, used by
one process at a time) — that path calls `alembic upgrade head` directly.

Usage: `python scripts/run_migrations.py` (run from the `backend/`
directory, or anywhere — it resolves alembic.ini by its own file location).
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-8s | %(message)s")
logger = logging.getLogger("run_migrations")

BACKEND_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"

# Invoked as `python scripts/run_migrations.py`, so Python only puts this
# script's own directory (backend/scripts/) on sys.path — `app` (backend/app)
# needs backend/ itself on the path to import.
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# A fixed, arbitrary 63-bit key so this lock never collides with another
# advisory lock some other application on the same Postgres instance might
# take — Postgres advisory locks are a flat, database-wide integer
# namespace with no built-in scoping, so an app-specific constant is the
# only thing narrowing it. The value itself carries no meaning.
_ADVISORY_LOCK_KEY = 875_190_442_017


def _sanitized(url: str) -> str:
    """Never print DB credentials, even in a deploy log."""
    if "@" in url:
        scheme_and_creds, host_and_rest = url.split("@", 1)
        scheme = scheme_and_creds.split("://", 1)[0]
        return f"{scheme}://***:***@{host_and_rest}"
    return url


def main() -> int:
    from alembic import command
    from alembic.config import Config

    from app.core.config import get_settings

    settings = get_settings()
    url = settings.sqlalchemy_url
    logger.info("Target database: %s", _sanitized(url))

    if not ALEMBIC_INI.exists():
        logger.error("alembic.ini not found at %s", ALEMBIC_INI)
        return 1

    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", url)

    if url.startswith("sqlite"):
        # Single local file, single process (dev/test) — no cross-replica
        # race is possible, so no advisory lock is needed or available.
        logger.info("SQLite target — running alembic upgrade head directly (no advisory lock).")
        try:
            command.upgrade(cfg, "head")
        except Exception:
            logger.exception("Migration failed.")
            return 1
        logger.info("Migrations applied (or already up to date).")
        return 0

    # Postgres: take a session-level advisory lock around the upgrade so
    # concurrent replicas serialize instead of racing DDL against each
    # other. The lock is released automatically when this connection
    # closes (process exit), so no explicit unlock is required for the
    # common case, but we release it explicitly on the happy path too so a
    # long-lived caller (not just this short-lived script) wouldn't hold it
    # longer than necessary.
    import sqlalchemy

    engine = sqlalchemy.create_engine(url)
    try:
        with engine.connect() as conn:
            logger.info("Acquiring migration advisory lock...")
            conn.execute(sqlalchemy.text("SELECT pg_advisory_lock(:key)"), {"key": _ADVISORY_LOCK_KEY})
            try:
                logger.info("Lock acquired — running alembic upgrade head.")
                command.upgrade(cfg, "head")
                logger.info("Migrations applied (or already up to date).")
            finally:
                conn.execute(sqlalchemy.text("SELECT pg_advisory_unlock(:key)"), {"key": _ADVISORY_LOCK_KEY})
    except Exception:
        logger.exception("Migration failed.")
        return 1
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
