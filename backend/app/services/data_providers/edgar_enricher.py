"""EDGAR ingestion + fundamentals enrichment.

Two halves, honoring architecture decision D7 ("EDGAR is an ingester, not a
request-path adapter"):

1. `refresh_edgar_facts(...)` — the scheduled half. Called from the scan
   worker each cycle; pulls facts from sec.gov (rate-limited) for universe
   tickers whose local row is missing or stale, and persists them to the
   `edgar_company_facts` table. This is the ONLY code path that talks to
   sec.gov.

2. `EdgarEnrichedProvider` — the request-path half. A decorator over any
   `MarketDataProvider` that overlays locally-stored EDGAR facts onto
   `get_fundamentals()`: real dilution %, real filing recency/delinquency.
   Reads Postgres only — a cold table simply means no overlay yet.

Overlay semantics (honesty rules):
- EDGAR value present → it wins over the vendor's value (EDGAR is the
  primary source; vendors derive from it).
- EDGAR value absent (None) → the vendor's value stands untouched. The
  overlay never converts "unknown" into a fake zero.
- Ticker not SEC-registered (no CIK) → stored as a row with null facts so
  we don't re-query sec.gov every cycle for shells that will never match.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models.edgar import EdgarCompanyFacts
from app.services.data_providers.base import (
    CorporateAction,
    Fundamentals,
    MarketDataProvider,
    NewsArticle,
    Quote,
    TickerMeta,
)
from app.services.data_providers.edgar_client import EdgarClient

logger = logging.getLogger(__name__)

REFRESH_AFTER = timedelta(hours=24)


def refresh_edgar_facts(
    db: Session,
    tickers: list[str],
    client: EdgarClient | None = None,
    max_fetches: int = 50,
) -> int:
    """Ingest/refresh EDGAR facts for the given tickers. Only rows missing
    or older than REFRESH_AFTER are fetched, capped at `max_fetches` per
    call so a big universe amortizes across cycles instead of hammering
    sec.gov. Returns number of rows written.
    """
    client = client or EdgarClient(user_agent=get_settings().sec_edgar_user_agent)
    now = datetime.now(timezone.utc)

    existing = {
        row.ticker_symbol: row
        for row in db.query(EdgarCompanyFacts).filter(
            EdgarCompanyFacts.ticker_symbol.in_([t.upper() for t in tickers])
        )
    }

    written = 0
    for ticker in tickers:
        if written >= max_fetches:
            break
        ticker = ticker.upper()
        row = existing.get(ticker)
        if row is not None and row.fetched_at is not None:
            fetched_at = row.fetched_at if row.fetched_at.tzinfo else row.fetched_at.replace(tzinfo=timezone.utc)
            if now - fetched_at < REFRESH_AFTER:
                continue

        try:
            facts = client.fetch_facts(ticker)
        except Exception:
            logger.exception("EDGAR fetch failed for %s", ticker)
            continue

        if row is None:
            row = EdgarCompanyFacts(ticker_symbol=ticker, cik="")
            db.add(row)

        if facts is None:
            row.cik = ""  # not SEC-registered; remembered so we don't retry every cycle
            row.shares_outstanding_latest = None
            row.shares_outstanding_year_ago = None
            row.dilution_12m_pct = None
            row.last_filing_date = None
            row.last_periodic_form = None
            row.filing_delinquent = None
        else:
            row.cik = facts.cik
            row.shares_outstanding_latest = facts.shares_outstanding_latest
            row.shares_outstanding_year_ago = facts.shares_outstanding_year_ago
            row.dilution_12m_pct = facts.dilution_12m_pct
            row.last_filing_date = facts.last_filing_date.replace(tzinfo=None) if facts.last_filing_date else None
            row.last_periodic_form = facts.last_periodic_form
            row.filing_delinquent = facts.filing_delinquent
        row.fetched_at = now.replace(tzinfo=None)
        written += 1

    db.commit()
    return written


class EdgarEnrichedProvider(MarketDataProvider):
    """Decorator: any provider + locally ingested EDGAR facts."""

    def __init__(self, inner: MarketDataProvider, session_factory):
        self.inner = inner
        self._session_factory = session_factory

    # `name`/`data_mode` are properties, not attributes snapshotted at
    # construction: composites like FallbackMarketDataProvider/
    # MixedSourceProvider mutate their own .name/.data_mode after every
    # call specifically so callers see honest per-call provenance (which
    # vendor actually answered, live vs cached vs delayed) — a one-time
    # snapshot at __init__ (when get_data_provider()'s @lru_cache first
    # builds this wrapper, before any real call has happened) would freeze
    # every analysis at whatever the inner provider's initial default was
    # ("unspecified") forever, silently hiding the real provenance behind
    # this decorator.
    # Ignored below (override): MarketDataProvider declares these as
    # writeable for composites that mutate their own name/data_mode (see
    # comment above) — nothing ever writes through an EdgarEnrichedProvider
    # composition (grep confirms every assignment site targets a
    # composite's own attribute, never a wrapped inner/primary/fallback
    # provider), so read-only here is safe in practice, not just in theory.
    @property
    def name(self) -> str:  # type: ignore[override]
        return f"{self.inner.name}+edgar"

    @property
    def data_mode(self) -> str:  # type: ignore[override]
        return getattr(self.inner, "data_mode", "unspecified")

    # --- enriched call -----------------------------------------------------
    def get_fundamentals(self, symbol: str) -> Fundamentals:
        fund = self.inner.get_fundamentals(symbol)
        db = self._session_factory()
        try:
            row = (
                db.query(EdgarCompanyFacts)
                .filter_by(ticker_symbol=symbol.upper())
                .one_or_none()
            )
        finally:
            db.close()

        if row is None:
            return fund

        if row.dilution_12m_pct is not None:
            fund.dilution_12m_pct = row.dilution_12m_pct
        if row.shares_outstanding_latest is not None:
            fund.shares_outstanding = row.shares_outstanding_latest
        if row.last_filing_date is not None:
            fund.last_filing_date = row.last_filing_date
        if row.filing_delinquent is not None:
            fund.filing_delinquent = row.filing_delinquent
        return fund

    # --- pure delegation ------------------------------------------------------
    def get_universe(self, limit: int | None = None) -> list[TickerMeta]:
        return self.inner.get_universe(limit)

    def get_ticker_meta(self, symbol: str) -> TickerMeta:
        return self.inner.get_ticker_meta(symbol)

    def get_ohlcv(self, symbol: str, timeframe: str = "1d", lookback_days: int = 250):
        return self.inner.get_ohlcv(symbol, timeframe, lookback_days)

    def get_intraday_bars(self, symbol: str, lookback_minutes: int = 390):
        return self.inner.get_intraday_bars(symbol, lookback_minutes)

    def get_quote(self, symbol: str) -> Quote:
        return self.inner.get_quote(symbol)

    def get_news(self, symbol: str, limit: int = 20) -> list[NewsArticle]:
        return self.inner.get_news(symbol, limit)

    def get_corporate_actions(self, symbol: str) -> list[CorporateAction]:
        return self.inner.get_corporate_actions(symbol)
