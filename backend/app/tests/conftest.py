import os

# Forced (not setdefault) — this container's real env has ENVIRONMENT=
# development exported directly (confirmed live, same leak path as every
# other variable below). main.py's lifespan handler treats
# environment == "test" as an explicit hard stop before opening a live
# Alpaca news WebSocket connection; with the leaked "development" value
# every client-fixture test in this container has been opening a REAL
# live WebSocket, not skipping it as intended.
os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault("SQLITE_PATH", "sqlite:///./test_ven0x.db")
# Settings.sqlalchemy_url returns the real DATABASE_URL whenever
# USE_SQLITE_FALLBACK is falsy OR DATABASE_URL is explicitly set —
# correct for this container's normal (live-Postgres) operation, but this
# container's real backend/.env now legitimately sets BOTH
# USE_SQLITE_FALLBACK=false and a real, reachable DATABASE_URL for the
# live research/production stack, and docker compose loads that straight
# into the process environment (confirmed live), not just into
# pydantic-settings' own .env parsing. A plain setdefault() is a no-op
# against an already-exported value, which is exactly how this went
# undetected: app.main.py's lifespan handler builds its own module-level
# SessionLocal()/engine from settings.sqlalchemy_url at import time, a
# completely separate code path from the client/db_session fixtures'
# dependency-injected test_engine below — so every test using the
# `client` fixture in this container has been seeding/querying the REAL
# production timescaledb on startup, not a throwaway database. Both
# variables must be force-overridden (not setdefault), matching
# MARKET_DATA_PROVIDER's fix below, so sqlalchemy_url genuinely resolves
# to the harmless SQLITE_PATH file above in every test session.
os.environ["USE_SQLITE_FALLBACK"] = "true"
os.environ.pop("DATABASE_URL", None)
# The test suite must never depend on whatever's in the developer's real
# backend/.env — that file now legitimately holds live TWELVE_DATA_API_KEY/
# ALPHA_VANTAGE_API_KEY credentials and MARKET_DATA_PROVIDER=twelvedata for
# local live-data testing. Without this override, any test relying on the
# implicit get_data_provider() singleton (FastAPI's `client` fixture, the
# chat assistant, etc.) would silently make real vendor HTTP calls during
# `pytest` — burning quota, flaky on network, and a real safety gap (MOCK
# must never accidentally become LIVE just because `pytest` ran on a
# machine with keys configured). setdefault() alone is NOT enough here —
# confirmed live: this container's env genuinely has MARKET_DATA_PROVIDER
# exported (docker compose loads backend/.env straight into the process
# environment, not just into pydantic-settings' own .env parsing), so
# setdefault silently no-ops and 23 tests failed against live vendors
# before this was force-overridden instead.
os.environ["MARKET_DATA_PROVIDER"] = "mock"
# Same reasoning as MARKET_DATA_PROVIDER above, for a different real leak
# path: this container's real ./model_artifacts directory can legitimately
# hold a live-trained ensemble_latest.pkl (the production Shadow/champion
# pipeline saves there once enough closed outcomes accumulate — a real,
# desired production event, not a bug). Tests like test_scorer.py's
# "honestly heuristic with no trained artifact" assume a pristine
# filesystem; without this override they'd load that real artifact and
# fail — not because of a code regression, but because they're sharing a
# volume with live production state they were never meant to see. Points
# at a directory that is never created (nothing in the test suite calls
# training_pipeline.save_model()), so load_latest_model() always sees
# nothing here, matching what a genuinely fresh/isolated test run — CI's —
# would see.
# Forced (not setdefault) — this container's real env also has
# MODEL_ARTIFACT_DIR=./model_artifacts exported directly (confirmed live,
# same leak path as the two variables above), so setdefault alone was
# silently a no-op here too.
os.environ["MODEL_ARTIFACT_DIR"] = "./test_model_artifacts_isolated"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import models  # noqa: F401
from app.db.base import Base


@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # pysqlite quirk (documented in SQLAlchemy's own docs): by default it
    # runs its own implicit BEGIN/COMMIT handling underneath SQLAlchemy's,
    # which silently defeats connection.begin()/transaction.rollback() —
    # an inner Session.commit() from ordinary app code (e.g.
    # seed_default_universe) ends up permanently committed instead of
    # rolled back at test teardown, leaking rows into every later test
    # that shares this in-memory DB via StaticPool. Disabling pysqlite's
    # own transaction handling and letting SQLAlchemy drive BEGIN
    # explicitly is the standard fix.
    @event.listens_for(engine, "connect")
    def _disable_pysqlite_implicit_transactions(dbapi_connection, _record):
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _explicit_begin(conn):
        conn.exec_driver_sql("BEGIN")

    Base.metadata.create_all(bind=engine)
    return engine


def _rollback_scoped_sessionmaker(connection):
    """`join_transaction_mode="create_savepoint"` (SQLAlchemy 2.0) makes a
    Session.commit() issued by ordinary application code (e.g.
    seed_default_universe, memory.get_or_create_session — anything that
    isn't test code) commit only a SAVEPOINT it opened, never the real
    outer transaction `connection.begin()` started. Without this, an
    inner commit ends the outer transaction early, the fixture's teardown
    rollback becomes a no-op ("transaction already deassociated from
    connection"), and whatever was committed leaks into every later test
    sharing this in-memory DB via StaticPool — a real, previously-latent
    test-isolation bug, not just a concern for the tests added here.
    """
    return sessionmaker(bind=connection, join_transaction_mode="create_savepoint")


@pytest.fixture
def db_session(test_engine):
    connection = test_engine.connect()
    transaction = connection.begin()
    session = _rollback_scoped_sessionmaker(connection)()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(test_engine):
    """Deliberately NOT wrapped in one held-open connection/transaction
    like db_session: with StaticPool sharing a single physical SQLite
    connection, a test combining `client` with a second session bound to
    test_engine (db_session, or a test's own ad-hoc
    sessionmaker(bind=test_engine), e.g. test_auth.py's
    test_revocation_via_token_version) would hit "cannot start a
    transaction within a transaction" the moment both try to hold an open
    transaction at once. Each request here gets its own naturally-scoped
    session/transaction instead — no test-teardown rollback for
    client-driven writes (matches this fixture's original, long-standing
    behavior), so tests using `client` to write data should use symbols/
    emails unique enough not to collide with other tests, same discipline
    the existing suite already follows.
    """
    from app.api.deps import db_session as db_session_dep
    from app.main import app

    Session = sessionmaker(bind=test_engine)

    def override_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[db_session_dep] = override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
