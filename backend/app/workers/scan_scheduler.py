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

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.session import SessionLocal, engine, init_timescale_hypertables
from app.db import models  # noqa: F401
from app.db.models.prediction import Prediction
from app.services.data_providers.factory import get_data_provider
from app.services.scoring.scorer import analyze_ticker

logger = logging.getLogger(__name__)


def run_scan_cycle(log_predictions: bool = True) -> int:
    provider = get_data_provider()
    tickers = provider.get_universe()
    analyzed = 0

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(analyze_ticker, t.symbol, provider): t.symbol for t in tickers}
        results = {}
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                results[symbol] = future.result()
                analyzed += 1
            except Exception:
                logger.exception("Failed to analyze %s", symbol)

    if log_predictions and results:
        db = SessionLocal()
        try:
            for analysis in results.values():
                primary = next(
                    (p for p in analysis.probability_matrix if p.horizon_days == analysis.estimated_holding_period_days),
                    analysis.probability_matrix[0],
                )
                db.add(
                    Prediction(
                        ticker_symbol=analysis.ticker,
                        current_price=analysis.current_price,
                        liquidity_score=analysis.liquidity_score,
                        manipulation_risk=analysis.manipulation_risk,
                        fundamental_score=analysis.fundamental_score,
                        technical_score=analysis.technical_score,
                        sentiment_score=analysis.sentiment_score,
                        catalyst_score=analysis.catalyst_score,
                        overall_ai_score=analysis.overall_ai_score,
                        confidence_score=analysis.confidence_score,
                        prob_up_5=primary.prob_up_5,
                        prob_up_10=primary.prob_up_10,
                        prob_up_20=primary.prob_up_20,
                        prob_downside_before_upside=analysis.probability_downside_before_upside,
                        entry_zone_low=analysis.suggested_entry_zone_low,
                        entry_zone_high=analysis.suggested_entry_zone_high,
                        ideal_entry_price=analysis.ideal_entry_price,
                        stop_loss=analysis.stop_loss,
                        take_profit_1=analysis.take_profit_1,
                        take_profit_2=analysis.take_profit_2,
                        take_profit_3=analysis.take_profit_3,
                        max_allocation_pct=analysis.max_allocation_pct,
                        risk_reward=analysis.expected_risk_reward,
                        holding_period_days=analysis.estimated_holding_period_days,
                        explanation=analysis.explanation,
                        horizon_probabilities={str(p.horizon_days): p.model_dump() for p in analysis.probability_matrix},
                        feature_snapshot={},
                        shap_top_factors={"factors": [f.model_dump() for f in analysis.top_factors]},
                    )
                )
            db.commit()
        finally:
            db.close()

    return analyzed


def main() -> None:
    configure_logging("INFO")
    settings = get_settings()
    Base.metadata.create_all(bind=engine)
    init_timescale_hypertables()

    logger.info("Starting continuous OTC scan loop, interval=%ss", settings.scan_interval_seconds)
    while True:
        started = time.monotonic()
        try:
            count = run_scan_cycle()
            logger.info("Scan cycle complete: %d tickers analyzed in %.1fs", count, time.monotonic() - started)
        except Exception:
            logger.exception("Scan cycle failed")
        elapsed = time.monotonic() - started
        time.sleep(max(1.0, settings.scan_interval_seconds - elapsed))


if __name__ == "__main__":
    main()
