"""Connection lifecycle against a real WebSocket server.

These run over a real TCP socket on loopback: real handshake, real framing, real
JSON-RPC correlation, real disconnects. The server is the labelled test fixture
in ``tests/fixtures/fake_solana_node.py``; the client is the production
``SolanaEventStream`` with no patching.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio

from fixtures import samples
from fixtures.fake_solana_node import FakeSolanaNode
from vyraxis.core.config import SolanaSettings
from vyraxis.core.enums import ConnectionState
from vyraxis.core.errors import PermanentProviderError
from vyraxis.solana import programs
from vyraxis.solana.subscriptions import logs_subscription, slot_subscription
from vyraxis.solana.websocket import RecordingListener, SolanaEventStream


def settings_for(url: str, **overrides: object) -> SolanaSettings:
    base: dict = {
        "rpc_ws_url": url,
        "rpc_http_url": "http://127.0.0.1:1",
        "provider_name": "fixture",
        "ws_connect_timeout_seconds": 2.0,
        "ws_ping_interval_seconds": 0.2,
        "ws_ping_timeout_seconds": 1.0,
        "ws_stale_after_seconds": 1.0,
        "reconnect_initial_backoff_seconds": 0.02,
        "reconnect_max_backoff_seconds": 0.05,
        "reconnect_jitter_ratio": 0.0,
    }
    base.update(overrides)
    return SolanaSettings(**base)  # type: ignore[arg-type]


@pytest_asyncio.fixture
async def node() -> AsyncIterator[FakeSolanaNode]:
    fixture = FakeSolanaNode()
    yield fixture
    await fixture.stop()


def make_stream(url: str, **overrides: object) -> tuple[SolanaEventStream, RecordingListener]:
    listener = RecordingListener()
    stream = SolanaEventStream(
        settings_for(url, **overrides),
        [logs_subscription(programs.PUMP_FUN), slot_subscription()],
        listener=listener,
    )
    return stream, listener


async def collect(stream: SolanaEventStream, count: int, timeout: float = 10.0) -> list:
    """Consume ``count`` events from the stream, or fail the test."""
    events: list = []

    async def run() -> None:
        async for event in stream.stream():
            events.append(event)
            if len(events) >= count:
                return

    await asyncio.wait_for(run(), timeout=timeout)
    return events


# --- criterion 1: establish and monitor a connection ---------------------


async def test_connects_subscribes_and_reports_state(node: FakeSolanaNode) -> None:
    url = await node.start()
    stream, listener = make_stream(url)

    task = asyncio.create_task(collect(stream, 1))
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)
    await node.emit_logs(
        signature=samples.signature(1), slot=1000, logs=samples.PUMPFUN_CREATE_LOGS
    )
    events = await task

    assert len(events) == 1
    assert events[0].slot == 1000
    assert events[0].stream == f"logs:{programs.PUMP_FUN}"
    assert stream.state is ConnectionState.SUBSCRIBED
    assert stream.status().healthy is True

    states = [state for state, _ in listener.history]
    assert ConnectionState.CONNECTING in states
    assert ConnectionState.CONNECTED in states
    assert ConnectionState.SUBSCRIBED in states
    await stream.stop()


async def test_both_subscriptions_are_requested(node: FakeSolanaNode) -> None:
    url = await node.start()
    stream, _ = make_stream(url)
    task = asyncio.create_task(collect(stream, 1))
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)
    await node.emit_logs(signature=samples.signature(2), slot=1, logs=samples.PUMPFUN_BUY_LOGS)
    await task

    methods = [request["method"] for request in node.subscribe_requests]
    assert "logsSubscribe" in methods
    assert "slotSubscribe" in methods
    await stream.stop()


async def test_slot_heartbeat_is_not_emitted_as_a_market_event(node: FakeSolanaNode) -> None:
    """Heartbeats prove liveness; they must not pollute the event stream."""
    url = await node.start()
    stream, _ = make_stream(url)

    task = asyncio.create_task(collect(stream, 1))
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)
    for slot in range(300, 305):
        await node.emit_slot(slot)
    await asyncio.sleep(0.1)
    await node.emit_logs(signature=samples.signature(3), slot=306, logs=samples.PUMPFUN_BUY_LOGS)
    events = await task

    assert len(events) == 1  # only the log notification
    assert stream.metrics.heartbeats_received == 5
    assert stream.metrics.last_slot == 306
    await stream.stop()


# --- criterion 2: recover cleanly from connection loss -------------------


async def test_reconnects_and_resubscribes_after_a_dropped_connection(
    node: FakeSolanaNode,
) -> None:
    url = await node.start()
    stream, listener = make_stream(url)

    events: list = []

    async def consume() -> None:
        async for event in stream.stream():
            events.append(event)
            if len(events) >= 2:
                return

    task = asyncio.create_task(consume())
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)
    await node.emit_logs(signature=samples.signature(4), slot=10, logs=samples.PUMPFUN_BUY_LOGS)

    while not events:
        await asyncio.sleep(0.01)

    dropped = await node.drop_connections()
    assert dropped == 1

    # The client must come back on its own and re-issue its subscriptions.
    await node.wait_for_subscription(timeout=5.0)
    await asyncio.sleep(0.05)
    await node.emit_logs(signature=samples.signature(5), slot=11, logs=samples.PUMPFUN_BUY_LOGS)
    await asyncio.wait_for(task, timeout=5.0)

    assert len(events) == 2
    assert events[1].slot == 11
    assert stream.metrics.reconnects >= 1
    assert node.connections_accepted >= 2
    assert len([r for r in node.subscribe_requests if r["method"] == "logsSubscribe"]) >= 2
    assert ConnectionState.RECONNECTING in [state for state, _ in listener.history]
    await stream.stop()


async def test_survives_several_consecutive_outages(node: FakeSolanaNode) -> None:
    url = await node.start()
    stream, _ = make_stream(url)
    events: list = []

    async def consume() -> None:
        async for event in stream.stream():
            events.append(event)
            if len(events) >= 3:
                return

    task = asyncio.create_task(consume())

    for index, slot in enumerate((20, 21, 22)):
        await node.wait_for_subscription(timeout=5.0)
        await asyncio.sleep(0.05)
        await node.emit_logs(
            signature=samples.signature(100 + index), slot=slot, logs=samples.PUMPFUN_BUY_LOGS
        )
        while len(events) <= index:
            await asyncio.sleep(0.01)
        if index < 2:
            await node.drop_connections()

    await asyncio.wait_for(task, timeout=5.0)
    assert [event.slot for event in events] == [20, 21, 22]
    assert stream.metrics.reconnects >= 2
    await stream.stop()


async def test_recovers_when_the_server_is_down_at_first(node: FakeSolanaNode) -> None:
    """Startup against an endpoint that is not yet listening must not give up."""
    # Reserve a port, then close the server so nothing is listening there.
    url = await node.start()
    await node.stop()

    stream, _ = make_stream(url, reconnect_initial_backoff_seconds=0.05)
    events: list = []

    async def consume() -> None:
        async for event in stream.stream():
            events.append(event)
            return

    task = asyncio.create_task(consume())
    await asyncio.sleep(0.2)
    assert not events
    assert stream.metrics.reconnects >= 1

    restarted = FakeSolanaNode()
    try:
        # Rebind the same port the client keeps retrying.
        import websockets

        port = int(url.rsplit(":", 1)[1])
        restarted._server = await websockets.serve(restarted._handle, "127.0.0.1", port)
        await restarted.wait_for_subscription(timeout=5.0)
        await asyncio.sleep(0.05)
        await restarted.emit_logs(
            signature=samples.signature(6), slot=77, logs=samples.PUMPFUN_BUY_LOGS
        )
        await asyncio.wait_for(task, timeout=5.0)
        assert events[0].slot == 77
    finally:
        await restarted.stop()
        await stream.stop()


# --- staleness and protocol failures -------------------------------------


async def test_silent_connection_is_recycled_as_stale(node: FakeSolanaNode) -> None:
    url = await node.start()
    stream, _ = make_stream(url, ws_stale_after_seconds=0.4, ws_ping_interval_seconds=0.1)

    events: list = []

    async def consume() -> None:
        async for event in stream.stream():
            events.append(event)
            if events:
                return

    task = asyncio.create_task(consume())
    await node.wait_for_subscription()
    # Send nothing at all: the stale window must expire and force a recycle.
    await asyncio.sleep(1.0)
    assert stream.metrics.stale_timeouts >= 1
    assert stream.metrics.reconnects >= 1

    await node.wait_for_subscription(timeout=5.0)
    await asyncio.sleep(0.05)
    await node.emit_logs(signature=samples.signature(7), slot=88, logs=samples.PUMPFUN_BUY_LOGS)
    await asyncio.wait_for(task, timeout=5.0)
    assert events[0].slot == 88
    await stream.stop()


async def test_rejected_subscription_is_fatal_not_a_silent_no_op() -> None:
    """A server that refuses our subscription must not look like a quiet stream."""
    node = FakeSolanaNode(reject_subscriptions=True)
    url = await node.start()
    try:
        stream, _ = make_stream(url)
        with pytest.raises(PermanentProviderError, match="subscription rejected"):
            await collect(stream, 1, timeout=5.0)
        assert stream.metrics.subscribe_failures >= 1
        assert stream.state is ConnectionState.STOPPED
    finally:
        await node.stop()


async def test_unconfirmed_subscription_times_out_and_reconnects() -> None:
    node = FakeSolanaNode(ignore_subscriptions=True)
    url = await node.start()
    try:
        stream, _ = make_stream(url, ws_connect_timeout_seconds=0.2)
        task = asyncio.create_task(collect(stream, 1, timeout=3.0))
        await asyncio.sleep(1.2)
        assert stream.metrics.subscribe_failures >= 1
        assert stream.metrics.reconnects >= 1
        await stream.stop()
        task.cancel()
        with pytest.raises((asyncio.CancelledError, TimeoutError)):
            await task
    finally:
        await node.stop()


async def test_malformed_frames_are_counted_not_crashed(node: FakeSolanaNode) -> None:
    url = await node.start()
    stream, _ = make_stream(url)
    task = asyncio.create_task(collect(stream, 1))
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)

    await node.emit_raw("this is not json")
    await node.emit_raw("[1, 2, 3]")
    await asyncio.sleep(0.05)
    await node.emit_logs(signature=samples.signature(8), slot=99, logs=samples.PUMPFUN_BUY_LOGS)
    events = await task

    assert events[0].slot == 99
    assert stream.metrics.protocol_errors >= 2
    await stream.stop()


async def test_stop_terminates_the_stream(node: FakeSolanaNode) -> None:
    url = await node.start()
    stream, _ = make_stream(url)

    async def consume() -> int:
        count = 0
        async for _ in stream.stream():
            count += 1
        return count

    task = asyncio.create_task(consume())
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)
    await stream.stop()
    await node.drop_connections()
    assert await asyncio.wait_for(task, timeout=5.0) == 0
    assert stream.state is ConnectionState.STOPPED
