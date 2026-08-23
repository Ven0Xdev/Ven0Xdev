"""Database *schema* readiness — distinct from `/health`'s plain process/DB-
connectivity liveness check. A process can be up and able to reach the
database (liveness: OK) while the database's schema is still on an older
Alembic revision than the code expects (readiness: NOT OK) — e.g. mid
rolling-deploy, or the migration step (scripts/run_migrations.py) was
skipped. Orchestrators (Railway/Kubernetes/etc.) should gate traffic
routing on readiness, not just liveness.

Deliberately returns only booleans and revision-id strings — no DSN, no
stack trace, no row counts — so this is safe to leave unauthenticated
(container platforms probe readiness endpoints without credentials).
"""
from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[3]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def _expected_head() -> str | None:
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        cfg = Config(str(ALEMBIC_INI))
        return ScriptDirectory.from_config(cfg).get_current_head()
    except Exception:
        logger.exception("schema readiness: could not resolve expected Alembic head")
        return None


def get_schema_status(url: str | None = None, db_engine=None) -> dict:
    """`url`/`db_engine` overrides exist so tests can exercise the Postgres
    branch's logic (missing/mismatched/matching alembic_version) against a
    real throwaway SQLite engine, without needing a live Postgres instance
    — no live Postgres is available in this development environment. Real
    callers (the /health/ready route) always use the defaults."""
    settings = get_settings()
    url = url if url is not None else settings.sqlalchemy_url
    db_engine = db_engine if db_engine is not None else engine

    if url.startswith("sqlite"):
        # The explicitly-supported dev/test path: schema is created
        # directly via Base.metadata.create_all() in app.main's lifespan,
        # not Alembic-managed — there is no "revision" concept to check.
        return {
            "ready": True,
            "schema_managed_by": "create_all",
            "detail": "SQLite dev/test fallback — no Alembic migration step applies.",
        }

    expected = _expected_head()
    if expected is None:
        return {
            "ready": False,
            "schema_managed_by": "alembic",
            "detail": "Could not resolve the expected migration head from the repository's migration scripts.",
        }

    try:
        with db_engine.connect() as conn:
            applied = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:
        logger.warning("schema readiness: alembic_version table unreadable — migrations have not run")
        return {
            "ready": False,
            "schema_managed_by": "alembic",
            "expected_revision": expected,
            "applied_revision": None,
            "detail": "alembic_version table is missing or unreadable — migrations have not run yet.",
        }

    ready = applied == expected
    return {
        "ready": ready,
        "schema_managed_by": "alembic",
        "expected_revision": expected,
        "applied_revision": applied,
        "detail": "Schema is at the expected revision." if ready else "Database schema is behind the code's expected migration head.",
    }
