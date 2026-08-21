"""Phase 1 — low-priority, checkpointed splits + historical-news backfill.

Alpha Vantage is the ONLY source in this platform for corporate-action
(SPLITS) and historical news (NEWS_SENTIMENT) history, and it shares one
25-request/day quota, globally, with the live `ncs-scheduler` — which
already draws on that same budget every cycle for live fundamentals/news
(confirmed live: it routinely exhausts it and degrades gracefully). This
module exists specifically so the research backfill never competes
meaningfully with that live traffic: `run_one_slice()` makes AT MOST ONE
Alpha Vantage call per invocation, and the worker (app/workers/
lowpri_backfill_worker.py) calls it only a few times a day. A full
20-symbol backfill is expected to take real days, by design — see
CorporateAction/HistoricalNewsArticle's own docstrings.

Work items, one BackfillCheckpoint row each:
- (alphavantage, splits, <symbol>) — one call ever, since split history
  comes back complete in a single SPLITS response.
- (alphavantage, news_history, <symbol>) — walked forward in quarterly
  windows from 2020-01-01 to the last completed session, `cursor` holding
  the next window's start so a resumed run picks up exactly where the
  last one stopped.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.models.backfill_checkpoint import BackfillCheckpoint
from app.db.models.corporate_action import CorporateAction as CorporateActionRow
from app.db.models.historical_news import HistoricalNewsArticle
from app.services.data_providers.alphavantage_provider import AlphaVantageProvider
from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.research.backfill_daily import START_DATE, last_completed_session

logger = logging.getLogger(__name__)

PROVIDER = "alphavantage"
SPLITS_DATASET = "splits"
NEWS_DATASET = "news_history"
_NEWS_WINDOW_DAYS = 90  # one quarter per call — bounds each response size


def _ensure_checkpoints(db: Session, symbols: list[str]) -> None:
    """Idempotent: creates any missing work-queue rows, never duplicates
    or resets an existing one (a symbol already `done`/`in_progress`
    stays exactly as it is)."""
    existing = {
        (c.provider, c.dataset, c.ticker_symbol)
        for c in db.query(BackfillCheckpoint).filter_by(provider=PROVIDER).all()
    }
    for symbol in symbols:
        if (PROVIDER, SPLITS_DATASET, symbol) not in existing:
            db.add(BackfillCheckpoint(provider=PROVIDER, dataset=SPLITS_DATASET, ticker_symbol=symbol, status="pending"))
        if (PROVIDER, NEWS_DATASET, symbol) not in existing:
            db.add(BackfillCheckpoint(
                provider=PROVIDER, dataset=NEWS_DATASET, ticker_symbol=symbol, status="pending", cursor=START_DATE,
            ))
    db.commit()


def _next_pending(db: Session, dataset: str) -> BackfillCheckpoint | None:
    """Least-recently-attempted first, NOT alphabetical — every commit in
    _do_splits_slice/_do_news_slice (success or failure) touches
    `updated_at` via the model's own onupdate=utcnow, so a symbol that
    just failed (near-certainly the shared quota, exhausted most of the
    time) sinks to the back of the queue instead of being retried
    forever while every other symbol starves. This is what actually
    makes the backfill advance across all 20 symbols under persistent
    rate-limiting, rather than looping on whichever symbol sorts first.
    """
    return (
        db.query(BackfillCheckpoint)
        .filter(BackfillCheckpoint.provider == PROVIDER, BackfillCheckpoint.dataset == dataset)
        .filter(BackfillCheckpoint.status.in_(["pending", "in_progress"]))
        .order_by(BackfillCheckpoint.updated_at.asc())
        .first()
    )


def _do_splits_slice(db: Session, provider: AlphaVantageProvider, checkpoint: BackfillCheckpoint) -> dict:
    """On any provider error (near-certainly the shared 25/day quota,
    already exhausted by live production traffic most of the time — see
    module docstring) this deliberately reverts to "pending", never a
    terminal "failed" — a rate-limit error is retryable by definition (the
    quota resets daily) and this symbol must stay in `_next_pending`'s
    query so a later wake-up tries it again, rather than permanently
    abandoning it after one unlucky slice.
    """
    symbol = checkpoint.ticker_symbol
    try:
        actions = provider.get_corporate_actions(symbol)
    except ProviderDataUnavailable as exc:
        from app.core.logging import sanitize_secrets

        # Defense-in-depth: the provider layer already redacts vendor text
        # before raising, but a real live incident (a stale DB row from
        # before that fix shipped) showed the raw API key persisted here
        # and rendered straight into the Coverage tab — never trust a
        # caught exception's text to already be safe at the point it's
        # written to a column another endpoint serves back to users.
        message = sanitize_secrets(str(exc))
        checkpoint.status = "pending"
        checkpoint.last_error = message
        db.commit()
        return {"dataset": SPLITS_DATASET, "symbol": symbol, "status": "pending (will retry)", "error": message}

    db.query(CorporateActionRow).filter_by(ticker_symbol=symbol).delete()
    for action in actions:
        raw_factor = (action.details or {}).get("split_factor")
        try:
            # CorporateAction.ratio is a real Float column; the vendor
            # supplies this as a numeric-looking string, never assumed
            # already-numeric. An unparseable value is stored as None
            # (honest "unknown"), never a crash and never a guessed number.
            ratio = float(raw_factor) if raw_factor is not None else None
        except (TypeError, ValueError):
            ratio = None
        db.add(CorporateActionRow(
            ticker_symbol=symbol, action_type=action.action_type, ex_date=action.date,
            ratio=ratio, data_source="alphavantage",
        ))
    checkpoint.status = "done"
    checkpoint.rows_ingested = len(actions)
    checkpoint.last_error = None
    db.commit()
    return {"dataset": SPLITS_DATASET, "symbol": symbol, "status": "done", "rows": len(actions)}


def _do_news_slice(db: Session, provider: AlphaVantageProvider, checkpoint: BackfillCheckpoint, end_date: date) -> dict:
    symbol = checkpoint.ticker_symbol
    window_start = datetime.fromisoformat(checkpoint.cursor or START_DATE).replace(tzinfo=timezone.utc)
    window_end = min(window_start + timedelta(days=_NEWS_WINDOW_DAYS), datetime.combine(end_date, datetime.min.time(), tzinfo=timezone.utc))

    try:
        articles = provider.get_historical_news_range(symbol, window_start, window_end)
    except ProviderDataUnavailable as exc:
        from app.core.logging import sanitize_secrets

        # Same retryable-not-terminal reasoning as _do_splits_slice above
        # — the cursor is untouched, so the retry resumes this exact
        # window, never skipping or re-fetching an already-completed one.
        # Same defense-in-depth redaction as _do_splits_slice too — see
        # that except block's comment for the real live incident this
        # guards against.
        message = sanitize_secrets(str(exc))
        checkpoint.status = "pending"
        checkpoint.last_error = message
        db.commit()
        return {"dataset": NEWS_DATASET, "symbol": symbol, "status": "pending (will retry)", "error": message}

    inserted = 0
    for article in articles:
        exists = db.query(HistoricalNewsArticle.id).filter_by(ticker_symbol=symbol, url=article.url).one_or_none()
        if exists:
            continue
        db.add(HistoricalNewsArticle(
            ticker_symbol=symbol, headline=article.headline, url=article.url,
            published_at=article.published_at, sentiment_score=article.sentiment,
            source=article.source, data_source="alphavantage",
        ))
        inserted += 1

    checkpoint.rows_ingested = (checkpoint.rows_ingested or 0) + inserted
    if window_end.date() >= end_date:
        checkpoint.status = "done"
        checkpoint.cursor = end_date.isoformat()
    else:
        checkpoint.status = "in_progress"
        checkpoint.cursor = window_end.date().isoformat()
    checkpoint.last_error = None
    db.commit()
    return {
        "dataset": NEWS_DATASET, "symbol": symbol, "status": checkpoint.status,
        "window": [window_start.date().isoformat(), window_end.date().isoformat()], "rows_inserted": inserted,
    }


def run_one_slice(db: Session, provider: AlphaVantageProvider, symbols: list[str]) -> dict | None:
    """Exactly one Alpha Vantage call, at most. Prioritizes finishing all
    one-shot `splits` items first (cheapest to exhaust), then advances
    one `news_history` window. Returns None when every item for every
    symbol is already `done` — the backfill has genuinely finished."""
    _ensure_checkpoints(db, symbols)

    splits_item = _next_pending(db, SPLITS_DATASET)
    if splits_item is not None:
        splits_item.status = "in_progress"
        db.commit()
        return _do_splits_slice(db, provider, splits_item)

    news_item = _next_pending(db, NEWS_DATASET)
    if news_item is not None:
        news_item.status = "in_progress"
        db.commit()
        return _do_news_slice(db, provider, news_item, last_completed_session())

    return None


if __name__ == "__main__":
    from app.core.config import get_settings
    from app.db.session import SessionLocal
    from app.services.universe.manager import get_active_universe

    settings = get_settings()
    provider = AlphaVantageProvider(settings.alpha_vantage_api_key)
    db = SessionLocal()
    symbols = [a.symbol for a in get_active_universe(db)]
    print(run_one_slice(db, provider, symbols))
