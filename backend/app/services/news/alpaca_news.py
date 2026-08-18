"""Alpaca News — REST historical backfill + real-time WS stream.

Same Data API credentials and host as services/data_providers/alpaca_provider.py
(https://data.alpaca.markets) — market-data scope only, this module never
touches Alpaca's Trading API. REST is `/v1beta1/news`, WS is
`wss://stream.data.alpaca.markets/v1beta1/news`; both return the same
article shape (id, headline, author, created_at, updated_at, summary,
url, symbols, source), so one parser (`_parse_alpaca_article`) serves
both paths.

The WS manager mirrors services/streaming/service.py's AlpacaStreamManager
(trades) exactly on purpose — same one-shared-connection-per-process
design (Alpaca's Basic plan allows exactly one concurrent connection per
data feed), same auth/reconnect/backoff shape — but is entirely
independent of it (a separate WS endpoint/subscription), so a trade-stream
outage never takes news down or vice versa.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import httpx

from app.services.data_providers.http_base import ProviderDataUnavailable, RateLimitedHttpClient

if TYPE_CHECKING:
    from websockets.asyncio.client import ClientConnection

logger = logging.getLogger(__name__)

_BASE_URL = "https://data.alpaca.markets"
_WS_URL = "wss://stream.data.alpaca.markets/v1beta1/news"

_ISO_TS_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$")


def _parse_iso_ts(raw: str | None) -> datetime | None:
    """RFC3339 timestamp -> aware UTC datetime. Returns None (never
    raises) on anything unrecognized, so one malformed article's timestamp
    drops just that field's precision, never the whole pipeline."""
    if not raw:
        return None
    match = _ISO_TS_RE.match(raw)
    if not match:
        return None
    base, frac, tz = match.groups()
    frac = (frac or "")[:7]  # microsecond precision max
    tz_norm = "+00:00" if (tz in (None, "Z")) else (tz if ":" in tz else f"{tz[:3]}:{tz[3:]}")
    try:
        dt = datetime.fromisoformat(base + frac + tz_norm)
    except ValueError:
        return None
    return dt.astimezone(timezone.utc)


@dataclass
class NewsArticleRaw:
    """Normalized shape, identical whether sourced from REST backfill or
    the WS stream — everything downstream (classify.py, persistence)
    works from this, never the raw provider JSON directly."""

    external_id: str
    headline: str
    summary: str | None
    url: str | None
    source: str
    symbols: list[str]
    published_at: datetime
    updated_at: datetime | None
    is_update: bool = False  # True when this is a re-publish of an existing article_id


def _parse_alpaca_article(payload: dict) -> NewsArticleRaw | None:
    article_id = payload.get("id")
    headline = payload.get("headline")
    created_at = _parse_iso_ts(payload.get("created_at"))
    if article_id is None or not headline or created_at is None:
        return None
    updated_at = _parse_iso_ts(payload.get("updated_at"))
    return NewsArticleRaw(
        external_id=str(article_id),
        headline=headline,
        summary=payload.get("summary") or None,
        url=payload.get("url") or None,
        source=payload.get("source") or "alpaca",
        symbols=[s.upper() for s in (payload.get("symbols") or [])],
        published_at=created_at,
        updated_at=updated_at,
        is_update=bool(updated_at and updated_at != created_at),
    )


def fetch_news_rest(
    api_key: str,
    api_secret: str,
    symbols: list[str],
    limit: int = 50,
    transport: httpx.BaseTransport | None = None,
) -> list[NewsArticleRaw]:
    """Historical/backfill news for `symbols` — real REST data, honest
    ProviderDataUnavailable on failure (never silently returns nothing
    indistinguishable from "no news exists")."""
    if not api_key or not api_secret:
        raise ProviderDataUnavailable(
            "ALPACA_API_KEY / ALPACA_API_SECRET are not set — required for Alpaca News."
        )
    from app.core.logging import register_secret

    register_secret(api_key)
    register_secret(api_secret)
    http = RateLimitedHttpClient(
        vendor="Alpaca News",
        base_url=_BASE_URL,
        calls_per_minute=200,
        cache_ttl_seconds=60.0,
        headers={"APCA-API-KEY-ID": api_key, "APCA-API-SECRET-KEY": api_secret},
        transport=transport,
    )
    payload = http.get_json("/v1beta1/news", params={"symbols": ",".join(symbols), "limit": limit})
    if not isinstance(payload, dict) or "news" not in payload:
        raise ProviderDataUnavailable(f"Alpaca News: unexpected response shape: {payload!r:.200}")
    articles = []
    for raw in payload["news"]:
        parsed = _parse_alpaca_article(raw)
        if parsed is not None:
            articles.append(parsed)
    return articles


def _alpaca_auth_succeeded(raw: str | bytes) -> bool:
    try:
        msgs = json.loads(raw)
    except json.JSONDecodeError:
        return False
    if not isinstance(msgs, list):
        msgs = [msgs]
    return any(isinstance(m, dict) and m.get("T") == "success" and m.get("msg") == "authenticated" for m in msgs)


def _parse_news_ws_messages(raw: str | bytes) -> list[NewsArticleRaw]:
    try:
        msgs = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(msgs, list):
        msgs = [msgs]
    out = []
    for m in msgs:
        if not isinstance(m, dict) or m.get("T") != "n":
            continue
        parsed = _parse_alpaca_article(m)
        if parsed is not None:
            out.append(parsed)
    return out


NewsCallback = Callable[[NewsArticleRaw], Awaitable[None]]


class AlpacaNewsStreamManager:
    """One shared Alpaca News WebSocket connection for the whole process —
    started once (services/news/ingest.py's NewsIngestionService, wired
    into app startup), subscribed to the canonical asset universe.
    Reconnects with exponential backoff, same discipline as
    services/streaming/service.py's AlpacaStreamManager for trades.
    """

    def __init__(self, api_key: str, api_secret: str):
        from app.core.logging import register_secret

        register_secret(api_key)
        register_secret(api_secret)
        self.api_key = api_key
        self.api_secret = api_secret
        self._callbacks: list[NewsCallback] = []
        self._symbols: list[str] = []
        self._ws: ClientConnection | None = None
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self.connected: bool = False
        self.last_message_at: datetime | None = None

    async def start(self, symbols: list[str], on_article: NewsCallback) -> None:
        async with self._lock:
            self._symbols = sorted({s.upper() for s in symbols})
            if on_article not in self._callbacks:
                self._callbacks.append(on_article)
            if self._task is None or self._task.done():
                self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()

    def health(self) -> dict:
        return {
            "connected": self.connected,
            "subscribed_symbols": self._symbols,
            "last_message_at": self.last_message_at.isoformat() if self.last_message_at else None,
        }

    async def _run(self) -> None:
        import websockets

        backoff = 1.0
        while True:
            try:
                async with websockets.connect(_WS_URL) as ws:
                    await ws.recv()  # {"T":"success","msg":"connected"} — connection ack only
                    await ws.send(json.dumps({"action": "auth", "key": self.api_key, "secret": self.api_secret}))
                    auth_reply = await ws.recv()
                    if not _alpaca_auth_succeeded(auth_reply):
                        raise RuntimeError(f"Alpaca News WS auth rejected: {auth_reply!r}")
                    self._ws = ws
                    self.connected = True
                    subscribe_to = self._symbols or ["*"]
                    await ws.send(json.dumps({"action": "subscribe", "news": subscribe_to}))
                    backoff = 1.0
                    async for raw in ws:
                        self.last_message_at = datetime.now(timezone.utc)
                        for article in _parse_news_ws_messages(raw):
                            for cb in list(self._callbacks):
                                try:
                                    await cb(article)
                                except Exception:
                                    logger.exception("alpaca news ws: callback failed for article %s", article.external_id)
            except asyncio.CancelledError:
                self.connected = False
                raise
            except Exception as exc:
                logger.warning("alpaca news ws error: %s — reconnecting in %.0fs", exc, backoff)
                self.connected = False
                self._ws = None
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)


_news_manager: AlpacaNewsStreamManager | None = None


def get_alpaca_news_manager(api_key: str, api_secret: str) -> AlpacaNewsStreamManager:
    global _news_manager
    if _news_manager is None:
        _news_manager = AlpacaNewsStreamManager(api_key, api_secret)
    return _news_manager
