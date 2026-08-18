"""Process-wide singleton accessor for NewsIngestionService — mirrors
services/streaming/service.py's get_stream_service() pattern. Set once by
app.main's lifespan (when ALPACA_NEWS_STREAM_ENABLED and credentials are
present), read by app/api/v1/endpoints/news.py's /news/health.
"""
from __future__ import annotations

from app.services.news.ingest import NewsIngestionService

_service: NewsIngestionService | None = None


def get_news_ingestion_service() -> NewsIngestionService | None:
    """None when news ingestion was never started (disabled, or no
    credentials) — callers must treat that as an honest "unavailable"
    state, never silently pretend it's running."""
    return _service


def set_news_ingestion_service(service: NewsIngestionService) -> None:
    global _service
    _service = service
