"""Low-priority splits/historical-news backfill — one Alpha Vantage call
per wake-up, deliberately spaced hours apart so this never meaningfully
competes with the live NCS scheduler for the same starved 25/day quota.
See services/research/lowpri_backfill.py's module docstring for the full
rationale.
"""
from __future__ import annotations

import logging
import time

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.session import SessionLocal
from app.db.session import engine as db_engine
from app.services.data_providers.alphavantage_provider import AlphaVantageProvider
from app.services.research.lowpri_backfill import run_one_slice
from app.services.universe.manager import get_active_universe

logger = logging.getLogger(__name__)

# Real days-to-weeks completion, by design — see the module docstring
# this worker calls into. 4 calls/day leaves the overwhelming majority
# of the shared 25/day Alpha Vantage quota for live production traffic.
SLICE_INTERVAL_SECONDS = 6 * 60 * 60


def run_once() -> dict | None:
    settings = get_settings()
    provider = AlphaVantageProvider(settings.alpha_vantage_api_key)
    db = SessionLocal()
    try:
        symbols = [a.symbol for a in get_active_universe(db)]
        return run_one_slice(db, provider, symbols)
    finally:
        db.close()


def main() -> None:
    configure_logging("INFO")
    settings = get_settings()

    if settings.sqlalchemy_url.startswith("sqlite"):
        Base.metadata.create_all(bind=db_engine)

    logger.info("Starting low-priority splits/news backfill worker, interval=%ss", SLICE_INTERVAL_SECONDS)
    while True:
        started = time.monotonic()
        try:
            result = run_once()
            if result is None:
                logger.info("Low-priority backfill: nothing pending — every symbol's splits/news history is done.")
            else:
                logger.info("Low-priority backfill slice: %s", result)
        except Exception:
            logger.exception("Low-priority backfill slice failed")
        elapsed = time.monotonic() - started
        time.sleep(max(1.0, SLICE_INTERVAL_SECONDS - elapsed))


if __name__ == "__main__":
    main()
