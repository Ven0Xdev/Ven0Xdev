"""Phase 1 — point-in-time SEC EDGAR fundamentals backfill.

Persists every observation of `EdgarClient._POINT_IN_TIME_CONCEPTS` for
the canonical universe to `PointInTimeFundamental`, keyed by each
observation's own `filed` date. Keyless, self-rate-limited to 5 req/s —
~20-40 calls total for a 20-symbol universe (one CIK lookup shared across
all symbols, one companyfacts call per symbol), feasible in well under a
minute. ETF/commodity symbols with no CIK or no reported concepts are
recorded as zero rows and reported honestly, never treated as an error.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models.backfill_checkpoint import BackfillCheckpoint
from app.db.models.point_in_time_fundamental import PointInTimeFundamental
from app.services.data_providers.edgar_client import EdgarClient

logger = logging.getLogger(__name__)

DATASET = "fundamentals"
PROVIDER = "edgar"


def _get_or_create_checkpoint(db: Session, ticker_symbol: str) -> BackfillCheckpoint:
    checkpoint = (
        db.query(BackfillCheckpoint).filter_by(provider=PROVIDER, dataset=DATASET, ticker_symbol=ticker_symbol).one_or_none()
    )
    if checkpoint is None:
        checkpoint = BackfillCheckpoint(provider=PROVIDER, dataset=DATASET, ticker_symbol=ticker_symbol, status="pending")
        db.add(checkpoint)
        db.commit()
        db.refresh(checkpoint)
    return checkpoint


def run_fundamentals_backfill(db: Session, client: EdgarClient, symbols: list[str]) -> dict:
    report: dict[str, dict] = {}

    for symbol in symbols:
        checkpoint = _get_or_create_checkpoint(db, symbol)
        if checkpoint.status == "done":
            report[symbol] = {"status": "already_done", "rows": checkpoint.rows_ingested}
            continue

        checkpoint.status = "in_progress"
        db.commit()
        try:
            cik = client.get_cik(symbol)
            if cik is None:
                # Not SEC-registered under this ticker — real for ETFs/
                # commodities in this universe (SPY, GLD, ...), not a failure.
                checkpoint.status = "done"
                checkpoint.rows_ingested = 0
                checkpoint.last_error = None
                db.commit()
                report[symbol] = {"status": "done", "rows_inserted": 0, "note": "not SEC-registered (expected for ETFs/commodities)"}
                continue
            facts = client.get_point_in_time_facts(cik)
        except Exception as exc:
            checkpoint.status = "failed"
            checkpoint.last_error = str(exc)
            db.commit()
            report[symbol] = {"status": "failed", "error": str(exc)}
            logger.warning("Fundamentals backfill failed for %s: %s", symbol, exc)
            continue

        db.query(PointInTimeFundamental).filter_by(ticker_symbol=symbol).delete()

        # EDGAR's XBRL frames genuinely repeat the same (concept,
        # period_end, filed_date) fact — the same historical quarter
        # re-appears as a comparative column in a LATER filing that
        # happens to share that later filing's own `filed` date. That's
        # not new information (the value is identical), so it collapses
        # to one row rather than violating this table's identity
        # constraint. A dict keyed by the actual DB identity tuple is the
        # simplest correct dedup — last-seen wins, which in practice is
        # the same value EDGAR already reported for that identity.
        unique_facts: dict[tuple, dict] = {
            (fact["concept"], fact["period_end"], fact["filed"]): fact for fact in facts
        }
        inserted = 0
        for fact in unique_facts.values():
            db.add(PointInTimeFundamental(
                ticker_symbol=symbol,
                taxonomy=fact["taxonomy"],
                concept=fact["concept"],
                unit=fact["unit"],
                period_start=datetime.fromisoformat(fact["period_start"]).replace(tzinfo=timezone.utc) if fact.get("period_start") else None,
                period_end=datetime.fromisoformat(fact["period_end"]).replace(tzinfo=timezone.utc),
                filed_date=datetime.fromisoformat(fact["filed"]).replace(tzinfo=timezone.utc),
                form=fact.get("form"),
                value=fact["value"],
            ))
            inserted += 1

        checkpoint.status = "done"
        checkpoint.rows_ingested = inserted
        checkpoint.last_error = None
        db.commit()
        report[symbol] = {"status": "done", "rows_inserted": inserted}
        logger.info("Fundamentals backfill %s: %d point-in-time facts", symbol, inserted)

    return report


if __name__ == "__main__":
    from app.core.config import get_settings
    from app.db.session import SessionLocal
    from app.services.universe.manager import get_active_universe

    settings = get_settings()
    client = EdgarClient(settings.sec_edgar_user_agent)
    db = SessionLocal()
    symbols = [a.symbol for a in get_active_universe(db)]
    result = run_fundamentals_backfill(db, client, symbols)
    for symbol, outcome in result.items():
        print(symbol, outcome)
