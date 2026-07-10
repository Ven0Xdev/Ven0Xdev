from collections.abc import Generator

from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.factory import get_data_provider


def db_session() -> Generator[Session, None, None]:
    yield from get_db()


def data_provider() -> MarketDataProvider:
    return get_data_provider()
