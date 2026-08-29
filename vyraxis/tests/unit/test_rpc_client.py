"""RPC client retry, rate-limit and error-classification behaviour.

Requests go through ``httpx.MockTransport``, so the real client code builds the
request, parses the response and drives the retry loop; only the socket is
replaced.
"""

from __future__ import annotations

import httpx
import pytest

from vyraxis.core.config import SolanaSettings
from vyraxis.core.errors import PermanentProviderError, RateLimitError, TransientProviderError
from vyraxis.solana.rpc import SolanaRpcClient

SETTINGS = SolanaSettings(
    rpc_http_url="http://rpc.test",
    provider_name="fixture",
    request_timeout_seconds=1.0,
    max_request_attempts=3,
    reconnect_initial_backoff_seconds=0.001,
    reconnect_max_backoff_seconds=0.002,
    reconnect_jitter_ratio=0.0,
)


def client_with(handler) -> SolanaRpcClient:
    transport = httpx.MockTransport(handler)
    return SolanaRpcClient(SETTINGS, client=httpx.AsyncClient(transport=transport))


async def test_successful_call_returns_result() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": 12345})

    rpc = client_with(handler)
    assert await rpc.get_slot() == 12345
    assert rpc.last_latency_ms is not None
    await rpc.close()


async def test_transient_status_is_retried_then_succeeds() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": "ok"})

    rpc = client_with(handler)
    assert await rpc.get_health() == "ok"
    assert calls["n"] == 3
    await rpc.close()


async def test_rate_limit_is_surfaced_after_exhausting_attempts() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"retry-after": "0.001"})

    rpc = client_with(handler)
    with pytest.raises(RateLimitError) as excinfo:
        await rpc.get_slot()
    assert excinfo.value.retry_after_seconds == 0.001
    await rpc.close()


async def test_client_error_is_not_retried() -> None:
    """Retrying a malformed request only multiplies the rate-limit damage."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, text="bad request")

    rpc = client_with(handler)
    with pytest.raises(PermanentProviderError):
        await rpc.get_slot()
    assert calls["n"] == 1
    await rpc.close()


async def test_node_behind_error_code_is_retryable() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32005, "message": "behind"}},
            )
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": 7})

    rpc = client_with(handler)
    assert await rpc.get_slot() == 7
    assert calls["n"] == 2
    await rpc.close()


async def test_unknown_rpc_error_is_permanent() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "no method"}},
        )

    rpc = client_with(handler)
    with pytest.raises(PermanentProviderError, match="rpc reported an error"):
        await rpc.call("nonsenseMethod")
    await rpc.close()


async def test_non_json_response_is_transient() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>gateway</html>")

    rpc = client_with(handler)
    with pytest.raises(TransientProviderError, match="not valid json"):
        await rpc.get_slot()
    await rpc.close()


async def test_missing_account_returns_none_not_an_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"jsonrpc": "2.0", "id": 1, "result": {"context": {"slot": 5}, "value": None}},
        )

    rpc = client_with(handler)
    assert await rpc.get_account_info("So11111111111111111111111111111111111111112") is None
    await rpc.close()


async def test_account_info_decodes_base64_data() -> None:
    import base64

    from vyraxis.solana.accounts import encode_mint_account

    raw = encode_mint_account(
        mint_authority=None,
        supply_raw=42,
        decimals=6,
        is_initialized=True,
        freeze_authority=None,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "result": {
                    "context": {"slot": 5},
                    "value": {
                        "lamports": 1,
                        "owner": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                        "executable": False,
                        "rentEpoch": 0,
                        "data": [base64.b64encode(raw).decode(), "base64"],
                    },
                },
            },
        )

    rpc = client_with(handler)
    state = await rpc.get_mint_state("So11111111111111111111111111111111111111112")
    assert state is not None
    assert state.supply_raw == 42
    assert state.decimals == 6
    assert state.slot == 5
    await rpc.close()


async def test_status_reports_consecutive_failures() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    rpc = client_with(handler)
    with pytest.raises(TransientProviderError):
        await rpc.get_slot()
    status = rpc.status()
    assert status.healthy is False
    assert status.detail["consecutive_failures"] >= 1
    await rpc.close()
