"""Continuous background prediction logger + outcome evaluator for the
**mainstream** multi-asset universe (stocks/ETFs/indices/commodities) — the
real-universe counterpart to `workers/scan_scheduler.py`, which only covers
the disabled-by-default OTC module.

Without this worker, `Prediction` rows are never written for the platform's
actual 20-asset universe outside a manual `POST /predictions/log/{symbol}`
call, which means the calibration report and Champion/Challenger promotion
gate (Phase 8) would have nothing to measure against in a real deployment.
Runs on a fixed interval (deliberately hours, not seconds — a prediction
logged every few seconds against the same slow-moving fundamentals is noise,
not more signal), snapshotting every active asset's current `StockAnalysis`
into the immutable prediction ledger, then grading whatever predictions have
matured since the last cycle.

Run via: `python -m app.workers.prediction_scheduler`. Runs by default (not
gated behind a feature flag) — logging the platform's own real predictions
and proving out their track record is core to the mainstream product, not
optional module behavior.
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.db import models  # noqa: F401
from app.services.data_providers.factory import get_data_provider
from app.services.evaluation.outcome_evaluator import evaluate_due_predictions
from app.services.scoring.prediction_log import build_prediction_row
from app.services.scoring.scorer import analyze_ticker
from app.services.universe.manager import get_active_universe, seed_default_universe

logger = logging.getLogger(__name__)


def run_prediction_cycle(provider=None, db=None) -> int:
    """One pass: snapshot every active asset, then grade matured predictions.
    Returns the number of predictions successfully logged. Accepts an
    optional provider/db (mirroring `workers/scan_scheduler.py::run_scan_cycle`'s
    own testability pattern) so tests can inject a scripted provider and the
    test-isolated `db_session` fixture instead of the real app singletons.
    """
    provider = provider or get_data_provider()
    owns_session = db is None
    db = db or SessionLocal()
    logged = 0
    try:
        assets = get_active_universe(db)
        results = {}
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(analyze_ticker, a.symbol, provider): a.symbol for a in assets}
            for future in as_completed(futures):
                symbol = futures[future]
                try:
                    results[symbol] = future.result()
                except Exception:  # noqa: BLE001
                    logger.info("prediction_scheduler: could not analyze %s this cycle", symbol, exc_info=True)

        for symbol, analysis in results.items():
            db.add(build_prediction_row(analysis))
            logged += 1
        db.commit()

        summary = evaluate_due_predictions(db, provider)
        if summary.evaluated:
            logger.info(
                "prediction_scheduler: %d outcomes graded, %d immature, %d missing data",
                summary.evaluated, summary.skipped_immature, summary.skipped_no_data,
            )
    finally:
        if owns_session:
            db.close()

    return logged


def main() -> None:
    configure_logging("INFO")
    settings = get_settings()

    if settings.sqlalchemy_url.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)
    with SessionLocal() as seed_db:
        seed_default_universe(seed_db)

    interval = settings.prediction_log_interval_seconds
    logger.info("Starting mainstream prediction logger + outcome evaluator, interval=%ss", interval)
    while True:
        started = time.monotonic()
        try:
            logged = run_prediction_cycle()
            logger.info("Prediction cycle complete: %d predictions logged in %.1fs", logged, time.monotonic() - started)
        except Exception:
            logger.exception("Prediction cycle failed")

        elapsed = time.monotonic() - started
        time.sleep(max(1.0, interval - elapsed))


if __name__ == "__main__":
    main()
