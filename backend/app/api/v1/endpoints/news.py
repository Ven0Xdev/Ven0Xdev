"""News API — persisted, deduplicated, classified news from
services/news/ingest.py's Alpaca-backed pipeline. Reads only; the only
writer of news_items is the ingestion pipeline itself (REST backfill /
WS stream), never a request handler.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import db_session, require_operator
from app.core.config import get_settings
from app.db.models.news import NewsItem
from app.db.models.user import User

router = APIRouter(prefix="/news", tags=["news"])

_DEFAULT_WINDOW_DAYS = 30
_BREAKING_WINDOW_HOURS = 24
_BREAKING_IMPACT_FLOOR = 0.4


def _payload(item: NewsItem) -> dict:
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


def _symbol_scoped_query(db: Session, window_days: int):
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    return db.query(NewsItem).filter(NewsItem.published_at >= cutoff).order_by(NewsItem.published_at.desc())


@router.get("/health")
def news_health():
    """Honest unavailable state instead of fabricated news: reports
    whether the Alpaca news WS is actually connected right now, not just
    whether it was configured to be."""
    from app.services.news.service import get_news_ingestion_service

    settings = get_settings()
    service = get_news_ingestion_service()
    if service is None:
        return {
            "enabled": settings.alpaca_news_stream_enabled,
            "configured": bool(settings.alpaca_api_key and settings.alpaca_api_secret),
            "connected": False,
            "note": "News ingestion service is not running — check ALPACA_NEWS_STREAM_ENABLED and ALPACA_API_KEY/SECRET.",
        }
    return {"enabled": True, "configured": True, **service.health()}


@router.get("/{symbol}")
def news_for_symbol(
    symbol: str,
    limit: int = 20,
    window_days: int = _DEFAULT_WINDOW_DAYS,
    db: Session = Depends(db_session),
):
    symbol = symbol.upper()
    # symbols is a JSON column — containment filtering happens in Python
    # rather than a dialect-specific JSON operator, so this stays portable
    # across SQLite (tests/dev) and Postgres (prod). Bounded by the
    # time-windowed query above, not a full-table scan.
    candidates = _symbol_scoped_query(db, window_days).limit(1000).all()
    matches = [item for item in candidates if symbol in (item.symbols or [])][:limit]
    return {"symbol": symbol, "count": len(matches), "articles": [_payload(a) for a in matches]}


@router.get("")
def breaking_news(
    limit: int = 20,
    window_hours: int = _BREAKING_WINDOW_HOURS,
    min_impact: float = _BREAKING_IMPACT_FLOOR,
    db: Session = Depends(db_session),
):
    """Recent, high-impact stories across the whole canonical universe —
    the "Breaking news" panel's data source. Never fabricated: an empty
    result honestly means no story has cleared the impact floor in the
    window, not "no news exists"."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    rows = (
        db.query(NewsItem)
        .filter(NewsItem.published_at >= cutoff, NewsItem.impact >= min_impact)
        .order_by(NewsItem.impact.desc(), NewsItem.published_at.desc())
        .limit(limit)
        .all()
    )
    return {"count": len(rows), "articles": [_payload(a) for a in rows]}


@router.post("/backfill")
def trigger_backfill(
    symbols: str | None = None,
    limit: int = 50,
    db: Session = Depends(db_session),
    _operator: User = Depends(require_operator),
):
    """Operator-triggered REST backfill — real Alpaca history, never
    synthetic. `symbols` is a comma-separated list; omitted = the full
    canonical universe."""
    from app.services.news.ingest import backfill
    from app.services.universe.manager import get_active_universe

    settings = get_settings()
    if not settings.alpaca_api_key or not settings.alpaca_api_secret:
        raise HTTPException(status_code=503, detail="ALPACA_API_KEY / ALPACA_API_SECRET are not configured.")

    symbol_list = [s.strip().upper() for s in symbols.split(",")] if symbols else [
        a.symbol for a in get_active_universe(db)
    ]
    rows = backfill(db, settings.alpaca_api_key, settings.alpaca_api_secret, symbol_list, limit=limit)
    return {"symbols": symbol_list, "persisted": len(rows)}
