"""Streaming core: aggregation, dedupe, out-of-order, staleness,
incremental-indicator equivalence, finnhub/alpaca WS parsing, signal
engine rules."""
import asyncio
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from app.services.streaming.core import CandleAggregator, EventBus, TradeEvent
from app.services.streaming.incremental import IncrementalEMA, IncrementalRSI, LiveIndicatorSet
from app.services.streaming.service import AlpacaTradeSource, FinnhubTradeSource, _parse_alpaca_ts


def _trade(price, ts, seq=None, vol=100.0):
    return TradeEvent(symbol="T", price=price, volume=vol, source_ts=ts,
                      received_ts=ts, provider="test", data_mode="synthetic", seq=seq)


def test_aggregator_builds_and_closes_bars():
    agg = CandleAggregator("T")
    t0 = 1_700_000_000.0  # minute boundary-aligned enough
    base = t0 - (t0 % 60)
    agg.add_trade(_trade(1.00, base + 1, seq=1))
    agg.add_trade(_trade(1.05, base + 20, seq=2))
    closed, current = agg.add_trade(_trade(0.98, base + 40, seq=3))
    assert closed is None
    assert current.open == 1.00 and current.high == 1.05 and current.low == 0.98 and current.close == 0.98
    assert current.trade_count == 3

    closed, current = agg.add_trade(_trade(1.10, base + 65, seq=4))  # next minute
    assert closed is not None and closed.close == 0.98
    assert current.open == 1.10 and current.start_ts == base + 60


def test_aggregator_drops_duplicates():
    agg = CandleAggregator("T")
    agg.add_trade(_trade(1.0, 1000.0, seq=7))
    closed, current = agg.add_trade(_trade(1.0, 1000.0, seq=7))
    assert (closed, current) == (None, None)
    assert agg.dropped_duplicates == 1


def test_aggregator_drops_out_of_order_into_closed_bars():
    agg = CandleAggregator("T")
    base = 1_700_000_040.0 - (1_700_000_040.0 % 60)
    agg.add_trade(_trade(1.0, base + 10, seq=1))
    agg.add_trade(_trade(1.1, base + 70, seq=2))     # closes first bar
    closed, current = agg.add_trade(_trade(0.5, base + 15, seq=3))  # late trade for closed bar
    assert (closed, current) == (None, None)
    assert agg.dropped_out_of_order == 1
    assert agg.current.low == 1.1  # closed bar was never mutated


def test_aggregator_retains_closed_bars_for_late_joiners():
    agg = CandleAggregator("T", keep_closed=3)
    base = 1_700_000_040.0 - (1_700_000_040.0 % 60)
    for i in range(5):  # 5 minutes of trades → 4 closed bars, buffer keeps 3
        agg.add_trade(_trade(1.0 + i * 0.01, base + i * 60, seq=i))
    assert len(agg.closed_bars) == 3
    assert [b.start_ts for b in agg.closed_bars] == [base + 60, base + 120, base + 180]
    assert agg.current.start_ts == base + 240


def test_staleness_measurement():
    agg = CandleAggregator("T")
    assert agg.staleness_seconds() is None
    now = time.time()
    agg.add_trade(_trade(1.0, now, seq=1))
    assert agg.staleness_seconds(now + 30) == pytest.approx(30, abs=0.1)


def test_bus_fanout_and_slow_consumer_drop():
    import asyncio

    async def run():
        bus = EventBus(maxsize=3)
        q1, q2 = bus.subscribe("T"), bus.subscribe("T")
        for i in range(5):
            bus.publish("T", "bar.updated", {"i": i})
        assert q1.qsize() == 3 and q2.qsize() == 3  # oldest dropped, never blocked
        first = await q1.get()
        assert first["payload"]["i"] == 2

    asyncio.run(run())


def test_incremental_ema_matches_pandas():
    rng = np.random.default_rng(3)
    closes = 2 + np.cumsum(rng.normal(0, 0.02, 200))
    batch = pd.Series(closes).ewm(span=9, adjust=False).mean().iloc[-1]
    inc = IncrementalEMA(9)
    for c in closes:
        result = inc.update(float(c))
    assert result.value == pytest.approx(batch, abs=1e-9)
    assert result.warm is True


def test_incremental_rsi_reasonable_and_warm_gated():
    inc = IncrementalRSI(14)
    for i, c in enumerate([1.0 + 0.01 * i for i in range(10)]):
        r = inc.update(c)
    assert r.warm is False and r.value is None  # not enough history yet
    for i in range(20):
        r = inc.update(1.1 + 0.01 * i)
    assert r.warm is True and r.value == pytest.approx(100.0, abs=1e-6)  # pure uptrend


def test_live_indicator_set_warmup_gate():
    live = LiveIndicatorSet()
    live.on_trade(1.0, 100)
    for i in range(5):
        live.on_bar_close(1.0 + i * 0.01)
    assert live.all_warm is False
    for i in range(25):
        live.on_bar_close(1.05 + i * 0.01)
    assert live.all_warm is True


def test_finnhub_ws_parsing_and_schema_validation():
    raw = '{"type":"trade","data":[{"s":"AXNT","p":1.23,"v":500,"t":1700000000000,"c":["1"]},{"s":"OTHER","p":9,"t":1},{"p":5}]}'
    trades = FinnhubTradeSource.parse_message(raw, "AXNT")
    assert len(trades) == 1
    t = trades[0]
    assert t.price == 1.23 and t.data_mode == "live" and t.provider == "finnhub-ws"
    assert t.source_ts == pytest.approx(1_700_000_000.0)
    assert FinnhubTradeSource.parse_message("not json", "AXNT") == []
    assert FinnhubTradeSource.parse_message('{"type":"ping"}', "AXNT") == []


def test_parse_alpaca_ts_handles_nanosecond_precision():
    expected = datetime(2024, 1, 1, 12, 0, 0, 123456, tzinfo=timezone.utc).timestamp()
    assert _parse_alpaca_ts("2024-01-01T12:00:00.123456789Z") == pytest.approx(expected)


def test_parse_alpaca_ts_handles_no_fractional_seconds():
    expected = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc).timestamp()
    assert _parse_alpaca_ts("2024-01-01T12:00:00Z") == pytest.approx(expected)


def test_parse_alpaca_ts_returns_none_for_garbage():
    assert _parse_alpaca_ts("not-a-timestamp") is None
    assert _parse_alpaca_ts("") is None


def test_alpaca_ws_parsing_and_schema_validation():
    # Alpaca sends a JSON *array* of messages per frame, unlike Finnhub.
    trade_raw = '[{"T":"t","S":"AAPL","p":191.52,"s":100,"t":"2024-01-01T12:00:00.123456789Z","i":42,"c":["@"]}]'
    trades = AlpacaTradeSource.parse_message(trade_raw, "AAPL")
    assert len(trades) == 1
    t = trades[0]
    assert t.price == 191.52 and t.volume == 100 and t.seq == 42
    assert t.data_mode == "live" and t.provider == "alpaca-ws"
    assert t.source_ts == pytest.approx(datetime(2024, 1, 1, 12, 0, 0, 123456, tzinfo=timezone.utc).timestamp())

    # wrong symbol, non-trade message types (quote/success), and malformed
    # frames are all filtered, never mistaken for a trade.
    assert AlpacaTradeSource.parse_message(trade_raw, "OTHER") == []
    assert AlpacaTradeSource.parse_message('[{"T":"q","S":"AAPL","bp":1,"t":"2024-01-01T00:00:00Z"}]', "AAPL") == []
    assert AlpacaTradeSource.parse_message('[{"T":"success","msg":"connected"}]', "AAPL") == []
    assert AlpacaTradeSource.parse_message("not json", "AAPL") == []
    assert AlpacaTradeSource.parse_message('{"T":"t","S":"AAPL","p":1,"t":"2024-01-01T00:00:00Z"}', "AAPL") != []  # bare object still accepted


def test_alpaca_auth_reply_detection():
    assert AlpacaTradeSource._auth_succeeded('[{"T":"success","msg":"authenticated"}]') is True
    assert AlpacaTradeSource._auth_succeeded('[{"T":"error","msg":"auth failed"}]') is False
    assert AlpacaTradeSource._auth_succeeded("not json") is False


class _BoomWS:
    """Simulates a connection that dies immediately on connect."""

    async def __aenter__(self):
        raise ConnectionRefusedError("simulated drop")

    async def __aexit__(self, *exc):
        return False


class _FakeAlpacaWS:
    """Fully mocked WS: yields the given frames in order, then idles
    forever (like a real open-but-quiet connection) rather than closing —
    lets the test control exactly when to stop via task cancellation."""

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


def test_alpaca_ws_reconnects_after_a_drop_and_delivers_a_trade():
    """Fully mocked HTTP/WebSocket: no real network. First connection
    attempt fails outright; the source must back off and reconnect rather
    than giving up, then successfully authenticate, subscribe, and deliver
    a trade through the same on_trade callback the real path uses."""
    import websockets

    attempts = {"n": 0}

    def fake_connect(url):
        attempts["n"] += 1
        if attempts["n"] == 1:
            return _BoomWS()
        return _FakeAlpacaWS([
            '[{"T":"success","msg":"connected"}]',
            '[{"T":"success","msg":"authenticated"}]',
            '[{"T":"t","S":"AAPL","p":100.0,"s":1,"t":"2024-01-01T00:00:00Z","i":1}]',
        ])

    async def run_test():
        original_connect = websockets.connect
        websockets.connect = fake_connect
        try:
            trades = []

            async def on_trade(t):
                trades.append(t)

            source = AlpacaTradeSource("AAPL", "test-key", "test-secret")
            task = asyncio.create_task(source.run(on_trade))
            for _ in range(60):  # poll up to ~3s of real time for the 1s backoff + reconnect
                await asyncio.sleep(0.05)
                if trades:
                    break
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            return trades
        finally:
            websockets.connect = original_connect

    trades = asyncio.run(run_test())
    assert attempts["n"] >= 2, "must have reconnected after the first attempt failed"
    assert len(trades) == 1
    assert trades[0].price == 100.0
    assert trades[0].provider == "alpaca-ws"
    assert trades[0].data_mode == "live"
