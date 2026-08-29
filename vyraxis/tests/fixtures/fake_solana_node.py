"""TEST FIXTURE - a local server speaking the Solana PubSub wire protocol.

This is a **test double**, and it is used only by the test suite. It is not
importable from ``vyraxis`` and no production code path can reach it.

What it is for: exercising the real client against a real TCP WebSocket
connection - real framing, real JSON-RPC request/response correlation, real
disconnects - so that connection handling, subscription confirmation,
reconnection and stale detection are tested as they actually behave, not as a
monkeypatched approximation.

What it is NOT for: producing market data that anyone reports as real. Every
notification it emits is constructed by the test that calls it.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

import websockets
from websockets.asyncio.server import Server, ServerConnection


@dataclass
class FakeSolanaNode:
    """A minimal Solana PubSub endpoint under test control."""

    #: Reject every subscribe request with a JSON-RPC error.
    reject_subscriptions: bool = False
    #: Never answer subscribe requests (exercises confirmation timeout).
    ignore_subscriptions: bool = False
    #: Close the connection after this many notifications have been sent.
    close_after_notifications: int | None = None

    _server: Server | None = field(default=None, init=False)
    _connections: set[ServerConnection] = field(default_factory=set, init=False)
    _next_subscription_id: int = field(default=1, init=False)
    _subscribed: asyncio.Event = field(default_factory=asyncio.Event, init=False)
    _notifications_sent: int = field(default=0, init=False)

    connections_accepted: int = field(default=0, init=False)
    subscribe_requests: list[dict[str, Any]] = field(default_factory=list, init=False)
    #: Subscriptions per live connection. A real node issues fresh ids on each
    #: connection and forgets the old ones, so notifications after a reconnect
    #: must carry the *new* ids - reusing stale ones would make the client look
    #: broken when it is behaving correctly.
    _subs_by_connection: dict[Any, dict[int, str]] = field(default_factory=dict, init=False)

    async def start(self) -> str:
        """Start listening on an ephemeral port; returns the ws:// URL."""
        self._server = await websockets.serve(self._handle, "127.0.0.1", 0)
        sockets = list(self._server.sockets)
        port = sockets[0].getsockname()[1]
        return f"ws://127.0.0.1:{port}"

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None
        self._connections.clear()

    @property
    def active_connections(self) -> int:
        return len(self._connections)

    async def wait_for_subscription(self, timeout: float = 5.0) -> None:
        """Block until a client has completed at least one subscription."""
        await asyncio.wait_for(self._subscribed.wait(), timeout=timeout)

    async def wait_for_connection(self, timeout: float = 5.0) -> None:
        deadline = asyncio.get_running_loop().time() + timeout
        while not self._connections:
            if asyncio.get_running_loop().time() > deadline:
                raise TimeoutError("no client connected")
            await asyncio.sleep(0.01)

    async def drop_connections(self) -> int:
        """Forcibly close every live connection, simulating an outage."""
        dropped = list(self._connections)
        self._subscribed.clear()
        for connection in dropped:
            await connection.close(code=1011, reason="fixture forced disconnect")
            self._subs_by_connection.pop(connection, None)
        self._connections.clear()
        return len(dropped)

    async def emit_logs(
        self,
        *,
        signature: str,
        logs: list[str],
        slot: int,
        err: Any | None = None,
        subscription_id: int | None = None,
    ) -> int:
        """Send a ``logsNotification`` to every connected client."""
        target = subscription_id or self._first_subscription("logsSubscribe")
        message = {
            "jsonrpc": "2.0",
            "method": "logsNotification",
            "params": {
                "result": {
                    "context": {"slot": slot},
                    "value": {"signature": signature, "err": err, "logs": logs},
                },
                "subscription": target,
            },
        }
        return await self._broadcast(message)

    async def emit_slot(self, slot: int) -> int:
        """Send a ``slotNotification`` heartbeat."""
        target = self._first_subscription("slotSubscribe")
        message = {
            "jsonrpc": "2.0",
            "method": "slotNotification",
            "params": {
                "result": {"parent": slot - 1, "root": slot - 32, "slot": slot},
                "subscription": target,
            },
        }
        return await self._broadcast(message)

    async def emit_raw(self, message: dict[str, Any] | str) -> int:
        """Send an arbitrary frame (used to test protocol-error handling)."""
        return await self._broadcast(message)

    # ---- internals ------------------------------------------------------

    @property
    def subscription_methods(self) -> dict[int, str]:
        """Subscriptions across all live connections (inspection helper)."""
        merged: dict[int, str] = {}
        for subs in self._subs_by_connection.values():
            merged.update(subs)
        return merged

    def _first_subscription(self, method: str) -> int:
        for connection in reversed(list(self._connections)):
            for sub_id, sub_method in self._subs_by_connection.get(connection, {}).items():
                if sub_method == method:
                    return sub_id
        return 1

    async def _broadcast(self, message: dict[str, Any] | str) -> int:
        payload = message if isinstance(message, str) else json.dumps(message)
        sent = 0
        for connection in list(self._connections):
            try:
                await connection.send(payload)
                sent += 1
            except websockets.exceptions.WebSocketException:
                self._connections.discard(connection)
        if sent:
            self._notifications_sent += 1
            if (
                self.close_after_notifications is not None
                and self._notifications_sent >= self.close_after_notifications
            ):
                await self.drop_connections()
        return sent

    async def _handle(self, connection: ServerConnection) -> None:
        self._connections.add(connection)
        self._subs_by_connection[connection] = {}
        self.connections_accepted += 1
        try:
            async for message in connection:
                await self._on_message(connection, message)
        except websockets.exceptions.WebSocketException:
            pass
        finally:
            self._connections.discard(connection)
            self._subs_by_connection.pop(connection, None)

    async def _on_message(self, connection: ServerConnection, message: Any) -> None:
        try:
            request = json.loads(message)
        except ValueError:
            return
        method = request.get("method", "")
        request_id = request.get("id")

        if not method.endswith("Subscribe"):
            await connection.send(json.dumps({"jsonrpc": "2.0", "id": request_id, "result": True}))
            return

        self.subscribe_requests.append(request)

        if self.ignore_subscriptions:
            return

        if self.reject_subscriptions:
            await connection.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "error": {"code": -32601, "message": "Method not found"},
                    }
                )
            )
            return

        subscription_id = self._next_subscription_id
        self._next_subscription_id += 1
        self._subs_by_connection.setdefault(connection, {})[subscription_id] = method
        await connection.send(
            json.dumps({"jsonrpc": "2.0", "id": request_id, "result": subscription_id})
        )
        self._subscribed.set()
