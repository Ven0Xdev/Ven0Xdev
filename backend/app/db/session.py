from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

_connect_args = {"check_same_thread": False} if settings.sqlalchemy_url.startswith("sqlite") else {}

engine = create_engine(settings.sqlalchemy_url, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_timescale_hypertables() -> None:
    """Convert time-series tables into TimescaleDB hypertables.

    No-op on non-Postgres backends (e.g. the SQLite dev/test fallback).
    Safe to call repeatedly (idempotent via IF NOT EXISTS semantics of
    create_hypertable's `if_not_exists` flag).
    """
    if not settings.sqlalchemy_url.startswith("postgresql"):
        return

    from sqlalchemy import text

    hypertables = [
        ("ohlcv_bars", "ts"),
        ("predictions", "created_at"),
        ("news_items", "published_at"),
    ]
    with engine.begin() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
        except Exception:
            return
        for table, time_col in hypertables:
            conn.execute(
                text(
                    f"SELECT create_hypertable('{table}', '{time_col}', "
                    "if_not_exists => TRUE, migrate_data => TRUE)"
                )
            )
