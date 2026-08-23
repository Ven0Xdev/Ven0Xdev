"""API-level tests for /news/* — health honesty, symbol/breaking-news
reads, and operator-gated backfill. Uses the `client` fixture (dev mode:
AUTH_REQUIRED=false means the default dev user already has the operator
role, so no auth setup is needed for /news/backfill).

Seeding uses a short-lived session bound to `test_engine` directly (open,
commit, close) rather than the `db_session` fixture — `db_session` holds
one open transaction for the whole test, and combining that with `client`
(which uses its own per-request session against the same StaticPool
connection) hits "cannot start a transaction within a transaction", per
`client`'s own fixture docstring in conftest.py.
"""
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.db.models.news import NewsItem


def _make_item(test_engine, **overrides):
    now = datetime.now(timezone.utc)
    defaults = dict(
        provider="alpaca", external_id=f"api-{id(overrides)}-{overrides.get('external_id', '')}",
        source="Reuters", headline="AAPL beats earnings estimates", summary="Solid quarter.",
        url="https://example.com/a", symbols=["AAPL"],
        published_at=now - timedelta(hours=1), received_at=now, update_count=0,
        sentiment=0.5, sentiment_label="positive", novelty=1.0, relevance=1.0,
        reliability=0.9, impact=0.6, category="earnings",
        is_press_release=False, is_promotional=False,
    )
    defaults.update(overrides)
    Session = sessionmaker(bind=test_engine)
    db = Session()
    try:
        item = NewsItem(**defaults)
        db.add(item)
        db.commit()
        db.refresh(item)
        db.expunge(item)
        return item
    finally:
        db.close()


def test_news_health_reports_unavailable_when_service_never_started(client):
    from app.services.news import service as news_service_module

    original = news_service_module._service
    news_service_module._service = None
    try:
        resp = client.get("/api/v1/news/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["connected"] is False
    finally:
        news_service_module._service = original


def test_news_for_symbol_returns_only_matching_articles(client, test_engine):
    _make_item(test_engine, external_id="sym-1", symbols=["AAPL"])
    _make_item(test_engine, external_id="sym-2", symbols=["MSFT"])

    resp = client.get("/api/v1/news/AAPL")
    assert resp.status_code == 200
    body = resp.json()
    assert body["symbol"] == "AAPL"
    assert all("AAPL" in a["symbols"] for a in body["articles"])
    assert not any(a["external_id"] == "sym-2" for a in body["articles"])


def test_news_for_symbol_is_case_insensitive(client, test_engine):
    _make_item(test_engine, external_id="ci-1", symbols=["GOOGL"])
    resp = client.get("/api/v1/news/googl")
    assert resp.status_code == 200
    assert resp.json()["symbol"] == "GOOGL"


def test_breaking_news_excludes_low_impact_stories(client, test_engine):
    _make_item(test_engine, external_id="hi-1", impact=0.9)
    _make_item(test_engine, external_id="lo-1", impact=0.1)

    resp = client.get("/api/v1/news", params={"min_impact": 0.4})
    assert resp.status_code == 200
    external_ids = {a["external_id"] for a in resp.json()["articles"]}
    assert "hi-1" in external_ids
    assert "lo-1" not in external_ids


def test_breaking_news_excludes_stale_stories_outside_the_window(client, test_engine):
    stale = datetime.now(timezone.utc) - timedelta(days=5)
    _make_item(test_engine, external_id="stale-1", published_at=stale, impact=0.9)

    resp = client.get("/api/v1/news", params={"window_hours": 24})
    external_ids = {a["external_id"] for a in resp.json()["articles"]}
    assert "stale-1" not in external_ids


def test_backfill_returns_503_when_alpaca_credentials_are_not_configured(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "alpaca_api_key", None)
    monkeypatch.setattr(settings, "alpaca_api_secret", None)

    resp = client.post("/api/v1/news/backfill", params={"symbols": "AAPL"})
    assert resp.status_code == 503


def test_backfill_persists_articles_via_mocked_rest(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "alpaca_api_key", "test-key")
    monkeypatch.setattr(settings, "alpaca_api_secret", "test-secret")

    payload = {
        "news": [
            {
                "id": 9001, "headline": "AAPL beats earnings estimates", "created_at": "2026-08-18T13:30:00Z",
                "updated_at": "2026-08-18T13:30:00Z", "summary": "Strong quarter.", "url": "https://example.com/a",
                "symbols": ["AAPL"], "source": "Reuters",
            },
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    import app.services.news.alpaca_news as alpaca_news_module

    original_fetch = alpaca_news_module.fetch_news_rest

    def patched(api_key, api_secret, symbols, limit=50, transport=None):
        return original_fetch(api_key, api_secret, symbols, limit=limit, transport=httpx.MockTransport(handler))

    import app.services.news.ingest as ingest_module

    ingest_module.fetch_news_rest = patched
    try:
        resp = client.post("/api/v1/news/backfill", params={"symbols": "AAPL"})
    finally:
        ingest_module.fetch_news_rest = original_fetch

    assert resp.status_code == 200
    body = resp.json()
    assert body["persisted"] == 1
