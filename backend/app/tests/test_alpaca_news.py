"""Alpaca News REST + WS — fully mocked, no real network. Mirrors
test_streaming.py's AlpacaStreamManager reconnect-test conventions
exactly, for the same reasons (Alpaca allows exactly one concurrent
connection per feed/account)."""
import asyncio

import httpx
import pytest

from app.services.data_providers.http_base import ProviderDataUnavailable
from app.services.news.alpaca_news import (
    AlpacaNewsStreamManager,
    _alpaca_auth_succeeded,
    _parse_alpaca_article,
    _parse_iso_ts,
    _parse_news_ws_messages,
    fetch_news_rest,
)

_REST_PAYLOAD = {
    "news": [
        {
            "id": 12345, "headline": "AAPL beats earnings estimates", "author": "Jane Doe",
            "created_at": "2026-08-18T13:30:00Z", "updated_at": "2026-08-18T13:30:00Z",
            "summary": "Apple reported strong quarterly results.", "url": "https://example.com/a",
            "symbols": ["AAPL"], "source": "Benzinga",
        },
        {
            "id": 12346, "headline": "Tech stocks rally broadly", "author": "John Roe",
            "created_at": "2026-08-18T14:00:00Z", "updated_at": "2026-08-18T14:05:00Z",
            "summary": None, "url": "https://example.com/b",
            "symbols": ["AAPL", "MSFT", "GOOGL"], "source": "Reuters",
        },
    ],
    "next_page_token": None,
}


def test_parse_iso_ts_handles_z_suffix():
    dt = _parse_iso_ts("2026-08-18T13:30:00Z")
    assert dt is not None
    assert dt.tzinfo is not None
    assert dt.year == 2026 and dt.hour == 13


def test_parse_iso_ts_returns_none_for_garbage():
    assert _parse_iso_ts("not-a-timestamp") is None
    assert _parse_iso_ts(None) is None


def test_parse_alpaca_article_maps_fields():
    article = _parse_alpaca_article(_REST_PAYLOAD["news"][0])
    assert article is not None
    assert article.external_id == "12345"
    assert article.headline == "AAPL beats earnings estimates"
    assert article.symbols == ["AAPL"]
    assert article.source == "Benzinga"
    assert article.is_update is False  # created_at == updated_at


def test_parse_alpaca_article_detects_an_update():
    article = _parse_alpaca_article(_REST_PAYLOAD["news"][1])
    assert article.is_update is True  # updated_at != created_at


def test_parse_alpaca_article_returns_none_for_missing_required_fields():
    assert _parse_alpaca_article({"headline": "x"}) is None  # no id, no created_at
    assert _parse_alpaca_article({"id": 1, "created_at": "2026-01-01T00:00:00Z"}) is None  # no headline


def test_fetch_news_rest_requires_credentials():
    with pytest.raises(ProviderDataUnavailable, match="ALPACA_API_KEY"):
        fetch_news_rest(None, None, ["AAPL"])


def test_fetch_news_rest_parses_real_response_shape():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1beta1/news"
        assert request.headers["APCA-API-KEY-ID"] == "test-key"
        return httpx.Response(200, json=_REST_PAYLOAD)

    articles = fetch_news_rest("test-key", "test-secret", ["AAPL"], transport=httpx.MockTransport(handler))
    assert len(articles) == 2
    assert articles[0].headline == "AAPL beats earnings estimates"


def test_fetch_news_rest_never_leaks_credentials_in_the_url():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(200, json=_REST_PAYLOAD)

    fetch_news_rest("MY-SECRET-KEY", "MY-SECRET-SECRET", ["AAPL"], transport=httpx.MockTransport(handler))
    assert "MY-SECRET-KEY" not in captured["url"]
    assert "MY-SECRET-SECRET" not in captured["url"]


def test_fetch_news_rest_raises_on_unexpected_shape():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": True})

    with pytest.raises(ProviderDataUnavailable):
        fetch_news_rest("k", "s", ["AAPL"], transport=httpx.MockTransport(handler))


def test_alpaca_auth_reply_detection():
    assert _alpaca_auth_succeeded('[{"T":"success","msg":"authenticated"}]') is True
    assert _alpaca_auth_succeeded('[{"T":"error","msg":"auth failed"}]') is False
    assert _alpaca_auth_succeeded("not json") is False


def test_parse_news_ws_messages_extracts_only_news_type():
    raw = (
        '[{"T":"n","id":999,"headline":"WS headline","created_at":"2026-08-18T15:00:00Z",'
        '"symbols":["AAPL"],"source":"Benzinga"},'
        '{"T":"success","msg":"subscribed"}]'
    )
    articles = _parse_news_ws_messages(raw)
    assert len(articles) == 1
    assert articles[0].external_id == "999"


# ---------- WS reconnect (fully mocked, no real network) ---------------------

class _BoomWS:
    async def __aenter__(self):
        raise ConnectionRefusedError("simulated drop")

    async def __aexit__(self, *exc):
        return False


class _FakeNewsWS:
    def __init__(self, messages):
        self._messages = list(messages)
        self.sent = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def send(self, msg):
        self.sent.append(msg)

    async def recv(self):
        return self._messages.pop(0)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._messages:
            return self._messages.pop(0)
        await asyncio.Future()  # never resolves


def test_alpaca_news_ws_reconnects_after_a_drop_and_delivers_an_article():
    import websockets

    attempts = {"n": 0}

    def fake_connect(url):
        attempts["n"] += 1
        if attempts["n"] == 1:
            return _BoomWS()
        return _FakeNewsWS([
            '[{"T":"success","msg":"connected"}]',
            '[{"T":"success","msg":"authenticated"}]',
            '[{"T":"n","id":1,"headline":"Reconnected headline","created_at":"2026-08-18T00:00:00Z",'
            '"symbols":["AAPL"],"source":"Benzinga"}]',
        ])

    async def run_test():
        original_connect = websockets.connect
        websockets.connect = fake_connect
        try:
            received = []

            async def on_article(a):
                received.append(a)

            manager = AlpacaNewsStreamManager("test-key", "test-secret")
            await manager.start(["AAPL"], on_article)
            for _ in range(60):
                await asyncio.sleep(0.05)
                if received:
                    break
            manager.stop()
            await asyncio.sleep(0.05)
            return received
        finally:
            websockets.connect = original_connect

    received = asyncio.run(run_test())
    assert attempts["n"] >= 2, "must have reconnected after the first attempt failed"
    assert len(received) == 1
    assert received[0].headline == "Reconnected headline"


def test_alpaca_news_ws_subscribes_to_the_given_symbols():
    import websockets

    ws_holder = {}

    def fake_connect(url):
        ws = _FakeNewsWS([
            '[{"T":"success","msg":"connected"}]',
            '[{"T":"success","msg":"authenticated"}]',
        ])
        ws_holder["ws"] = ws
        return ws

    async def run_test():
        original_connect = websockets.connect
        websockets.connect = fake_connect
        try:
            manager = AlpacaNewsStreamManager("test-key", "test-secret")
            await manager.start(["AAPL", "MSFT"], lambda a: asyncio.sleep(0))
            for _ in range(40):
                await asyncio.sleep(0.05)
                if "ws" in ws_holder and len(ws_holder["ws"].sent) >= 2:
                    break
            manager.stop()
            await asyncio.sleep(0.05)
        finally:
            websockets.connect = original_connect

    asyncio.run(run_test())
    import json

    subscribe_msg = json.loads(ws_holder["ws"].sent[1])
    assert subscribe_msg["action"] == "subscribe"
    assert set(subscribe_msg["news"]) == {"AAPL", "MSFT"}
