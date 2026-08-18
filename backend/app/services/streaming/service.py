"""Market stream service: one managed source per symbol, fan-out via bus.

Sources:
- SyntheticTickSource — deterministic-seeded ticks continuing the mock
  provider's last close. EVERY event is labeled data_mode="synthetic"
  (no-silent-demo-data). Exists so the entire live pipeline is runnable
  and testable with zero keys.
- FinnhubTradeSource — real `wss://ws.finnhub.io` trade stream with
  exponential-backoff reconnect. Implemented and unit-covered with a fake
  socket; NOT verified against the live endpoint from this environment
  (network policy blocks finnhub.io here) — verify on a machine with the
  key before relying on it. Honest status: implemented-unverified-live.

Service responsibilities (spec §backend-streaming): dynamic subscribe,
reconnect w/ backoff, staleness watchdog (provider.stale / provider.
reconnected events), dedupe + out-of-order via CandleAggregator, live
indicator updates, health snapshot.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import datetime

import numpy as np

from app.core.config import get_settings
from app.services.streaming.core import Bar, CandleAggregator, EventBus, TradeEvent
from app.services.streaming.incremental import LiveIndicatorSet

logger = logging.getLogger(__name__)

STALE_AFTER_SECONDS = 20.0


class SyntheticTickSource:
    data_mode = "synthetic"
    provider = "mock-stream"

    def __init__(self, symbol: str, tick_interval: float = 1.0):
        self.symbol = symbol
        self.tick_interval = tick_interval

    async def run(self, on_trade) -> None:
        from app.services.data_providers.mock_provider import MockOTCProvider, _seed_for

        base = MockOTCProvider().get_ohlcv(self.symbol, lookback_days=5)["close"].iloc[-1]
        rng = np.random.default_rng(_seed_for(self.symbol) ^ 0xFEED)
        price = float(base)
        seq = 0
        while True:
            await asyncio.sleep(self.tick_interval)
            seq += 1
            price = max(price * float(np.exp(rng.normal(0, 0.0015))), 1e-6)
            now = time.time()
            await on_trade(TradeEvent(
                symbol=self.symbol, price=round(price, 6),
                volume=float(rng.integers(100, 5000)),
                source_ts=now, received_ts=now,
                provider=self.provider, data_mode=self.data_mode, seq=seq,
            ))


class FinnhubTradeSource:
    data_mode = "live"
    provider = "finnhub-ws"

    def __init__(self, symbol: str, api_key: str):
        self.symbol = symbol
        self.api_key = api_key

    async def run(self, on_trade) -> None:
        import websockets

        backoff = 1.0
        while True:
            try:
                async with websockets.connect(f"wss://ws.finnhub.io?token={self.api_key}") as ws:
                    await ws.send(json.dumps({"type": "subscribe", "symbol": self.symbol}))
                    backoff = 1.0
                    async for raw in ws:
                        for t in self.parse_message(raw, self.symbol):
                            await on_trade(t)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning("finnhub ws error for %s: %s — reconnecting in %.0fs", self.symbol, exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)

    @staticmethod
    def parse_message(raw: str, symbol: str) -> list[TradeEvent]:
        """Finnhub WS schema: {"type":"trade","data":[{s,p,v,t(ms),c}]}."""
        now = time.time()
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return []
        if msg.get("type") != "trade":
            return []
        out = []
        for d in msg.get("data", []):
            if d.get("s") != symbol or "p" not in d or "t" not in d:
                continue  # schema validation: skip malformed entries
            out.append(TradeEvent(
                symbol=symbol, price=float(d["p"]), volume=float(d.get("v") or 0),
                source_ts=float(d["t"]) / 1000.0, received_ts=now,
                provider="finnhub-ws", data_mode="live",
                conditions=list(d.get("c") or []),
            ))
        return out


_ALPACA_TS_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$")


def _parse_alpaca_ts(raw: str) -> float | None:
    """Alpaca's WS timestamps are RFC3339 with nanosecond precision (e.g.
    "2024-01-01T12:00:00.123456789Z") — Python's datetime only supports
    microseconds, so the fractional part is truncated to 6 digits before
    parsing. Returns None (never raises) on any unrecognized shape so a
    malformed timestamp drops that one message instead of killing the
    stream."""
    match = _ALPACA_TS_RE.match(raw or "")
    if not match:
        return None
    base, frac, tz = match.groups()
    frac6 = (frac or "").ljust(6, "0")[:6]
    tz_norm = "+00:00" if tz == "Z" else tz
    try:
        return datetime.fromisoformat(f"{base}.{frac6}{tz_norm}").timestamp()
    except ValueError:
        return None


class AlpacaTradeSource:
    data_mode = "live"
    provider = "alpaca-ws"

    def __init__(self, symbol: str, api_key: str, api_secret: str):
        self.symbol = symbol
        self.api_key = api_key
        self.api_secret = api_secret

    async def run(self, on_trade) -> None:
        import websockets

        backoff = 1.0
        while True:
            try:
                async with websockets.connect("wss://stream.data.alpaca.markets/v2/iex") as ws:
                    await ws.recv()  # initial {"T":"success","msg":"connected"} — connection ack only
                    await ws.send(json.dumps({"action": "auth", "key": self.api_key, "secret": self.api_secret}))
                    auth_reply = await ws.recv()
                    if not self._auth_succeeded(auth_reply):
                        raise RuntimeError(f"Alpaca WS auth rejected: {auth_reply}")
                    await ws.send(json.dumps({"action": "subscribe", "trades": [self.symbol]}))
                    backoff = 1.0
                    async for raw in ws:
                        for t in self.parse_message(raw, self.symbol):
                            await on_trade(t)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning("alpaca ws error for %s: %s — reconnecting in %.0fs", self.symbol, exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)

    @staticmethod
    def _auth_succeeded(raw: str) -> bool:
        try:
            msgs = json.loads(raw)
        except json.JSONDecodeError:
            return False
        if not isinstance(msgs, list):
            msgs = [msgs]
        return any(isinstance(m, dict) and m.get("T") == "success" and m.get("msg") == "authenticated" for m in msgs)

    @staticmethod
    def parse_message(raw: str, symbol: str) -> list[TradeEvent]:
        """Alpaca WS schema: a JSON array of message objects (not a single
        object per message, unlike Finnhub) — trade messages shaped
        {"T":"t","S":symbol,"p":price,"s":size,"t":RFC3339-ns,"i":trade_id,
        "c":[conditions]}. Non-trade messages (success/subscription/error/
        quote) are skipped here, same schema-validation discipline as
        FinnhubTradeSource.parse_message."""
        now = time.time()
        try:
            msgs = json.loads(raw)
        except json.JSONDecodeError:
            return []
        if not isinstance(msgs, list):
            msgs = [msgs]
        out = []
        for m in msgs:
            if not isinstance(m, dict) or m.get("T") != "t" or m.get("S") != symbol or "p" not in m or "t" not in m:
                continue
            source_ts = _parse_alpaca_ts(m["t"])
            if source_ts is None:
                continue
            out.append(TradeEvent(
                symbol=symbol, price=float(m["p"]), volume=float(m.get("s") or 0),
                source_ts=source_ts, received_ts=now,
                provider="alpaca-ws", data_mode="live",
                seq=m.get("i"), conditions=list(m.get("c") or []),
            ))
        return out


class MarketStreamService:
    def __init__(self):
        self.bus = EventBus()
        self._tasks: dict[str, asyncio.Task] = {}
        self._aggs: dict[str, CandleAggregator] = {}
        self._indicators: dict[str, LiveIndicatorSet] = {}
        self._stale: dict[str, bool] = {}

    def _make_source(self, symbol: str):
        settings = get_settings()
        provider_name = settings.market_data_provider
        if provider_name.startswith("alpaca") and settings.alpaca_api_key and settings.alpaca_api_secret:
            return AlpacaTradeSource(symbol, settings.alpaca_api_key, settings.alpaca_api_secret)
        if provider_name.startswith("finnhub") and settings.finnhub_api_key:
            return FinnhubTradeSource(symbol, settings.finnhub_api_key)
        return SyntheticTickSource(symbol)

    async def ensure_symbol(self, symbol: str) -> None:
        symbol = symbol.upper()
        if symbol in self._tasks and not self._tasks[symbol].done():
            return
        self._aggs[symbol] = CandleAggregator(symbol)
        self._indicators[symbol] = LiveIndicatorSet()
        self._stale[symbol] = False
        source = self._make_source(symbol)

        async def on_trade(t: TradeEvent) -> None:
            agg = self._aggs[symbol]
            closed, current = agg.add_trade(t)
            if closed is None and current is None:
                return  # duplicate / out-of-order, counted in agg
            ind = self._indicators[symbol]
            ind.on_trade(t.price, t.volume)
            if self._stale.get(symbol):
                self._stale[symbol] = False
                self.bus.publish(symbol, "provider.reconnected", {"provider": t.provider})
            self.bus.publish(symbol, "quote.updated", {
                "price": t.price, "volume": t.volume, "provider": t.provider,
                "data_mode": t.data_mode, "source_ts": t.source_ts, "seq": t.seq,
            })
            if closed is not None:
                ind.on_bar_close(closed.close)
                self.bus.publish(symbol, "bar.closed", closed.to_payload())
                self.bus.publish(symbol, "indicator.updated", {
                    "indicators": ind.snapshot(), "all_warm": ind.all_warm,
                })
            if current is not None:
                self.bus.publish(symbol, "bar.updated", current.to_payload())

        async def runner():
            watchdog = asyncio.create_task(self._watchdog(symbol, getattr(source, "provider", "?")))
            try:
                await source.run(on_trade)
            finally:
                watchdog.cancel()

        self._tasks[symbol] = asyncio.create_task(runner())

    async def _watchdog(self, symbol: str, provider: str) -> None:
        while True:
            await asyncio.sleep(5.0)
            staleness = self._aggs[symbol].staleness_seconds()
            if staleness is not None and staleness > STALE_AFTER_SECONDS and not self._stale.get(symbol):
                self._stale[symbol] = True
                self.bus.publish(symbol, "provider.stale", {
                    "provider": provider, "stale_seconds": round(staleness, 1),
                })

    def health(self, symbol: str) -> dict:
        symbol = symbol.upper()
        agg = self._aggs.get(symbol)
        task = self._tasks.get(symbol)
        return {
            "symbol": symbol,
            "streaming": task is not None and not task.done(),
            "stale": self._stale.get(symbol, False),
            "staleness_seconds": agg.staleness_seconds() if agg else None,
            "dropped_duplicates": agg.dropped_duplicates if agg else 0,
            "dropped_out_of_order": agg.dropped_out_of_order if agg else 0,
            "subscribers": self.bus.subscriber_count(symbol),
        }

    def current_bar(self, symbol: str) -> Bar | None:
        agg = self._aggs.get(symbol.upper())
        return agg.current if agg else None

    def recent_bars(self, symbol: str, limit: int = 500) -> list[Bar]:
        """Closed intraday bars (oldest→newest) plus the in-progress bar,
        so late-joining clients can seed their chart before streaming."""
        agg = self._aggs.get(symbol.upper())
        if agg is None:
            return []
        bars = list(agg.closed_bars)[-limit:]
        if agg.current is not None:
            bars.append(agg.current)
        return bars


_service: MarketStreamService | None = None


def get_stream_service() -> MarketStreamService:
    global _service
    if _service is None:
        _service = MarketStreamService()
    return _service
