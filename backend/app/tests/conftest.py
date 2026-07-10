import os

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("USE_SQLITE_FALLBACK", "true")
os.environ.setdefault("SQLITE_PATH", "sqlite:///./test_ven0x.db")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
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
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture
def db_session(test_engine):
    connection = test_engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(test_engine):
    from app.api.deps import db_session as db_session_dep
    from app.main import app
    from sqlalchemy.orm import sessionmaker

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
