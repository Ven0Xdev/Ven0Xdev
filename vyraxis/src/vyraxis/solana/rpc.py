"""Solana JSON-RPC over HTTP.

Retry policy: only *transient* conditions are retried (timeouts, connection
errors, 5xx, 429 and the node's own "please retry" errors). A malformed request
or an unsupported method fails immediately - retrying it just multiplies the
rate-limit damage.
"""

from __future__ import annotations

import asyncio
import random
import time
from collections.abc import Sequence
from datetime import UTC, datetime
from itertools import count
from typing import Any

import httpx

from vyraxis.core.clock import SYSTEM_CLOCK, Clock, from_unix_seconds
from vyraxis.core.config import SolanaSettings
from vyraxis.core.enums import ConnectionState
from vyraxis.core.errors import (
    PermanentProviderError,
    RateLimitError,
    TransientProviderError,
)
from vyraxis.core.logging import get_logger
from vyraxis.solana.accounts import decode_account_data, decode_mint_account
from vyraxis.solana.provider import AccountInfo, MintState, ProviderStatus

log = get_logger(__name__)

#: JSON-RPC error codes that a retry can plausibly fix. -32005 is the node's
#: standard "node is behind / too many requests" family.
_RETRYABLE_RPC_CODES = frozenset({-32005, -32004, -32002})
_RETRYABLE_HTTP_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})


class SolanaRpcClient:
    """Async JSON-RPC client implementing :class:`RpcProvider`."""

    def __init__(
        self,
        settings: SolanaSettings,
        *,
        clock: Clock = SYSTEM_CLOCK,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._clock = clock
        self._ids = count(1)
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(settings.request_timeout_seconds),
            headers={"content-type": "application/json"},
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        self._last_latency_ms: float | None = None
        self._last_error: str | None = None
        self._consecutive_failures = 0

    @property
    def provider_name(self) -> str:
        return self._settings.provider_name

    @property
    def last_latency_ms(self) -> float | None:
        return self._last_latency_ms

    def status(self) -> ProviderStatus:
        healthy = self._consecutive_failures == 0
        return ProviderStatus(
            provider=self.provider_name,
            component="rpc_http",
            state=ConnectionState.CONNECTED if healthy else ConnectionState.DISCONNECTED,
            healthy=healthy,
            detail={
                "endpoint": self._settings.rpc_http_url,
                "last_latency_ms": self._last_latency_ms,
                "consecutive_failures": self._consecutive_failures,
                "last_error": self._last_error,
            },
        )

    async def call(self, method: str, params: list[Any] | None = None) -> Any:
        """Issue a JSON-RPC call with bounded retries and exponential backoff."""
        body = {
            "jsonrpc": "2.0",
            "id": next(self._ids),
            "method": method,
            "params": params or [],
        }
        attempts = self._settings.max_request_attempts
        last_exc: Exception | None = None

        for attempt in range(1, attempts + 1):
            started = time.perf_counter()
            try:
                response = await self._client.post(self._settings.rpc_http_url, json=body)
                self._last_latency_ms = (time.perf_counter() - started) * 1000.0
                result = self._parse_response(method, response)
                self._consecutive_failures = 0
                self._last_error = None
                return result
            except (RateLimitError, TransientProviderError) as exc:
                last_exc = exc
                self._consecutive_failures += 1
                self._last_error = str(exc)
                if attempt == attempts:
                    break
                delay = self._retry_delay(attempt, exc)
                log.warning(
                    "rpc_retry",
                    method=method,
                    attempt=attempt,
                    max_attempts=attempts,
                    delay_seconds=round(delay, 3),
                    error=str(exc),
                )
                await asyncio.sleep(delay)
            except httpx.HTTPError as exc:
                last_exc = TransientProviderError(
                    "http transport failure", method=method, error=str(exc)
                )
                self._consecutive_failures += 1
                self._last_error = str(exc)
                if attempt == attempts:
                    break
                await asyncio.sleep(self._retry_delay(attempt, None))

        assert last_exc is not None
        log.error("rpc_failed", method=method, attempts=attempts, error=str(last_exc))
        raise last_exc

    def _parse_response(self, method: str, response: httpx.Response) -> Any:
        if response.status_code in _RETRYABLE_HTTP_STATUS:
            retry_after = _parse_retry_after(response.headers.get("retry-after"))
            if response.status_code == 429:
                raise RateLimitError(
                    "rpc rate limited",
                    retry_after_seconds=retry_after,
                    method=method,
                    status=response.status_code,
                )
            raise TransientProviderError(
                "rpc returned a retryable status",
                method=method,
                status=response.status_code,
            )
        if response.status_code >= 400:
            raise PermanentProviderError(
                "rpc returned a non-retryable status",
                method=method,
                status=response.status_code,
                body=response.text[:400],
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise TransientProviderError(
                "rpc response was not valid json", method=method, error=str(exc)
            ) from exc

        if isinstance(payload, dict) and "error" in payload:
            error = payload["error"] or {}
            code = error.get("code")
            message = str(error.get("message", "unknown rpc error"))
            if code in _RETRYABLE_RPC_CODES:
                raise TransientProviderError(
                    "rpc reported a retryable error", method=method, code=code, detail=message
                )
            raise PermanentProviderError(
                "rpc reported an error", method=method, code=code, detail=message
            )
        if not isinstance(payload, dict) or "result" not in payload:
            raise PermanentProviderError(
                "rpc response missing result", method=method, keys=sorted(payload or {})
            )
        return payload["result"]

    def _retry_delay(self, attempt: int, exc: Exception | None) -> float:
        if isinstance(exc, RateLimitError) and exc.retry_after_seconds:
            return min(exc.retry_after_seconds, self._settings.reconnect_max_backoff_seconds)
        base = self._settings.reconnect_initial_backoff_seconds * (
            self._settings.reconnect_backoff_multiplier ** (attempt - 1)
        )
        capped = min(base, self._settings.reconnect_max_backoff_seconds)
        jitter = capped * self._settings.reconnect_jitter_ratio
        return max(0.0, capped + random.uniform(-jitter, jitter))  # noqa: S311

    # ---- typed convenience wrappers -------------------------------------

    async def get_health(self) -> str:
        return str(await self.call("getHealth"))

    async def get_slot(self) -> int:
        return int(await self.call("getSlot", [{"commitment": self._settings.commitment}]))

    async def get_block_time(self, slot: int) -> datetime | None:
        result = await self.call("getBlockTime", [slot])
        if result is None:
            return None
        return from_unix_seconds(int(result))

    async def get_account_info(self, address: str) -> AccountInfo | None:
        result = await self.call(
            "getAccountInfo",
            [address, {"encoding": "base64", "commitment": self._settings.commitment}],
        )
        return _account_from_result(address, result)

    async def get_multiple_accounts(self, addresses: Sequence[str]) -> list[AccountInfo | None]:
        if not addresses:
            return []
        result = await self.call(
            "getMultipleAccounts",
            [
                list(addresses),
                {"encoding": "base64", "commitment": self._settings.commitment},
            ],
        )
        slot = (result or {}).get("context", {}).get("slot")
        values = (result or {}).get("value") or []
        return [
            _account_from_value(address, value, slot)
            for address, value in zip(addresses, values, strict=False)
        ]

    async def get_mint_state(self, mint: str) -> MintState | None:
        account = await self.get_account_info(mint)
        if account is None:
            return None
        return decode_mint_account(account, read_at=self._clock.now(), mint=mint)

    async def get_transaction(self, signature: str) -> dict[str, Any] | None:
        result = await self.call(
            "getTransaction",
            [
                signature,
                {
                    "encoding": "jsonParsed",
                    "commitment": self._settings.commitment,
                    "maxSupportedTransactionVersion": 0,
                },
            ],
        )
        return result if isinstance(result, dict) else None

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()


def _account_from_result(address: str, result: Any) -> AccountInfo | None:
    if not isinstance(result, dict):
        return None
    slot = (result.get("context") or {}).get("slot")
    return _account_from_value(address, result.get("value"), slot)


def _account_from_value(address: str, value: Any, slot: int | None) -> AccountInfo | None:
    if not isinstance(value, dict):
        return None
    return AccountInfo(
        address=address,
        lamports=int(value.get("lamports", 0)),
        owner=str(value.get("owner", "")),
        executable=bool(value.get("executable", False)),
        rent_epoch=_maybe_int(value.get("rentEpoch")),
        data=decode_account_data(value.get("data")),
        slot=slot,
    )


def _maybe_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        try:
            parsed = datetime.strptime(value, "%a, %d %b %Y %H:%M:%S %Z").replace(tzinfo=UTC)
        except ValueError:
            return None
        return max(0.0, (parsed - datetime.now(UTC)).total_seconds())
