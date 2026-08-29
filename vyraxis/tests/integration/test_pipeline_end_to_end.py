"""End-to-end: WebSocket -> normalize -> enrich -> dedup -> PostgreSQL.

Every layer is the production implementation. Only two things are test doubles,
and both are labelled: the Solana node (a real local WebSocket server) and the
HTTP transport used for enrichment (``httpx.MockTransport``). The database is a
real PostgreSQL instance running the project's own schema.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select

from conftest import T0, requires_database
from fixtures import samples
from fixtures.fake_solana_node import FakeSolanaNode
from vyraxis.core.clock import ManualClock
from vyraxis.core.config import Settings
from vyraxis.core.enums import DecodeStatus, EventKind, ObservationKind, ObservationStatus
from vyraxis.scanner.enrichment import TransactionEnricher
from vyraxis.scanner.observations import ObservationScheduler
from vyraxis.scanner.pipeline import IngestionPipeline
from vyraxis.scanner.sink import EventSink
from vyraxis.solana import programs
from vyraxis.solana.rpc import SolanaRpcClient
from vyraxis.solana.subscriptions import logs_subscription, slot_subscription
from vyraxis.solana.websocket import SolanaEventStream
from vyraxis.storage import repositories
from vyraxis.storage.engine import Database
from vyraxis.storage.models import IngestCheckpoint, MarketEvent, Observation, Token, Wallet

pytestmark = [pytest.mark.integration, requires_database]


@pytest_asyncio.fixture
async def node() -> AsyncIterator[FakeSolanaNode]:
    fixture = FakeSolanaNode()
    yield fixture
    await fixture.stop()


def rpc_returning_transactions(settings: Settings) -> SolanaRpcClient:
    """RPC client whose getTransaction answers with a consistent buy."""

    def handler(request: httpx.Request) -> httpx.Response:
        body = request.read().decode()
        import json as _json

        payload = _json.loads(body)
        if payload["method"] != "getTransaction":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": None})
        signature = payload["params"][0]
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "result": samples.buy_transaction(
                    sig=signature, slot=1000, block_time=1_700_000_000
                ),
            },
        )

    return SolanaRpcClient(
        settings.solana, client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )


async def build_pipeline(
    settings: Settings, database: Database, url: str, *, enrich: bool = True
) -> tuple[IngestionPipeline, SolanaEventStream, SolanaRpcClient | None]:
    ws_settings = settings.solana.model_copy(update={"rpc_ws_url": url})
    stream = SolanaEventStream(
        ws_settings,
        [logs_subscription(programs.PUMP_FUN), slot_subscription()],
        clock=ManualClock(T0),
    )
    rpc = rpc_returning_transactions(settings) if enrich else None
    sink = EventSink(
        database,
        ObservationScheduler(settings.observations.horizons_seconds),
        instance_id="test-1",
        clock=ManualClock(T0),
    )
    pipeline = IngestionPipeline(
        stream=stream,
        sink=sink,
        settings=settings.ingestion,
        enricher=TransactionEnricher(rpc) if rpc else None,
        clock=ManualClock(T0),
        flush_interval_seconds=0.05,
    )
    return pipeline, stream, rpc


async def test_events_flow_from_socket_to_database(
    settings: Settings, database: Database, node: FakeSolanaNode
) -> None:
    url = await node.start()
    pipeline, stream, rpc = await build_pipeline(settings, database, url)

    task = asyncio.create_task(pipeline.run(max_events=3))
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)

    for index, logs in enumerate(
        (samples.PUMPFUN_CREATE_LOGS, samples.PUMPFUN_BUY_LOGS, samples.PUMPFUN_BUY_LOGS)
    ):
        await node.emit_logs(signature=samples.signature(index), slot=1000 + index, logs=logs)
        await asyncio.sleep(0.02)

    await asyncio.wait_for(task, timeout=10.0)
    await stream.stop()
    if rpc:
        await rpc.close()

    async with database.session() as session:
        events = (
            (await session.execute(select(MarketEvent).order_by(MarketEvent.slot))).scalars().all()
        )
        tokens = (await session.execute(select(Token))).scalars().all()
        wallets = (await session.execute(select(Wallet))).scalars().all()

    assert len(events) == 3
    assert {event.kind for event in events} == {EventKind.TOKEN_CREATED, EventKind.SWAP}

    # criterion 7: events are associated with a token and an actor wallet.
    assert all(event.token_mint == samples.MEMECOIN_MINT for event in events)
    assert all(event.actor_wallet == samples.TRADER_WALLET for event in events)
    assert all(event.decode_status is DecodeStatus.DECODED for event in events)
    assert [token.mint for token in tokens] == [samples.MEMECOIN_MINT]
    assert [wallet.address for wallet in wallets] == [samples.TRADER_WALLET]

    # criterion 4: normalization retained provenance and the raw payload.
    for event in events:
        assert event.provider == "fixture"
        assert event.stream == f"logs:{programs.PUMP_FUN}"
        assert "logs" in event.raw
        assert event.observed_at is not None
        assert "ENRICHED" in event.reason_codes


async def test_discovery_observations_are_created_once_per_token(
    settings: Settings, database: Database, node: FakeSolanaNode
) -> None:
    url = await node.start()
    pipeline, stream, rpc = await build_pipeline(settings, database, url)

    task = asyncio.create_task(pipeline.run(max_events=3))
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)
    for index in range(3):
        await node.emit_logs(
            signature=samples.signature(index),
            slot=2000 + index,
            logs=samples.PUMPFUN_BUY_LOGS,
        )
        await asyncio.sleep(0.02)
    await asyncio.wait_for(task, timeout=10.0)
    await stream.stop()
    if rpc:
        await rpc.close()

    async with database.session() as session:
        rows = (await session.execute(select(Observation))).scalars().all()

    discoveries = [row for row in rows if row.kind is ObservationKind.DISCOVERY]
    horizons = [row for row in rows if row.kind is ObservationKind.HORIZON]

    # criterion 8: one immutable discovery snapshot, with future horizons queued.
    assert len(discoveries) == 1
    assert discoveries[0].token_mint == samples.MEMECOIN_MINT
    assert discoveries[0].captured_at == discoveries[0].due_at
    assert len(horizons) == len(settings.observations.horizons_seconds)
    assert all(row.status is ObservationStatus.PENDING for row in horizons)
    assert all(row.payload is None for row in horizons)


async def test_duplicate_notifications_are_persisted_once(
    settings: Settings, database: Database, node: FakeSolanaNode
) -> None:
    """The same notification delivered repeatedly must yield one row."""
    url = await node.start()
    pipeline, stream, rpc = await build_pipeline(settings, database, url)

    signature = samples.signature(42)

    async def emit_duplicates() -> None:
        await node.wait_for_subscription()
        await asyncio.sleep(0.05)
        for _ in range(5):
            await node.emit_logs(signature=signature, slot=3000, logs=samples.PUMPFUN_BUY_LOGS)
            await asyncio.sleep(0.01)
        await node.emit_logs(
            signature=samples.signature(43), slot=3001, logs=samples.PUMPFUN_BUY_LOGS
        )

    task = asyncio.create_task(pipeline.run(max_events=2))
    emitter = asyncio.create_task(emit_duplicates())
    await asyncio.wait_for(task, timeout=10.0)
    await emitter
    await stream.stop()
    if rpc:
        await rpc.close()

    async with database.session() as session:
        events = (await session.execute(select(MarketEvent))).scalars().all()

    signatures = [event.signature for event in events]
    assert signatures.count(signature) == 1
    # The in-process cache caught the repeats before they reached the database.
    assert pipeline.stats.dedup_hits >= 4


async def test_events_survive_a_connection_drop(
    settings: Settings, database: Database, node: FakeSolanaNode
) -> None:
    """criterion 2 + 6: reconnect mid-stream and keep persisting."""
    url = await node.start()
    pipeline, stream, rpc = await build_pipeline(settings, database, url)

    task = asyncio.create_task(pipeline.run(max_events=2))
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)
    await node.emit_logs(signature=samples.signature(50), slot=4000, logs=samples.PUMPFUN_BUY_LOGS)
    await asyncio.sleep(0.1)

    await node.drop_connections()
    await node.wait_for_subscription(timeout=5.0)
    await asyncio.sleep(0.05)
    await node.emit_logs(signature=samples.signature(51), slot=4001, logs=samples.PUMPFUN_BUY_LOGS)

    await asyncio.wait_for(task, timeout=10.0)
    await stream.stop()
    if rpc:
        await rpc.close()

    async with database.session() as session:
        events = (
            (await session.execute(select(MarketEvent).order_by(MarketEvent.slot))).scalars().all()
        )
    assert [event.slot for event in events] == [4000, 4001]
    assert stream.metrics.reconnects >= 1


async def test_checkpoint_records_ingest_progress(
    settings: Settings, database: Database, node: FakeSolanaNode
) -> None:
    url = await node.start()
    pipeline, stream, rpc = await build_pipeline(settings, database, url)

    task = asyncio.create_task(pipeline.run(max_events=2))
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)
    await node.emit_logs(signature=samples.signature(60), slot=5000, logs=samples.PUMPFUN_BUY_LOGS)
    await asyncio.sleep(0.02)
    await node.emit_logs(signature=samples.signature(61), slot=5005, logs=samples.PUMPFUN_BUY_LOGS)
    await asyncio.wait_for(task, timeout=10.0)
    await stream.stop()
    if rpc:
        await rpc.close()

    async with database.session() as session:
        checkpoint = (await session.execute(select(IngestCheckpoint))).scalars().all()
    assert len(checkpoint) == 1
    assert checkpoint[0].stream == f"logs:{programs.PUMP_FUN}"
    assert checkpoint[0].last_slot == 5005
    assert checkpoint[0].events_ingested == 2


async def test_unenriched_events_are_stored_as_partial(
    settings: Settings, database: Database, node: FakeSolanaNode
) -> None:
    """Without RPC enrichment the mint is unknown - and the row must say so."""
    url = await node.start()
    pipeline, stream, _ = await build_pipeline(settings, database, url, enrich=False)

    task = asyncio.create_task(pipeline.run(max_events=1))
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)
    await node.emit_logs(signature=samples.signature(70), slot=6000, logs=samples.PUMPFUN_BUY_LOGS)
    await asyncio.wait_for(task, timeout=10.0)
    await stream.stop()

    async with database.session() as session:
        event = (await session.execute(select(MarketEvent))).scalar_one()
        tokens = await repositories.count_rows(session, Token)
        observations = await repositories.count_rows(session, Observation)

    assert event.decode_status is DecodeStatus.PARTIAL
    assert event.token_mint is None
    assert event.base_amount_raw is None
    # No token identified means no token row and no discovery observation -
    # rather than a placeholder token invented to make the pipeline look busy.
    assert tokens == 0
    assert observations == 0


async def test_enrichment_failure_leaves_the_event_recorded(
    settings: Settings, database: Database, node: FakeSolanaNode
) -> None:
    """An RPC outage must degrade detail, not lose the event."""
    url = await node.start()

    def failing_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    rpc = SolanaRpcClient(
        settings.solana,
        client=httpx.AsyncClient(transport=httpx.MockTransport(failing_handler)),
    )
    stream = SolanaEventStream(
        settings.solana.model_copy(update={"rpc_ws_url": url}),
        [logs_subscription(programs.PUMP_FUN), slot_subscription()],
        clock=ManualClock(T0),
    )
    pipeline = IngestionPipeline(
        stream=stream,
        sink=EventSink(
            database,
            ObservationScheduler(settings.observations.horizons_seconds),
            clock=ManualClock(T0),
        ),
        settings=settings.ingestion,
        enricher=TransactionEnricher(rpc),
        clock=ManualClock(T0),
        flush_interval_seconds=0.05,
    )

    task = asyncio.create_task(pipeline.run(max_events=1))
    await node.wait_for_subscription()
    await asyncio.sleep(0.05)
    await node.emit_logs(signature=samples.signature(80), slot=7000, logs=samples.PUMPFUN_BUY_LOGS)
    await asyncio.wait_for(task, timeout=15.0)
    await stream.stop()
    await rpc.close()

    async with database.session() as session:
        event = (await session.execute(select(MarketEvent))).scalar_one()
    assert event.slot == 7000
    assert "ENRICHMENT_RPC_FAILED" in (event.reason_codes or [])
    assert event.decode_status is DecodeStatus.PARTIAL
