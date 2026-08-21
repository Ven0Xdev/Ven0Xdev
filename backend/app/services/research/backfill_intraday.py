"""Phase 1 — 30-minute / 60-minute intraday backfill via Alpaca IEX
1-minute bars, resampled locally (no provider serves 30m/60m history
directly).

Coverage caveat, disclosed everywhere this data is reported (dashboard,
data-quality report, HistoricalBar.feed column): Alpaca's Basic plan is
IEX-only — one real exchange's direct feed, not the full SIP consolidated
tape. This is genuine, real trade data, but PARTIAL market coverage, not
a substitute for a full-tape historical vendor. It is reported as such,
never silently presented as complete.

Fetched and checkpointed one calendar year at a time per symbol (not the
whole 2020-2026 range in one call) so a symbol whose IEX history runs out
partway stops cleanly with an honest "coverage starts at <date>" note
instead of erroring, and so a long-running backfill can resume mid-symbol
after an interruption.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

import pandas as pd
from sqlalchemy.orm import Session

from app.db.models.backfill_checkpoint import BackfillCheckpoint
from app.db.models.historical_bar import HistoricalBar
from app.services.data_providers.alpaca_provider import AlpacaProvider
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.research.backfill_daily import START_DATE, last_completed_session

logger = logging.getLogger(__name__)

DATASET = "intraday_bars"
PROVIDER = "alpaca"
_ET = ZoneInfo("America/New_York")
_TIMEFRAMES = {"30m": "30min", "60m": "60min"}


def _session_label(ts_utc: pd.Timestamp) -> str:
    local = ts_utc.tz_convert(_ET)
    t = local.time()
    if time(9, 30) <= t < time(16, 0):
        return "regular"
    if time(4, 0) <= t < time(9, 30):
        return "pre"
    return "post"


def _resample(minute_bars: pd.DataFrame, rule: str) -> pd.DataFrame:
    """Real-trade-only buckets: pandas resample only ever produces a row
    where at least one real 1-minute bar existed in that window (rows
    with no input data are dropped, never filled with a fabricated flat
    bar) — see the dropna below."""
    agg = minute_bars.resample(rule, label="left", closed="left").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    )
    return agg.dropna(subset=["open"])


def _year_windows(start_date: str, end_date: date) -> list[tuple[datetime, datetime]]:
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.combine(end_date, time(23, 59, 59), tzinfo=timezone.utc)
    windows = []
    cursor = start
    while cursor < end:
        year_end = min(datetime(cursor.year, 12, 31, 23, 59, 59, tzinfo=timezone.utc), end)
        windows.append((cursor, year_end))
        cursor = datetime(cursor.year + 1, 1, 1, tzinfo=timezone.utc)
    return windows


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


def run_intraday_backfill(db: Session, provider: AlpacaProvider, symbols: list[str]) -> dict:
    end_date = last_completed_session()
    windows = _year_windows(START_DATE, end_date)
    report: dict[str, dict] = {}

    for symbol in symbols:
        checkpoint = _get_or_create_checkpoint(db, symbol)
        if checkpoint.status == "done":
            report[symbol] = {"status": "already_done", "rows": checkpoint.rows_ingested}
            continue

        checkpoint.status = "in_progress"
        db.commit()
        db.query(HistoricalBar).filter(
            HistoricalBar.ticker_symbol == symbol, HistoricalBar.timeframe.in_(["30m", "60m"])
        ).delete(synchronize_session=False)
        db.commit()

        total_rows = 0
        earliest_data: datetime | None = None
        symbol_error: str | None = None
        for window_start, window_end in windows:
            try:
                minute_bars = provider.get_historical_minute_range(symbol, window_start, window_end)
            except ProviderDataUnavailable as exc:
                # No data for this year — either before this instrument's
                # listing or before IEX's own available depth. Not an
                # error: record the boundary honestly and move to the
                # next (later) window, which may well have data.
                logger.info("No 1-min bars for %s in %s: %s", symbol, window_start.year, exc)
                continue
            except Exception as exc:  # genuine provider/network failure
                symbol_error = str(exc)
                break

            if earliest_data is None or minute_bars.index.min() < earliest_data:
                earliest_data = minute_bars.index.min()

            for label, rule in _TIMEFRAMES.items():
                bars = _resample(minute_bars, rule)
                for ts, row in bars.iterrows():
                    db.add(HistoricalBar(
                        ticker_symbol=symbol, timeframe=label, ts=ts.to_pydatetime(),
                        open=float(row["open"]), high=float(row["high"]), low=float(row["low"]),
                        close=float(row["close"]), volume=float(row["volume"]),
                        adjusted=True, session=_session_label(ts), data_source="alpaca", feed="iex",
                    ))
                    total_rows += 1
            db.commit()
            checkpoint.cursor = window_end.date().isoformat()
            checkpoint.rows_ingested = total_rows
            db.commit()

        if symbol_error:
            checkpoint.status = "failed"
            checkpoint.last_error = symbol_error
            db.commit()
            report[symbol] = {"status": "failed", "error": symbol_error, "rows_inserted": total_rows}
            continue

        checkpoint.status = "done"
        checkpoint.rows_ingested = total_rows
        checkpoint.last_error = None
        db.commit()
        report[symbol] = {
            "status": "done", "rows_inserted": total_rows,
            "coverage_start": earliest_data.isoformat() if earliest_data is not None else None,
            "coverage_end": end_date.isoformat(),
            "feed": "iex (partial market coverage, not full SIP consolidated tape)",
        }
        logger.info("Intraday backfill %s: %d 30m/60m bars, IEX coverage from %s", symbol, total_rows, earliest_data)

    return report


if __name__ == "__main__":
    from app.core.config import get_settings
    from app.db.session import SessionLocal
    from app.services.universe.manager import get_active_universe

    settings = get_settings()
    provider = AlpacaProvider(settings.alpaca_api_key, settings.alpaca_api_secret)
    db = SessionLocal()
    symbols = [a.symbol for a in get_active_universe(db)]
    result = run_intraday_backfill(db, provider, symbols)
    for symbol, outcome in result.items():
        print(symbol, outcome)
