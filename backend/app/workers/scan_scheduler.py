"""Continuous background scanner.

Runs forever, re-analyzing the full OTC universe on a fixed interval so the
API always serves a warm, recently-computed `StockAnalysis` (see the TTL
cache in `services/scoring/scorer.py`) instead of computing the full
feature + ensemble + Monte-Carlo pipeline synchronously inside a request.
Also logs a `Prediction` snapshot per ticker per cycle, which is what the
prediction-history / model-performance dashboards and future outcome-based
recalibration are built on.

Run via: `python -m app.workers.scan_scheduler`
In docker-compose this runs as its own `scanner` service alongside `api`.
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.session import SessionLocal, engine, init_timescale_hypertables
from app.db import models  # noqa: F401
from app.db.models.scan import ScanCycle, ScanDecision
from app.services.data_providers.base import MarketDataProvider
from app.services.data_providers.factory import get_data_provider
from app.services.scoring.prediction_log import build_prediction_row
from app.services.scoring.quality_gates import evaluate_quality_gates
from app.services.scoring.scorer import analyze_ticker

logger = logging.getLogger(__name__)


def run_scan_cycle(
    provider: MarketDataProvider | None = None,
    db: Session | None = None,
    log_predictions: bool = True,
) -> int:
    """One full scanner pass: analyze -> quality-gate -> rank -> record.

    Every ticker's fate is written to scan_decisions with explicit reasons
    (accepted rationale / rejection causes / analysis failure). Predictions
    are logged only for accepted tickers — rejected securities are recorded
    as decisions, not as opportunities.
    """
    provider = provider or get_data_provider()
    owns_session = db is None
    db = db or SessionLocal()

    cycle = ScanCycle(provider_name=provider.name, started_at=datetime.utcnow())
    db.add(cycle)
    db.flush()

    tickers = provider.get_universe()
    cycle.universe_size = len(tickers)

    results: dict[str, object] = {}
    failures: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(analyze_ticker, t.symbol, provider): t.symbol for t in tickers}
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                results[symbol] = future.result()
            except Exception as exc:  # noqa: BLE001
                logger.exception("Failed to analyze %s", symbol)
                failures[symbol] = str(exc)[:300]

    accepted: list = []
    for symbol, analysis in results.items():
        gate = evaluate_quality_gates(analysis)
        if gate.accepted:
            accepted.append((analysis, gate))
        else:
            db.add(
                ScanDecision(
                    cycle_id=cycle.id,
                    ticker_symbol=symbol,
                    decision="rejected",
                    ai_score=analysis.overall_ai_score,
                    confidence=analysis.confidence_score,
                    manipulation_risk=analysis.manipulation_risk,
                    reasons=gate.reasons,
                )
            )

    accepted.sort(key=lambda pair: pair[0].overall_ai_score, reverse=True)
    for rank, (analysis, gate) in enumerate(accepted, start=1):
        db.add(
            ScanDecision(
                cycle_id=cycle.id,
                ticker_symbol=analysis.ticker,
                decision="accepted",
                rank=rank,
                ai_score=analysis.overall_ai_score,
                confidence=analysis.confidence_score,
                manipulation_risk=analysis.manipulation_risk,
                reasons=[f"Ranked #{rank} of {len(accepted)} accepted."] + gate.reasons,
            )
        )
        if log_predictions:
            db.add(build_prediction_row(analysis))

    for symbol, error in failures.items():
        db.add(
            ScanDecision(
                cycle_id=cycle.id,
                ticker_symbol=symbol,
                decision="failed",
                reasons=[f"Analysis failed: {error}"],
            )
        )

    cycle.accepted_count = len(accepted)
    cycle.rejected_count = len(results) - len(accepted)
    cycle.failed_count = len(failures)
    cycle.finished_at = datetime.utcnow()
    db.commit()

    if owns_session:
        db.close()
    return len(results)


def main() -> None:
    configure_logging("INFO")
    settings = get_settings()
    Base.metadata.create_all(bind=engine)
    init_timescale_hypertables()

    logger.info("Starting continuous OTC scan loop, interval=%ss", settings.scan_interval_seconds)
    while True:
        started = time.monotonic()

        # EDGAR ingestion runs BEFORE analysis so the cycle's fundamentals
        # already see fresh dilution/filing facts. Skipped for the mock
        # provider (synthetic tickers have no CIK).
        if settings.market_data_provider != "mock" and settings.edgar_enrichment_enabled:
            try:
                from app.services.data_providers.edgar_enricher import refresh_edgar_facts

                db = SessionLocal()
                try:
                    tickers = [t.symbol for t in get_data_provider().get_universe()]
                    written = refresh_edgar_facts(db, tickers)
                    if written:
                        logger.info("EDGAR ingestion: %d tickers refreshed", written)
                finally:
                    db.close()
            except Exception:
                logger.exception("EDGAR ingestion failed")

        try:
            count = run_scan_cycle()
            logger.info("Scan cycle complete: %d tickers analyzed in %.1fs", count, time.monotonic() - started)
        except Exception:
            logger.exception("Scan cycle failed")

        try:
            from app.services.evaluation.outcome_evaluator import evaluate_due_predictions

            db = SessionLocal()
            try:
                summary = evaluate_due_predictions(db, get_data_provider())
                if summary.evaluated:
                    logger.info(
                        "Outcome evaluation: %d graded, %d immature, %d missing data",
                        summary.evaluated, summary.skipped_immature, summary.skipped_no_data,
                    )
            finally:
                db.close()
        except Exception:
            logger.exception("Outcome evaluation failed")

        elapsed = time.monotonic() - started
        time.sleep(max(1.0, settings.scan_interval_seconds - elapsed))


if __name__ == "__main__":
    main()
