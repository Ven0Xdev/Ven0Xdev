"""Shared plumbing for HTTP-backed market data providers.

Every real vendor adapter needs the same three disciplines (architecture §8):
rate budgeting under the vendor quota, per-fact TTL caching, and typed
failures. They live here once so a new provider is only its field mapping —
no duplicated infrastructure.
"""
from __future__ import annotations

import threading
import time

import httpx


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
        self._client = httpx.Client(
            base_url=base_url,
            params=default_params or {},
            headers=headers or {},
            timeout=timeout,
            transport=transport,
        )
        self._bucket = TokenBucket(calls_per_minute)
        self._cache = TTLCache(cache_ttl_seconds)

    def get_json(self, path: str, params: dict | None = None, cache_key: tuple | None = None):
        if cache_key is not None:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached

        self._bucket.acquire()
        response = self._client.get(path, params=params or {})
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
        return payload
