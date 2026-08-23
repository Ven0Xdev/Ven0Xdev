"""services/deployment/schema_status.py — distinguishes DB *schema*
readiness from plain process/DB-connectivity liveness (/health). The
Postgres branch is exercised here against a real throwaway SQLite engine
via schema_status.get_schema_status()'s url/db_engine override parameters
— no live Postgres instance is available in this environment, so this is
the honest way to test the branch's actual logic (missing table / stale
revision / matching revision) rather than skipping it entirely.
"""
from __future__ import annotations

from sqlalchemy import create_engine, text

from app.services.deployment.schema_status import _expected_head, get_schema_status


def test_expected_head_resolves_to_a_real_revision():
    """No DB involved — just resolves the migration chain's head from the
    repository's own alembic/versions/ files."""
    head = _expected_head()
    assert head is not None
    assert isinstance(head, str) and len(head) > 0


def test_sqlite_is_always_ready_via_create_all():
    status = get_schema_status(url="sqlite:///:memory:")
    assert status["ready"] is True
    assert status["schema_managed_by"] == "create_all"


def test_postgres_like_target_missing_alembic_version_table_is_not_ready():
    fake_engine = create_engine("sqlite:///:memory:")
    status = get_schema_status(url="postgresql+psycopg://fake/fake", db_engine=fake_engine)

    assert status["ready"] is False
    assert status["schema_managed_by"] == "alembic"
    assert status["applied_revision"] is None
    assert status["expected_revision"] == _expected_head()


def test_postgres_like_target_stale_revision_is_not_ready():
    fake_engine = create_engine("sqlite:///:memory:")
    with fake_engine.connect() as conn:
        conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
        conn.execute(text("INSERT INTO alembic_version VALUES ('not-the-real-head')"))
        conn.commit()

    status = get_schema_status(url="postgresql+psycopg://fake/fake", db_engine=fake_engine)

    assert status["ready"] is False
    assert status["applied_revision"] == "not-the-real-head"


def test_postgres_like_target_matching_revision_is_ready():
    fake_engine = create_engine("sqlite:///:memory:")
    expected = _expected_head()
    with fake_engine.connect() as conn:
        conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
        conn.execute(text("INSERT INTO alembic_version VALUES (:v)"), {"v": expected})
        conn.commit()

    status = get_schema_status(url="postgresql+psycopg://fake/fake", db_engine=fake_engine)

    assert status["ready"] is True
    assert status["applied_revision"] == expected


def test_readiness_endpoint_reports_ready_on_the_test_sqlite_db(client):
    response = client.get("/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True
    assert body["schema_managed_by"] == "create_all"
