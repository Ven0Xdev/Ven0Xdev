"""Provider HTTP resilience: redirects (followed same-domain, refused
cross-domain), typed 401/429/timeout errors, sanitized logging (tokens
never leak), and degraded-mode API responses (503, never 500)."""
import httpx
import pytest
from fastapi.testclient import TestClient

from app.services.data_providers.http_base import (
    ProviderDataUnavailable,
    RateLimitedHttpClient,
    sanitize_url,
)

SECRET = "sekret-token-123"


def make_client(handler) -> RateLimitedHttpClient:
    return RateLimitedHttpClient(
        vendor="Finnhub",
        base_url="https://finnhub.io/api/v1",
        calls_per_minute=100_000,
        cache_ttl_seconds=0.0,
        default_params={"token": SECRET},
        transport=httpx.MockTransport(handler),
    )


def test_sanitize_url_redacts_secrets_and_keeps_the_rest():
    url = f"https://finnhub.io/api/v1/stock/symbol?exchange=US&token={SECRET}"
    cleaned = sanitize_url(url)
    assert SECRET not in cleaned
    assert "token=%2A%2A%2A" in cleaned or "token=***" in cleaned
    assert "exchange=US" in cleaned


def test_successful_response_returns_json():
    client = make_client(lambda req: httpx.Response(200, json={"ok": True}))
    assert client.get_json("/quote", {"symbol": "AAPL"}) == {"ok": True}


def test_same_domain_redirect_is_followed_and_logged_sanitized(caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/stock/symbol":
            return httpx.Response(302, headers={"location": "/api/v1/stock/symbol2?exchange=US"})
        assert request.url.path == "/api/v1/stock/symbol2"
        assert request.url.params.get("token") == SECRET  # auth survives the hop
        return httpx.Response(200, json=[{"symbol": "AXNT"}])

    client = make_client(handler)
    with caplog.at_level("WARNING"):
        payload = client.get_json("/stock/symbol", {"exchange": "US"})
    assert payload == [{"symbol": "AXNT"}]
    assert "redirected" in caplog.text
    assert SECRET not in caplog.text  # sanitized logging


def test_cross_domain_redirect_is_refused_without_leaking_token():
    client = make_client(
        lambda req: httpx.Response(302, headers={"location": f"https://evil.example/login?token={SECRET}"})
    )
    with pytest.raises(ProviderDataUnavailable) as err:
        client.get_json("/stock/symbol")
    assert "unexpected domain" in str(err.value)
    assert SECRET not in str(err.value)


def test_redirect_loop_is_bounded():
    client = make_client(lambda req: httpx.Response(302, headers={"location": "/api/v1/loop"}))
    with pytest.raises(ProviderDataUnavailable) as err:
        client.get_json("/loop")
    assert "redirects" in str(err.value)


def test_invalid_api_key_is_typed():
    client = make_client(lambda req: httpx.Response(401, json={"error": "Invalid API key"}))
    with pytest.raises(ProviderDataUnavailable, match="API key"):
        client.get_json("/quote", {"symbol": "AAPL"})


def test_rate_limit_is_typed():
    client = make_client(lambda req: httpx.Response(429))
    with pytest.raises(ProviderDataUnavailable, match="rate limit"):
        client.get_json("/quote", {"symbol": "AAPL"})


def test_timeout_is_typed():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("connect timed out")

    client = make_client(handler)
    with pytest.raises(ProviderDataUnavailable, match="timed out"):
        client.get_json("/quote", {"symbol": "AAPL"})


# --- degraded-mode API behavior --------------------------------------------

class _DownProvider:
    name = "finnhub"
    data_mode = "delayed"

    def get_universe(self, limit=None):
        raise ProviderDataUnavailable("Finnhub /stock/symbol failed: HTTP 302")


@pytest.fixture()
def degraded_client():
    from app.api.deps import data_provider
    from app.main import app

    app.dependency_overrides[data_provider] = lambda: _DownProvider()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.pop(data_provider, None)


def test_dashboard_degrades_to_structured_503(degraded_client):
    res = degraded_client.get("/api/v1/dashboard/summary")
    assert res.status_code == 503
    detail = res.json()["detail"]
    assert detail["code"] == "provider_unavailable"
    assert detail["market_data_available"] is False
    assert "HTTP 302" in detail["message"]


def test_scanner_heatmap_degrades_to_structured_503(degraded_client):
    res = degraded_client.get("/api/v1/scan/heatmap")
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "provider_unavailable"


def test_provider_health_reports_failure_without_500(degraded_client):
    res = degraded_client.get("/api/v1/providers/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert "HTTP 302" in body["error"]
    assert body["provider"] == "finnhub"


def test_provider_health_ok_with_working_provider():
    from app.main import app

    with TestClient(app) as client:
        res = client.get("/api/v1/providers/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["sample_symbols"]
