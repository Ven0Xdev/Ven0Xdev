"""Shared plumbing for HTTP-backed market data providers.

Every real vendor adapter needs the same three disciplines (architecture §8):
rate budgeting under the vendor quota, per-fact TTL caching, and typed
failures. They live here once so a new provider is only its field mapping —
no duplicated infrastructure.
"""
from __future__ import annotations

import logging
import threading
import time

import httpx

logger = logging.getLogger(__name__)

# Query parameters that must never appear in logs or error messages.
_SECRET_PARAMS = {"token", "apikey", "api_key", "apiKey", "key"}

_MAX_REDIRECTS = 3


def sanitize_url(url: str | httpx.URL) -> str:
    """Redact credential-bearing query parameters so URLs are log-safe."""
    u = httpx.URL(url)
    params = httpx.QueryParams(
        [(k, "***" if k in _SECRET_PARAMS else v) for k, v in u.params.multi_items()]
    )
    return str(u.copy_with(query=str(params).encode() or None))


class ProviderDataUnavailable(RuntimeError):
    """The vendor cannot supply the requested data (plan gap, rate limit,
    unknown symbol, outage). Always message-rich — callers see the cause,
    never a silent empty result.
    """


class TokenBucket:
    def __init__(self, calls_per_minute: int):
        self.capacity = calls_per_minute
        self.tokens = float(calls_per_minute)
        self.fill_rate = calls_per_minute / 60.0
        self.last = time.monotonic()
        self.lock = threading.Lock()

    def acquire(self) -> None:
        while True:
            with self.lock:
                now = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.fill_rate)
                self.last = now
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
                wait = (1 - self.tokens) / self.fill_rate
            time.sleep(wait)


class TTLCache:
    def __init__(self, ttl_seconds: float):
        self.ttl = ttl_seconds
        self.store: dict = {}
        self.lock = threading.Lock()

    def get(self, key):
        with self.lock:
            hit = self.store.get(key)
            if hit and time.monotonic() - hit[0] < self.ttl:
                return hit[1]
        return None

    def put(self, key, value):
        with self.lock:
            self.store[key] = (time.monotonic(), value)


class RateLimitedHttpClient:
    """httpx wrapper enforcing the three adapter disciplines."""

    def __init__(
        self,
        vendor: str,
        base_url: str,
        calls_per_minute: int,
        cache_ttl_seconds: float,
        default_params: dict | None = None,
        headers: dict | None = None,
        timeout: float = 20.0,
        transport: httpx.BaseTransport | None = None,
    ):
        self.vendor = vendor
        self.timeout = timeout
        self._base_host = httpx.URL(base_url).host
        self._client = httpx.Client(
            base_url=base_url,
            params=default_params or {},
            headers=headers or {},
            timeout=timeout,
            transport=transport,
            # Redirects are followed manually in get_json so each hop can be
            # domain-validated and logged (sanitized) — never blindly.
            follow_redirects=False,
        )
        self._bucket = TokenBucket(calls_per_minute)
        self._cache = TTLCache(cache_ttl_seconds)

    def _request(self, path_or_url: str, params: dict | None) -> httpx.Response:
        """One GET plus a bounded, domain-validated redirect chase.

        Legitimate vendor redirects (http→https upgrades, path moves) are
        followed up to _MAX_REDIRECTS as long as they stay on the vendor's
        host. A redirect to any other domain (captive portal, proxy login,
        API relocation) is surfaced as a typed error with the sanitized
        destination — that Location header is the root-cause evidence.
        """
        response = self._client.get(path_or_url, params=params or {})
        hops = 0
        while response.is_redirect:
            location = response.headers.get("location", "")
            target = response.url.join(location)
            logger.warning(
                "%s %s redirected (HTTP %d) to %s",
                self.vendor, sanitize_url(response.url), response.status_code, sanitize_url(target),
            )
            if target.host != self._base_host:
                raise ProviderDataUnavailable(
                    f"{self.vendor} redirected to an unexpected domain "
                    f"({sanitize_url(target)}) — refusing to follow. This usually means a "
                    f"proxy/captive portal intercepted the request or the vendor API moved."
                )
            hops += 1
            if hops > _MAX_REDIRECTS:
                raise ProviderDataUnavailable(
                    f"{self.vendor} exceeded {_MAX_REDIRECTS} redirects for {sanitize_url(target)}."
                )
            # client-level default params (incl. auth token) are re-merged by
            # httpx on every request, so the follow-up stays authenticated.
            response = self._client.get(str(target))
        return response

    def get_json(self, path: str, params: dict | None = None, cache_key: tuple | None = None):
        payload, _from_cache = self.get_json_cached(path, params, cache_key)
        return payload

    def get_json_cached(
        self, path: str, params: dict | None = None, cache_key: tuple | None = None
    ) -> tuple:
        """Same as get_json but also reports whether the result was served
        from the TTL cache — callers use this to surface an honest "cached"
        vs "live/delayed" data_mode instead of always claiming a fresh call.
        """
        from app.services.monitoring import counters

        if cache_key is not None:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached, True

        self._bucket.acquire()
        counters.increment("provider.calls")
        try:
            response = self._request(path, params)
        except ProviderDataUnavailable:
            counters.increment("provider.failures")
            counters.increment(f"provider.failures.{self.vendor}")
            raise
        except httpx.TimeoutException:
            counters.increment("provider.failures")
            counters.increment(f"provider.failures.{self.vendor}")
            raise ProviderDataUnavailable(
                f"{self.vendor} {path} timed out after {self.timeout}s — vendor slow or unreachable."
            )
        except httpx.HTTPError as exc:
            counters.increment("provider.failures")
            counters.increment(f"provider.failures.{self.vendor}")
            raise ProviderDataUnavailable(
                f"{self.vendor} {path} connection failed: {type(exc).__name__}"
            )
        if response.status_code != 200:
            counters.increment("provider.failures")
            counters.increment(f"provider.failures.{self.vendor}")
        if response.status_code == 401:
            raise ProviderDataUnavailable(
                f"{self.vendor} rejected the API key (HTTP 401) — the key is invalid, expired, "
                f"or revoked. Set a fresh key in .env."
            )
        if response.status_code == 429:
            raise ProviderDataUnavailable(
                f"{self.vendor} rate limit exceeded (HTTP 429) — lower calls_per_minute."
            )
        if response.status_code == 403:
            raise ProviderDataUnavailable(
                f"{self.vendor} returned 403 for {path} — this endpoint is not included in the current plan."
            )
        if response.status_code != 200:
            raise ProviderDataUnavailable(f"{self.vendor} {path} failed: HTTP {response.status_code}")

        payload = response.json()
        if cache_key is not None:
            self._cache.put(cache_key, payload)
        return payload, False
