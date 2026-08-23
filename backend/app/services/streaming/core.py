"""Real-time market streaming core: normalized events, trade→candle
aggregation, and an in-process pub/sub bus.

Design (mirrors architecture D3/D4): ONE managed provider connection per
symbol on the backend; N frontend clients fan out from the bus over SSE.
The bus is asyncio-native and in-process — the Redis pub/sub swap at
scale-out replaces `EventBus` storage, not its interface.

Every event carries full provenance (provider, mode, source_ts,
received_ts, seq) per the no-silent-demo-data rule: synthetic ticks are
labeled synthetic on every single event, not just once.
"""
from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class TradeEvent:
    symbol: str
    price: float
    volume: float
    source_ts: float            # provider timestamp, epoch seconds
    received_ts: float          # our receive time
    provider: str
    data_mode: str              # synthetic | live | delayed
    seq: int | None = None      # provider sequence when available
    conditions: list = field(default_factory=list)


@dataclass
class Bar:
    symbol: str
    timeframe: str              # "1m"
    start_ts: float             # bar open time, epoch
    open: float
    high: float
    low: float
    close: float
    volume: float
    trade_count: int
    provider: str
    data_mode: str
    last_update_ts: float

    def to_payload(self) -> dict:
        return {
            "symbol": self.symbol, "timeframe": self.timeframe,
            "start": datetime.fromtimestamp(self.start_ts, tz=timezone.utc).isoformat(),
            "open": self.open, "high": self.high, "low": self.low,
            "close": self.close, "volume": self.volume, "trade_count": self.trade_count,
            "provider": self.provider, "data_mode": self.data_mode,
            "last_update": datetime.fromtimestamp(self.last_update_ts, tz=timezone.utc).isoformat(),
        }


class CandleAggregator:
    """Aggregates a trade stream into 1-minute candles.

    Correctness rules (each unit-tested):
    - duplicates (same seq, or same (source_ts, price, volume) when the
      provider has no seq) are dropped;
    - out-of-order trades belonging to an already-closed bar are dropped
      and counted (never mutate closed bars — they may be persisted);
    - a trade in a new minute closes the previous bar (emits it) and opens
      the next;
    - staleness = seconds since last accepted trade.
    """

    def __init__(self, symbol: str, timeframe_seconds: int = 60, keep_closed: int = 500):
        self.symbol = symbol
        self.tf = timeframe_seconds
        self.current: Bar | None = None
        self.closed_bars: deque[Bar] = deque(maxlen=keep_closed)  # intraday history for late joiners
        self.dropped_duplicates = 0
        self.dropped_out_of_order = 0
        self._seen_keys: set = set()
        self._last_accept_ts: float | None = None

    def _bucket(self, ts: float) -> float:
        return ts - (ts % self.tf)

    def add_trade(self, t: TradeEvent) -> tuple[Bar | None, Bar | None]:
        """Returns (closed_bar or None, updated_current_bar or None)."""
        key = t.seq if t.seq is not None else (round(t.source_ts, 3), t.price, t.volume)
        if key in self._seen_keys:
            self.dropped_duplicates += 1
            return None, None
        self._seen_keys.add(key)
        if len(self._seen_keys) > 10_000:
            self._seen_keys = set(list(self._seen_keys)[-5_000:])

        bucket = self._bucket(t.source_ts)
        closed: Bar | None = None

        if self.current is not None and bucket < self.current.start_ts:
            self.dropped_out_of_order += 1  # belongs to an already-closed bar
            return None, None

        if self.current is None or bucket > self.current.start_ts:
            closed = self.current
            if closed is not None:
                self.closed_bars.append(closed)
            self.current = Bar(
                symbol=self.symbol, timeframe=f"{self.tf // 60}m", start_ts=bucket,
                open=t.price, high=t.price, low=t.price, close=t.price,
                volume=t.volume, trade_count=1,
                provider=t.provider, data_mode=t.data_mode, last_update_ts=t.received_ts,
            )
        else:
            bar = self.current
            bar.high = max(bar.high, t.price)
            bar.low = min(bar.low, t.price)
            bar.close = t.price
            bar.volume += t.volume
            bar.trade_count += 1
            bar.last_update_ts = t.received_ts

        self._last_accept_ts = t.received_ts
        return closed, self.current

    def staleness_seconds(self, now: float | None = None) -> float | None:
        if self._last_accept_ts is None:
            return None
        return (now or time.time()) - self._last_accept_ts


class EventBus:
    """Per-symbol asyncio pub/sub with bounded queues (slow consumers drop
    oldest, never block the market path)."""

    def __init__(self, maxsize: int = 500):
        self._subs: dict[str, list[asyncio.Queue]] = {}
        self._maxsize = maxsize

    def subscribe(self, symbol: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._maxsize)
        self._subs.setdefault(symbol, []).append(q)
        return q

    def unsubscribe(self, symbol: str, q: asyncio.Queue) -> None:
        if symbol in self._subs and q in self._subs[symbol]:
            self._subs[symbol].remove(q)

    def publish(self, symbol: str, event_type: str, payload: dict) -> None:
        event = {"type": event_type, "ts": datetime.now(timezone.utc).isoformat(), "payload": payload}
        for q in self._subs.get(symbol, []):
            if q.full():
                try:
                    q.get_nowait()  # drop oldest for the laggard
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(event)

    def subscriber_count(self, symbol: str) -> int:
        return len(self._subs.get(symbol, []))
