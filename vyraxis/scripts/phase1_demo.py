"""DEVELOPMENT DEMONSTRATION - Phase 1 data engine, end to end.

Runs the real ingestion pipeline against the **test fixture** Solana node in
``tests/fixtures/fake_solana_node.py`` and prints the resulting database rows.

This exists so the Phase 1 acceptance criteria can be observed directly rather
than only inferred from test names. It is not a production entry point, and the
market data it prints is constructed by the fixture - it is NOT real mainnet
activity. For real ingestion use ``vyraxis ingest run`` against a real endpoint.

Usage:
    VYRAXIS_DATABASE__URL=postgresql+asyncpg://... python scripts/phase1_demo.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tests"))

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402

from fixtures import samples  # noqa: E402
from fixtures.fake_solana_node import FakeSolanaNode  # noqa: E402
from vyraxis.app import _SystemEventListener  # noqa: E402
from vyraxis.core.config import get_settings  # noqa: E402
from vyraxis.core.clock import SYSTEM_CLOCK  # noqa: E402
from vyraxis.core.logging import configure_logging  # noqa: E402
from vyraxis.scanner.enrichment import TransactionEnricher  # noqa: E402
from vyraxis.scanner.normalizer import LogNotificationNormalizer  # noqa: E402
from vyraxis.scanner.observations import ObservationScheduler  # noqa: E402
from vyraxis.scanner.pipeline import IngestionPipeline  # noqa: E402
from vyraxis.scanner.sink import EventSink  # noqa: E402
from vyraxis.solana import programs  # noqa: E402
from vyraxis.solana.rpc import SolanaRpcClient  # noqa: E402
from vyraxis.solana.subscriptions import logs_subscription, slot_subscription  # noqa: E402
from vyraxis.solana.websocket import SolanaEventStream  # noqa: E402
from vyraxis.storage.engine import Database  # noqa: E402
from vyraxis.storage.models import (  # noqa: E402
    IngestCheckpoint,
    MarketEvent,
    Observation,
    SystemEvent,
    Token,
    Wallet,
)


def fixture_rpc(settings) -> SolanaRpcClient:
    """RPC whose getTransaction answers from the fixture sample."""

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.read().decode())
        if payload["method"] != "getTransaction":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": None})
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "result": samples.buy_transaction(
                    sig=payload["params"][0], slot=1000, block_time=1_700_000_000
                ),
            },
        )

    return SolanaRpcClient(
        settings.solana, client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )


async def main() -> None:
    settings = get_settings()
    configure_logging(level="INFO", fmt="console", service_name="vyraxis-demo")

    node = FakeSolanaNode()
    url = await node.start()
    print(f"\n[fixture] Solana test node listening on {url}\n")

    database = Database(settings.database)
    rpc = fixture_rpc(settings)
    listener = _SystemEventListener(database, settings.app.instance_id, SYSTEM_CLOCK)
    stream = SolanaEventStream(
        settings.solana.model_copy(update={"rpc_ws_url": url, "provider_name": "fixture-node"}),
        [logs_subscription(programs.PUMP_FUN), slot_subscription()],
        listener=listener,
    )
    pipeline = IngestionPipeline(
        stream=stream,
        sink=EventSink(database, ObservationScheduler(settings.observations.horizons_seconds)),
        settings=settings.ingestion,
        normalizer=LogNotificationNormalizer(),
        enricher=TransactionEnricher(rpc),
        flush_interval_seconds=0.1,
    )

    async def drive() -> None:
        await node.wait_for_subscription()
        await asyncio.sleep(0.1)

        print("[fixture] emitting token creation")
        await node.emit_logs(
            signature=samples.signature(1), slot=1000, logs=samples.PUMPFUN_CREATE_LOGS
        )
        await asyncio.sleep(0.15)

        print("[fixture] emitting slot heartbeats (must not become events)")
        for slot in range(1001, 1004):
            await node.emit_slot(slot)
        await asyncio.sleep(0.1)

        print("[fixture] emitting a buy, then the SAME buy twice more (dedup)")
        for _ in range(3):
            await node.emit_logs(
                signature=samples.signature(2), slot=1004, logs=samples.PUMPFUN_BUY_LOGS
            )
            await asyncio.sleep(0.05)

        print("[fixture] FORCING A CONNECTION DROP")
        await node.drop_connections()
        await node.wait_for_subscription(timeout=10.0)
        print("[fixture] client reconnected and resubscribed on its own")
        await asyncio.sleep(0.1)

        print("[fixture] emitting a buy after the outage")
        await node.emit_logs(
            signature=samples.signature(3), slot=1005, logs=samples.PUMPFUN_BUY_LOGS
        )

    driver = asyncio.create_task(drive())
    await pipeline.run(max_events=3)
    await driver
    await stream.stop()
    await listener.drain()
    await rpc.close()
    await node.stop()

    print("\n" + "=" * 78)
    print("DATABASE CONTENTS AFTER RUN")
    print("=" * 78)

    async with database.session() as session:
        tokens = (await session.execute(select(Token))).scalars().all()
        wallets = (await session.execute(select(Wallet))).scalars().all()
        events = (
            (await session.execute(select(MarketEvent).order_by(MarketEvent.slot)))
            .scalars()
            .all()
        )
        observations = (
            (await session.execute(select(Observation).order_by(Observation.id)))
            .scalars()
            .all()
        )
        checkpoints = (await session.execute(select(IngestCheckpoint))).scalars().all()
        system_events = (
            (await session.execute(select(SystemEvent).order_by(SystemEvent.id)))
            .scalars()
            .all()
        )

        print(f"\ntokens ({len(tokens)}):")
        for token in tokens:
            print(
                f"  mint={token.mint[:12]}... first_seen={token.first_seen_at.isoformat()} "
                f"slot={token.first_seen_slot} events={token.event_count} "
                f"source={token.discovery_source[:24]}"
            )

        print(f"\nwallets ({len(wallets)}):")
        for wallet in wallets:
            print(f"  {wallet.address[:12]}... events={wallet.event_count}")

        print(f"\nmarket_events ({len(events)}):")
        for event in events:
            print(
                f"  slot={event.slot} kind={event.kind.value:<14} "
                f"decode={event.decode_status.value:<8} dir={str(event.direction):<14} "
                f"base={event.base_amount_raw} quote={event.quote_amount_raw}"
            )
            print(
                f"      mint={str(event.token_mint)[:12]}... "
                f"wallet={str(event.actor_wallet)[:12]}... "
                f"observed_at={event.observed_at.isoformat()} "
                f"block_time={event.block_time.isoformat() if event.block_time else None}"
            )
            print(f"      dedup_key={event.dedup_key[:52]}...")
            print(f"      reasons={event.reason_codes}")

        print(f"\nobservations ({len(observations)}):")
        for observation in observations:
            print(
                f"  {observation.kind.value:<9} {observation.status.value:<8} "
                f"horizon={str(observation.horizon_seconds):<6} "
                f"due_at={observation.due_at.isoformat()} "
                f"captured_at={observation.captured_at.isoformat() if observation.captured_at else None} "
                f"payload={'set' if observation.payload else 'EMPTY'}"
            )

        print(f"\ningest_checkpoints ({len(checkpoints)}):")
        for checkpoint in checkpoints:
            print(
                f"  stream={checkpoint.stream[:34]} last_slot={checkpoint.last_slot} "
                f"events={checkpoint.events_ingested}"
            )

        print(f"\nsystem_events ({len(system_events)}):")
        for entry in system_events:
            print(f"  {entry.level.value:<8} {entry.category:<12} {entry.event}")

    print("\n" + "=" * 78)
    print("PIPELINE COUNTERS")
    print("=" * 78)
    print(json.dumps(pipeline.snapshot(), indent=2, default=str))

    await database.dispose()


if __name__ == "__main__":
    asyncio.run(main())
