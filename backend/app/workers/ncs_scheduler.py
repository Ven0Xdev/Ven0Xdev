"""Continuous background NCS (Nexora Conviction Signal) evaluator for the
mainstream asset universe.

Without this worker, `services/signals/ncs.py`'s `evaluate_ncs()` is only
ever invoked by a human clicking "Evaluate now" (NcsPanel) or hitting
`POST /stream/{symbol}/evaluate-ncs` directly. That leaves three things
permanently dormant for any symbol nobody happened to click:
  - chart Buy/Sell markers (they're read-only history of persisted
    `NcsSignal` rows — see GET /stream/{symbol}/ncs-history)
  - the Shadow track record (services/shadow/engine.py's own docstring:
    "correct as long as NCS keeps getting evaluated on consecutive closed
    bars" — nothing guaranteed that until this worker existed)
  - autonomous paper trading's own trigger, `on_ncs_fired_autonomous`,
    which `evaluate_ncs()` calls internally right after persisting a
    *fired* row

This worker changes none of the safety contract those pieces already
enforce — it just calls the exact same `evaluate_ncs()` every on-demand
caller uses, on a fixed interval, for every symbol in the active universe.
Anti-repaint, confirmation, and cooldown are all still enforced inside
`evaluate_ncs()` itself; this file adds no signal logic of its own.

Red-Team review is run per symbol before every call, same as the manual
`POST /evaluate-ncs` endpoint — but with `portfolio_open_symbols=None`
rather than one specific user's open positions, since a background sweep
has no single account to scope that check to (each opted-in account's own
red-team check still runs independently inside
`autonomous.on_ncs_fired_autonomous` -> `_evaluate_entry_for_account`).
This still catches every *account-agnostic* gate — Safe Mode, model
drift, manipulation risk, confidence floor, provider health — so a
critical-drift veto here still marks the persisted row `vetoed=True`
before autonomous trading ever sees it.

Run via: `python -m app.workers.ncs_scheduler`. Runs by default (not
gated behind a feature flag), mirroring `workers/prediction_scheduler.py`
— NCS chart markers and the Shadow track record are mainstream product
behavior, not an optional module.
"""
from __future__ import annotations

import logging
import time

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db import models  # noqa: F401
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.services.data_providers.factory import get_data_provider
from app.services.universe.manager import get_active_universe, seed_default_universe

logger = logging.getLogger(__name__)


def _timeframes(settings) -> list[str]:
    return [t.strip() for t in settings.ncs_eval_timeframes.split(",") if t.strip()]


def run_ncs_cycle(provider=None, db=None, timeframes: list[str] | None = None) -> int:
    """One pass: evaluate NCS for every active-universe symbol on every
    configured timeframe. Returns the number of symbol/timeframe pairs
    that produced a *newly fired* row this cycle (not the number
    evaluated — most cycles are no-ops per symbol once that bar's row
    already exists, by `evaluate_ncs()`'s own anti-repaint check).

    Accepts an optional provider/db (mirroring
    `workers/prediction_scheduler.py::run_prediction_cycle`'s own
    testability pattern) so tests can inject a scripted provider and the
    test-isolated `db_session` fixture instead of the real app singletons.
    """
    from app.services.risk import red_team
    from app.services.scoring.scorer import analyze_ticker
    from app.services.signals.ncs import NcsInputs, NcsInsufficientData, evaluate_ncs
    from app.services.streaming.service import get_stream_service

    settings = get_settings()
    provider = provider or get_data_provider()
    owns_session = db is None
    db = db or SessionLocal()
    timeframes = timeframes if timeframes is not None else _timeframes(settings)
    fired = 0
    try:
        assets = get_active_universe(db)
        stream_service = get_stream_service()
        for asset in assets:
            for timeframe in timeframes:
                try:
                    analysis = analyze_ticker(asset.symbol, provider=provider)
                    health = stream_service.health(asset.symbol)
                    verdict = red_team.review(
                        asset.symbol, analysis, db,
                        portfolio_open_symbols=None,
                        provider_healthy=not health.get("stale", False),
                    )
                    row = evaluate_ncs(
                        asset.symbol, provider, db, timeframe=timeframe,
                        inputs=NcsInputs(red_team_veto=verdict),
                    )
                    if row.fired:
                        fired += 1
                        from app.api.v1.endpoints.stream import _ncs_payload

                        stream_service.bus.publish(asset.symbol.upper(), "ncs.updated", _ncs_payload(row))
                except NcsInsufficientData:
                    # Not enough closed-bar history for this symbol/timeframe
                    # yet — an honest, expected state for a freshly added
                    # asset, never an error to alarm on.
                    continue
                except Exception:
                    db.rollback()  # leave the session usable for the next symbol
                    logger.info("ncs_scheduler: could not evaluate %s/%s this cycle", asset.symbol, timeframe, exc_info=True)
    finally:
        if owns_session:
            db.close()

    return fired


def main() -> None:
    configure_logging("INFO")
    settings = get_settings()

    if settings.sqlalchemy_url.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)
    with SessionLocal() as seed_db:
        seed_default_universe(seed_db)

    interval = settings.ncs_eval_interval_seconds
    logger.info(
        "Starting NCS scheduler, interval=%ss, timeframes=%s", interval, _timeframes(settings),
    )
    while True:
        started = time.monotonic()
        try:
            fired = run_ncs_cycle()
            logger.info("NCS cycle complete: %d new fired signal(s) in %.1fs", fired, time.monotonic() - started)
        except Exception:
            logger.exception("NCS cycle failed")

        elapsed = time.monotonic() - started
        time.sleep(max(1.0, interval - elapsed))


if __name__ == "__main__":
    main()
