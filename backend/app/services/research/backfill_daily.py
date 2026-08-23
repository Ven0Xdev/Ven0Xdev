"""Phase 1 — durable, resumable daily OHLCV backfill via Twelve Data.

Fetches split-adjusted daily bars for the canonical Nexora universe from
2020-01-01 through the last fully completed trading day, persists to
`HistoricalBar`, and checkpoints per-symbol progress in
`BackfillCheckpoint` so a partial run (rate limit, network blip, restart)
resumes cleanly rather than re-fetching a symbol that already finished.
Cheap: ~20 API calls total (one per symbol, Twelve Data's `outputsize`
comfortably covers this whole date range in one call), well within the
free-tier 8/min limit.

The current, still-in-progress trading day is never fetched by this
module at all — `_last_completed_session()` is always yesterday-or-
earlier, so there is no code path here that could accidentally pull
today's incomplete session into a training set.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.models.backfill_checkpoint import BackfillCheckpoint
from app.db.models.historical_bar import HistoricalBar
from app.services.data_providers.twelvedata_provider import TwelveDataProvider

logger = logging.getLogger(__name__)

START_DATE = "2020-01-01"
DATASET = "daily_bars"
PROVIDER = "twelvedata"


def last_completed_session(now: datetime | None = None) -> date:
    """The previous fully completed trading day — never today. A
    conservative weekday-only approximation (doesn't know market
    holidays, which only makes this *more* conservative: a holiday
    weekday simply yields zero rows for that date, never a fabricated
    one). Exported for reuse by the labeling/feature modules, which must
    apply the exact same "exclude the current incomplete day" rule.
    """
    now = now or datetime.now(timezone.utc)
    d = (now - timedelta(days=1)).date()
    while d.weekday() >= 5:  # Saturday=5, Sunday=6
        d -= timedelta(days=1)
    return d


def _get_or_create_checkpoint(db: Session, ticker_symbol: str) -> BackfillCheckpoint:
    checkpoint = (
        db.query(BackfillCheckpoint)
        .filter_by(provider=PROVIDER, dataset=DATASET, ticker_symbol=ticker_symbol)
        .one_or_none()
    )
    if checkpoint is None:
        checkpoint = BackfillCheckpoint(provider=PROVIDER, dataset=DATASET, ticker_symbol=ticker_symbol, status="pending")
        db.add(checkpoint)
        db.commit()
        db.refresh(checkpoint)
    return checkpoint


def run_daily_backfill(db: Session, provider: TwelveDataProvider, symbols: list[str]) -> dict:
    """Idempotent: symbols whose checkpoint already reads "done" are
    skipped entirely (report says so, no network call). A symbol being
    retried after a prior failure/crash gets its `HistoricalBar` rows for
    that (symbol, "1d") pair cleared first, then reinserted fresh — the
    simplest correct dedup at this dataset's granularity (this backfill
    is atomic per symbol, not per row; the low-priority splits/news
    worker is the one that genuinely needs a finer-grained cursor, since
    it spans real days by design).
    """
    end_date = last_completed_session().isoformat()
    report: dict[str, dict] = {}

    for symbol in symbols:
        checkpoint = _get_or_create_checkpoint(db, symbol)
        if checkpoint.status == "done":
            report[symbol] = {"status": "already_done", "rows": checkpoint.rows_ingested}
            continue

        checkpoint.status = "in_progress"
        db.commit()
        try:
            df = provider.get_historical_daily_range(symbol, START_DATE, end_date)
        except Exception as exc:
            checkpoint.status = "failed"
            checkpoint.last_error = str(exc)
            db.commit()
            report[symbol] = {"status": "failed", "error": str(exc)}
            logger.warning("Daily backfill failed for %s: %s", symbol, exc)
            continue

        db.query(HistoricalBar).filter_by(ticker_symbol=symbol, timeframe="1d").delete()
        for ts, row in df.iterrows():
            db.add(HistoricalBar(
                ticker_symbol=symbol, timeframe="1d", ts=ts.to_pydatetime(),
                open=float(row["open"]), high=float(row["high"]), low=float(row["low"]),
                close=float(row["close"]), volume=float(row["volume"]),
                adjusted=True, session="regular", data_source="twelvedata", feed="unspecified",
            ))

        checkpoint.status = "done"
        checkpoint.rows_ingested = len(df)
        checkpoint.cursor = end_date
        checkpoint.last_error = None
        db.commit()
        report[symbol] = {"status": "done", "rows_inserted": len(df), "start": START_DATE, "end": end_date}
        logger.info("Daily backfill %s: %d bars [%s, %s]", symbol, len(df), START_DATE, end_date)

    return report


if __name__ == "__main__":
    from app.core.config import get_settings
    from app.db.session import SessionLocal
    from app.services.universe.manager import get_active_universe

    settings = get_settings()
    provider = TwelveDataProvider(settings.twelve_data_api_key)
    db = SessionLocal()
    symbols = [a.symbol for a in get_active_universe(db)]
    result = run_daily_backfill(db, provider, symbols)
    for symbol, outcome in result.items():
        print(symbol, outcome)
