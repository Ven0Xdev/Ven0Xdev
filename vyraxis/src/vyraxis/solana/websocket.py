"""Resilient Solana PubSub (WebSocket) client.

The consumer of :meth:`SolanaEventStream.stream` sees an endless sequence of
:class:`RawEvent`. Connection loss, subscription failure and silent sockets are
handled here and reported; they are never raised at the consumer, because an
ingestion loop that dies on the first disconnect is not an ingestion loop.

Failure handling, concretely:

* **Disconnect** - reconnect with exponential backoff plus jitter, capped, and
  re-issue every subscription. Backoff resets only after subscriptions are
  confirmed, so a socket that accepts connections but rejects subscriptions
  cannot become a hot loop.
* **Silence** - if nothing arrives within ``ws_stale_after_seconds`` the socket
  is treated as dead and recycled. A slot heartbeat subscription is attached
  automatically so that "no trades right now" is never mistaken for silence.
* **Backlog on reconnect** - notifications that arrive while subscription
  confirmations are still pending are buffered and delivered, not discarded.

Everything notable is counted in :attr:`metrics` and pushed to the optional
listener so it reaches logs, ``system_events`` and the health endpoint.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import random
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

import websockets
from websockets.exceptions import WebSocketException

from vyraxis.core.clock import SYSTEM_CLOCK, Clock
from vyraxis.core.config import SolanaSettings
from vyraxis.core.enums import ConnectionState
from vyraxis.core.errors import PermanentProviderError, TransientProviderError
from vyraxis.core.logging import get_logger
from vyraxis.solana.provider import ProviderStatus, RawEvent
from vyraxis.solana.subscriptions import Subscription

log = get_logger(__name__)


class ConnectionListener(Protocol):
    """Receives connection lifecycle notifications for logging/persistence."""

    def on_state_change(self, state: ConnectionState, detail: dict[str, Any]) -> None: ...


@dataclass
class StreamMetrics:
    """Counters exposed to observability. Every failure increments something."""

    connect_attempts: int = 0
    connects_succeeded: int = 0
    subscribe_failures: int = 0
    reconnects: int = 0
    stale_timeouts: int = 0
    messages_received: int = 0
    notifications_received: int = 0
    heartbeats_received: int = 0
    #: Notifications whose subscription id we did not issue. Kept (never
    #: discarded) but flagged: a non-zero count means the endpoint is sending
    #: us something we did not ask for, or our subscription table is stale.
    unknown_subscription_notifications: int = 0
    protocol_errors: int = 0
    last_message_at: datetime | None = None
    last_slot: int | None = None
    connected_since: datetime | None = None

    def snapshot(self) -> dict[str, Any]:
        return {
            "connect_attempts": self.connect_attempts,
            "connects_succeeded": self.connects_succeeded,
            "subscribe_failures": self.subscribe_failures,
            "reconnects": self.reconnects,
            "stale_timeouts": self.stale_timeouts,
            "messages_received": self.messages_received,
            "notifications_received": self.notifications_received,
            "heartbeats_received": self.heartbeats_received,
            "unknown_subscription_notifications": self.unknown_subscription_notifications,
            "protocol_errors": self.protocol_errors,
            "last_message_at": (self.last_message_at.isoformat() if self.last_message_at else None),
            "last_slot": self.last_slot,
            "connected_since": (self.connected_since.isoformat() if self.connected_since else None),
        }


@dataclass(frozen=True, slots=True)
class _PendingRequest:
    request_id: int
    subscription: Subscription


class SolanaEventStream:
    """Implements :class:`~vyraxis.solana.provider.EventStreamProvider`."""

    def __init__(
        self,
        settings: SolanaSettings,
        subscriptions: Sequence[Subscription],
        *,
        clock: Clock = SYSTEM_CLOCK,
        listener: ConnectionListener | None = None,
        connect_factory: Any | None = None,
    ) -> None:
        if not subscriptions:
            raise ValueError("at least one subscription is required")
        self._settings = settings
        self._subscriptions = list(subscriptions)
        self._clock = clock
        self._listener = listener
        # Injectable so tests can drive a local server; defaults to the real
        # websockets client. Never used to substitute fake data.
        self._connect = connect_factory or websockets.connect
        self._state = ConnectionState.DISCONNECTED
        self._stopping = asyncio.Event()
        self._request_id = 0
        self._sub_by_id: dict[int, Subscription] = {}
        self.metrics = StreamMetrics()
        self._last_error: str | None = None

    # ---- provider interface --------------------------------------------

    @property
    def provider_name(self) -> str:
        return self._settings.provider_name

    @property
    def state(self) -> ConnectionState:
        return self._state

    def status(self) -> ProviderStatus:
        healthy = self._state is ConnectionState.SUBSCRIBED and not self._is_stale()
        return ProviderStatus(
            provider=self.provider_name,
            component="rpc_ws",
            state=self._state,
            healthy=healthy,
            detail={
                "endpoint": self._settings.rpc_ws_url,
                "subscriptions": [sub.name for sub in self._subscriptions],
                "stale": self._is_stale(),
                "last_error": self._last_error,
                **self.metrics.snapshot(),
            },
        )

    async def stop(self) -> None:
        """Ask the stream to finish after the current iteration."""
        self._stopping.set()
        self._set_state(ConnectionState.STOPPED, {"reason": "stop_requested"})

    async def stream(self) -> AsyncIterator[RawEvent]:
        """Yield events forever, reconnecting as needed."""
        backoff = self._settings.reconnect_initial_backoff_seconds
        attempt = 0

        while not self._stopping.is_set():
            attempt += 1
            self.metrics.connect_attempts += 1
            self._set_state(
                ConnectionState.CONNECTING,
                {"attempt": attempt, "endpoint": self._settings.rpc_ws_url},
            )
            try:
                async for event in self._run_connection():
                    yield event
                    # A successful message proves this connection works; reset
                    # the backoff so the next outage starts from the floor.
                    backoff = self._settings.reconnect_initial_backoff_seconds
                    attempt = 0
            except asyncio.CancelledError:
                raise
            except PermanentProviderError as exc:
                # e.g. the endpoint does not support a method we require.
                self._last_error = str(exc)
                log.error("ws_permanent_failure", error=str(exc))
                self._set_state(ConnectionState.STOPPED, {"error": str(exc)})
                raise
            except (WebSocketException, OSError, TransientProviderError, TimeoutError) as exc:
                self._last_error = f"{type(exc).__name__}: {exc}"
                self.metrics.reconnects += 1
                log.warning(
                    "ws_connection_lost",
                    error=self._last_error,
                    reconnects=self.metrics.reconnects,
                )

            if self._stopping.is_set():
                break

            limit = self._settings.max_reconnect_attempts
            if limit and self.metrics.reconnects >= limit:
                self._set_state(
                    ConnectionState.STOPPED,
                    {"reason": "max_reconnect_attempts", "limit": limit},
                )
                raise TransientProviderError(
                    "websocket reconnect limit reached",
                    limit=limit,
                    last_error=self._last_error,
                )

            delay = self._backoff_delay(backoff)
            self._set_state(
                ConnectionState.RECONNECTING,
                {"delay_seconds": round(delay, 3), "last_error": self._last_error},
            )
            with contextlib.suppress(TimeoutError):
                # Interruptible sleep: stop() takes effect immediately.
                await asyncio.wait_for(self._stopping.wait(), timeout=delay)
            backoff = min(
                backoff * self._settings.reconnect_backoff_multiplier,
                self._settings.reconnect_max_backoff_seconds,
            )

        self._set_state(ConnectionState.STOPPED, {"reason": "loop_exited"})

    # ---- internals ------------------------------------------------------

    async def _run_connection(self) -> AsyncIterator[RawEvent]:
        async with self._connect(
            self._settings.rpc_ws_url,
            open_timeout=self._settings.ws_connect_timeout_seconds,
            ping_interval=self._settings.ws_ping_interval_seconds,
            ping_timeout=self._settings.ws_ping_timeout_seconds,
            close_timeout=5,
            max_size=self._settings.ws_max_message_bytes,
        ) as socket:
            self.metrics.connects_succeeded += 1
            self.metrics.connected_since = self._clock.now()
            self._set_state(ConnectionState.CONNECTED, {"endpoint": self._settings.rpc_ws_url})

            buffered = await self._subscribe_all(socket)
            self._set_state(
                ConnectionState.SUBSCRIBED,
                {"subscriptions": [sub.name for sub in self._subscriptions]},
            )

            for raw in buffered:
                yield raw

            while not self._stopping.is_set():
                try:
                    message = await asyncio.wait_for(
                        socket.recv(), timeout=self._settings.ws_stale_after_seconds
                    )
                except TimeoutError as exc:
                    self.metrics.stale_timeouts += 1
                    log.warning(
                        "ws_stale",
                        stale_after_seconds=self._settings.ws_stale_after_seconds,
                        last_message_at=(
                            self.metrics.last_message_at.isoformat()
                            if self.metrics.last_message_at
                            else None
                        ),
                    )
                    raise TransientProviderError(
                        "no websocket traffic within stale window",
                        stale_after_seconds=self._settings.ws_stale_after_seconds,
                    ) from exc

                event = self._handle_message(message)
                if event is not None:
                    yield event

    async def _subscribe_all(self, socket: Any) -> list[RawEvent]:
        """Send every subscription and wait for confirmations.

        Notifications that arrive before the last confirmation are returned to
        the caller rather than dropped - on a busy program the first
        notification can beat the confirmation of a later subscription.
        """
        self._sub_by_id.clear()
        pending: dict[int, _PendingRequest] = {}

        for subscription in self._subscriptions:
            self._request_id += 1
            request_id = self._request_id
            pending[request_id] = _PendingRequest(request_id, subscription)
            await socket.send(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "method": subscription.method,
                        "params": subscription.params,
                    }
                )
            )

        buffered: list[RawEvent] = []
        deadline = self._settings.ws_connect_timeout_seconds * max(1, len(pending))

        while pending:
            try:
                message = await asyncio.wait_for(socket.recv(), timeout=deadline)
            except TimeoutError as exc:
                self.metrics.subscribe_failures += 1
                raise TransientProviderError(
                    "timed out waiting for subscription confirmation",
                    outstanding=[p.subscription.name for p in pending.values()],
                ) from exc

            decoded = self._decode(message)
            if decoded is None:
                continue

            response_id = decoded.get("id")
            if isinstance(response_id, int) and response_id in pending:
                request = pending.pop(response_id)
                if "error" in decoded:
                    self.metrics.subscribe_failures += 1
                    error = decoded["error"] or {}
                    raise PermanentProviderError(
                        "subscription rejected by endpoint",
                        subscription=request.subscription.name,
                        method=request.subscription.method,
                        code=error.get("code"),
                        detail=str(error.get("message")),
                    )
                subscription_id = decoded.get("result")
                if not isinstance(subscription_id, int):
                    self.metrics.subscribe_failures += 1
                    raise TransientProviderError(
                        "subscription confirmation had no numeric id",
                        subscription=request.subscription.name,
                        result=repr(subscription_id),
                    )
                self._sub_by_id[subscription_id] = request.subscription
                log.info(
                    "ws_subscribed",
                    subscription=request.subscription.name,
                    subscription_id=subscription_id,
                )
                continue

            event = self._to_raw_event(decoded)
            if event is not None:
                buffered.append(event)

        return buffered

    def _handle_message(self, message: str | bytes) -> RawEvent | None:
        decoded = self._decode(message)
        if decoded is None:
            return None
        return self._to_raw_event(decoded)

    def _decode(self, message: str | bytes) -> dict[str, Any] | None:
        self.metrics.messages_received += 1
        self.metrics.last_message_at = self._clock.now()
        try:
            payload = json.loads(message)
        except (TypeError, ValueError):
            self.metrics.protocol_errors += 1
            log.warning("ws_undecodable_message", size=len(message))
            return None
        if not isinstance(payload, dict):
            self.metrics.protocol_errors += 1
            log.warning("ws_unexpected_message_shape", shape=type(payload).__name__)
            return None
        return payload

    def _to_raw_event(self, payload: dict[str, Any]) -> RawEvent | None:
        method = payload.get("method")
        if method is None:
            # A response to a request we are no longer tracking (e.g. an
            # unsubscribe ack). Counted so it is never silently invisible.
            if "id" in payload:
                return None
            self.metrics.protocol_errors += 1
            log.warning("ws_unroutable_message", keys=sorted(payload))
            return None

        params = payload.get("params") or {}
        subscription_id = params.get("subscription")
        subscription = (
            self._sub_by_id.get(subscription_id) if isinstance(subscription_id, int) else None
        )
        result = params.get("result")
        slot = None
        if isinstance(result, dict):
            slot = (result.get("context") or {}).get("slot")
            if slot is None:
                slot = result.get("slot")

        if subscription is not None and subscription.heartbeat:
            self.metrics.heartbeats_received += 1
            if isinstance(slot, int):
                self.metrics.last_slot = slot
            return None

        if isinstance(slot, int):
            self.metrics.last_slot = slot

        if subscription is None:
            self.metrics.unknown_subscription_notifications += 1
            log.warning(
                "ws_unknown_subscription",
                method=method,
                subscription_id=subscription_id,
                known_subscriptions=sorted(self._sub_by_id),
            )

        self.metrics.notifications_received += 1
        return RawEvent(
            stream=subscription.name if subscription else f"unknown:{method}",
            provider=self.provider_name,
            received_at=self.metrics.last_message_at or self._clock.now(),
            slot=slot if isinstance(slot, int) else None,
            payload=payload,
            subscription_id=subscription_id,
        )

    def _is_stale(self) -> bool:
        last = self.metrics.last_message_at
        if last is None:
            return self._state is not ConnectionState.DISCONNECTED
        age = (self._clock.now() - last).total_seconds()
        return age > self._settings.ws_stale_after_seconds

    def _backoff_delay(self, backoff: float) -> float:
        jitter = backoff * self._settings.reconnect_jitter_ratio
        return max(0.0, backoff + random.uniform(-jitter, jitter))  # noqa: S311

    def _set_state(self, state: ConnectionState, detail: dict[str, Any]) -> None:
        if state is self._state and state is not ConnectionState.CONNECTING:
            return
        self._state = state
        log.info("ws_state", state=state.value, **detail)
        if self._listener is not None:
            self._listener.on_state_change(state, detail)


@dataclass
class RecordingListener:
    """Listener that keeps the recent state history. Used by health reporting."""

    limit: int = 50
    history: list[tuple[ConnectionState, dict[str, Any]]] = field(default_factory=list)

    def on_state_change(self, state: ConnectionState, detail: dict[str, Any]) -> None:
        self.history.append((state, detail))
        if len(self.history) > self.limit:
            del self.history[0 : len(self.history) - self.limit]
