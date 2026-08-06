import os

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("USE_SQLITE_FALLBACK", "true")
os.environ.setdefault("SQLITE_PATH", "sqlite:///./test_ven0x.db")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db import models  # noqa: F401


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
