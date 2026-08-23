"""News ingestion — persists Alpaca News (REST backfill or WS stream)
articles into `NewsItem`, deduplicated, sanitized, and classified.

The only writer of the news_items table (see db/models/news.py). Both the
REST backfill path and the WS stream path funnel through the same
`persist_article()`, so classification/sanitization/dedup logic never
drifts between the two.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.models.news import NewsItem
from app.services.chat.sanitize import sanitize_untrusted_text
from app.services.news.alpaca_news import (
    AlpacaNewsStreamManager,
    NewsArticleRaw,
    fetch_news_rest,
    get_alpaca_news_manager,
)
from app.services.news.classify import classify

logger = logging.getLogger(__name__)

# Headlines/summaries are short display text — same conservative field
# limit services/chat/sanitize.py's other untrusted-content call sites use.
_HEADLINE_MAX_LEN = 500
_SUMMARY_MAX_LEN = 2000

# How far back (per symbol) to look for near-duplicate headlines when
# scoring novelty — recent enough to catch same-day wire-service
# re-publishes, short enough to stay a cheap query.
_NOVELTY_LOOKBACK_HOURS = 48
_NOVELTY_RECENT_LIMIT = 20


def _recent_headlines_for(db: Session, symbol: str) -> list[str]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=_NOVELTY_LOOKBACK_HOURS)
    # Symbol-scoped filter done in Python (symbols is a JSON column — not
    # portably queryable across SQLite/Postgres without dialect-specific
    # JSON operators); 200 recent rows across the whole universe is cheap.
    matches = (
        db.query(NewsItem)
        .filter(NewsItem.published_at >= cutoff)
        .order_by(NewsItem.published_at.desc())
        .limit(200)
        .all()
    )
    return [r.headline for r in matches if symbol in (r.symbols or [])][:_NOVELTY_RECENT_LIMIT]


def persist_article(db: Session, article: NewsArticleRaw, provider: str = "alpaca") -> NewsItem | None:
    """Upserts by (provider, external_id) — a re-published/updated article
    (Alpaca sends "updated_at" changes for corrections) increments
    `update_count` and refreshes the mutable fields, rather than creating
    a duplicate row. Returns None if the article maps to no canonical
    symbol Nexora tracks (nothing to persist against) — never invents a
    symbol mapping.
    """
    if not article.symbols:
        return None

    headline = sanitize_untrusted_text(article.headline, max_length=_HEADLINE_MAX_LEN, source="news_headline")
    summary = (
        sanitize_untrusted_text(article.summary, max_length=_SUMMARY_MAX_LEN, source="news_summary")
        if article.summary else None
    )

    existing = db.query(NewsItem).filter_by(provider=provider, external_id=article.external_id).one_or_none()
    # Classify relevance/impact per the FIRST (primary) symbol — a
    # multi-symbol story still gets one row (symbols carries the full
    # list); per-viewer relevance can be recomputed cheaply at read time
    # for a different symbol via classify.compute_relevance if ever needed.
    primary_symbol = article.symbols[0]
    recent = _recent_headlines_for(db, primary_symbol)
    result = classify(headline, summary, article.source, primary_symbol, article.symbols, recent)

    if existing is not None:
        existing.headline = headline
        existing.summary = summary
        existing.url = article.url
        existing.symbols = article.symbols
        existing.update_count += 1
        existing.sentiment = result.sentiment
        existing.sentiment_label = result.sentiment_label
        existing.category = result.category
        existing.reliability = result.reliability
        existing.novelty = result.novelty
        existing.relevance = result.relevance
        existing.impact = result.impact
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    row = NewsItem(
        provider=provider,
        external_id=article.external_id,
        source=article.source,
        headline=headline,
        summary=summary,
        url=article.url,
        symbols=article.symbols,
        published_at=article.published_at,
        update_count=1 if article.is_update else 0,
        sentiment=result.sentiment,
        sentiment_label=result.sentiment_label,
        category=result.category,
        reliability=result.reliability,
        novelty=result.novelty,
        relevance=result.relevance,
        impact=result.impact,
        is_press_release=article.source.lower() in ("businesswire", "prnewswire", "globenewswire"),
        is_promotional=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def backfill(
    db: Session, api_key: str, api_secret: str, symbols: list[str], limit: int = 50
) -> list[NewsItem]:
    """REST historical backfill for `symbols` — real Alpaca data, honest
    ProviderDataUnavailable propagated (never silently empty)."""
    articles = fetch_news_rest(api_key, api_secret, symbols, limit=limit)
    persisted = []
    for article in articles:
        row = persist_article(db, article)
        if row is not None:
            persisted.append(row)
    return persisted


class NewsIngestionService:
    """Wires the WS stream manager to persistence + the existing per-symbol
    SSE event bus, so a chart/news panel subscribed via GET /stream/{symbol}
    sees a `news.updated` event the moment a relevant article arrives —
    same bus services/streaming/service.py's MarketStreamService already
    publishes bar/signal events on, so the frontend needs only one SSE
    connection per symbol to get both.
    """

    def __init__(self, api_key: str, api_secret: str, session_factory):
        self.manager: AlpacaNewsStreamManager = get_alpaca_news_manager(api_key, api_secret)
        self._session_factory = session_factory

    async def _on_article(self, article: NewsArticleRaw) -> None:
        from app.services.streaming.service import get_stream_service

        db = self._session_factory()
        try:
            row = persist_article(db, article)
        finally:
            db.close()
        if row is None:
            return
        bus = get_stream_service().bus
        payload = _news_payload(row)
        for symbol in row.symbols:
            bus.publish(symbol, "news.updated", payload)

    async def start(self, symbols: list[str]) -> None:
        await self.manager.start(symbols, self._on_article)

    def health(self) -> dict:
        return self.manager.health()


def _news_payload(item: NewsItem) -> dict:
    return {
        "id": item.id, "provider": item.provider, "external_id": item.external_id,
        "source": item.source, "headline": item.headline, "summary": item.summary, "url": item.url,
        "symbols": item.symbols, "published_at": item.published_at.isoformat(),
        "received_at": item.received_at.isoformat(), "update_count": item.update_count,
        "sentiment": item.sentiment, "sentiment_label": item.sentiment_label,
        "novelty": item.novelty, "relevance": item.relevance, "reliability": item.reliability,
        "impact": item.impact, "category": item.category,
        "is_press_release": item.is_press_release, "is_promotional": item.is_promotional,
    }
