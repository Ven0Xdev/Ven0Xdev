"""Shared plumbing for HTTP-backed market data providers.

Every real vendor adapter needs the same three disciplines (architecture §8):
rate budgeting under the vendor quota, per-fact TTL caching, and typed
failures. They live here once so a new provider is only its field mapping —
no duplicated infrastructure.
"""
from __future__ import annotations

import json
import logging
import threading
import time

import httpx

logger = logging.getLogger(__name__)

# Query parameters that must never appear in logs or error messages.
_SECRET_PARAMS = {"token", "apikey", "api_key", "apiKey", "key"}

_MAX_REDIRECTS = 3

# TTL for facts that change slowly (news, fundamentals, corporate actions) —
# minutes-old news/fundamentals are exactly as useful as fresh ones, so
# caching them this long is what actually keeps a 20-symbol universe within
# Alpha Vantage's free 25-requests/day quota (a full pass costs ~1 credit
# per symbol per day at this TTL, vs. every 5 minutes at the default TTL,
# which exhausts the daily quota after a couple of symbols — see
# services/data_providers/market_data_fallback.py). Quotes/OHLCV keep each
# provider's own shorter default TTL — those need to stay fresher.
LOW_FREQUENCY_TTL_SECONDS = 12 * 60 * 60


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


def _connect_redis(redis_url: str | None):
    """Best-effort Redis connection, used by both the shared cache and the
    shared rate limiter below. Returns None (never raises) when Redis is
    unset or unreachable — every caller degrades to a per-process
    equivalent rather than failing the request. A cache/rate-limit outage
    must never become a market-data outage."""
    if not redis_url:
        return None
    try:
        import redis as redis_lib

        client = redis_lib.Redis.from_url(redis_url, socket_connect_timeout=1.0, socket_timeout=1.0)
        client.ping()
        return client
    except Exception as exc:
        logger.warning("Redis unavailable (%s) — falling back to per-process cache/rate-limit.", exc)
        return None


class TokenBucket:
    """Per-process rate limiter — used directly when Redis is unavailable,
    and as SharedRateLimiter's fallback on any Redis error."""

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


class SharedRateLimiter:
    """Enforces calls_per_minute across every process sharing this Redis
    instance (api, prediction-logger, and the opt-in scanner container all
    poll the same 20-symbol universe against the same vendor quota) — a
    per-process TokenBucket alone lets three containers each independently
    believe they have the full budget, which is exactly how a free-tier
    quota gets blown through. Falls back to a local TokenBucket on any
    Redis error, so a cache outage degrades to conservative single-process
    limiting rather than an unbounded burst.
    """

    def __init__(self, redis_url: str | None, key: str, calls_per_minute: int):
        self._key = f"ratelimit:{key}"
        self._limit = max(1, calls_per_minute)
        self._local = TokenBucket(calls_per_minute)
        self._redis = _connect_redis(redis_url)

    def acquire(self) -> None:
        if self._redis is not None:
            try:
                self._acquire_redis()
                return
            except Exception as exc:
                logger.warning("SharedRateLimiter: Redis error (%s) — falling back to local limiter.", exc)
                self._redis = None
        self._local.acquire()

    def _acquire_redis(self) -> None:
        # Fixed 60s window keyed by epoch-minute: INCR the window's counter,
        # set it to expire (first writer only) slightly past the window so
        # it never accumulates stale keys. Over budget -> sleep exactly to
        # the next window boundary and retry, capped so one call can never
        # block more than ~2 windows even under heavy cross-process
        # contention.
        for _ in range(3):
            now = time.time()
            window = int(now // 60)
            redis_key = f"{self._key}:{window}"
            count = self._redis.incr(redis_key)
            if count == 1:
                self._redis.expire(redis_key, 65)
            if count <= self._limit:
                return
            time.sleep(max(0.05, 60 - (now % 60)))
        # Exhausted retries under sustained contention — let the vendor's
        # own 429 (already handled as a typed ProviderDataUnavailable) be
        # the final backstop rather than blocking indefinitely.


class TTLCache:
    """Per-process fallback store — used directly when Redis is
    unavailable, and as SharedCache's fallback on any Redis error."""

    def __init__(self, default_ttl_seconds: float):
        self.default_ttl = default_ttl_seconds
        self.store: dict = {}
        self.lock = threading.Lock()

    def get(self, key):
        with self.lock:
            hit = self.store.get(key)
            if hit and time.monotonic() - hit[0] < hit[2]:
                return hit[1]
        return None

    def put(self, key, value, ttl_seconds: float | None = None):
        ttl = self.default_ttl if ttl_seconds is None else ttl_seconds
        with self.lock:
            self.store[key] = (time.monotonic(), value, ttl)


class SharedCache:
    """Redis-backed cache shared across every process (api,
    prediction-logger, scanner) so they collectively make one vendor call
    per fact per TTL window instead of one each — the main lever for
    staying under a tight free-tier daily quota. Falls back to a
    per-process TTLCache on any Redis error; a cache outage means more
    vendor calls, never a crash.
    """

    def __init__(self, redis_url: str | None, namespace: str, default_ttl_seconds: float):
        self._namespace = namespace
        self._local = TTLCache(default_ttl_seconds)
        self._redis = _connect_redis(redis_url)

    def _redis_key(self, key: tuple) -> str:
        return "cache:" + self._namespace + ":" + ":".join(str(part) for part in key)

    def get(self, key: tuple):
        if self._redis is not None:
            try:
                raw = self._redis.get(self._redis_key(key))
                return json.loads(raw) if raw is not None else None
            except Exception as exc:
                logger.warning("SharedCache: Redis GET error (%s) — falling back to local cache.", exc)
                self._redis = None
        return self._local.get(key)

    def put(self, key: tuple, value, ttl_seconds: float | None = None) -> None:
        if self._redis is not None:
            try:
                ttl = self._local.default_ttl if ttl_seconds is None else ttl_seconds
                self._redis.set(self._redis_key(key), json.dumps(value), ex=max(1, int(ttl)))
                return
            except Exception as exc:
                logger.warning("SharedCache: Redis SET error (%s) — falling back to local cache.", exc)
                self._redis = None
        self._local.put(key, value, ttl_seconds)


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
        redis_url: str | None = None,
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
        # redis_url=None (the default) keeps every existing caller — direct
        # RateLimitedHttpClient construction with no redis_url, e.g.
        # Finnhub's adapter — on exactly the old per-process-only behavior.
        self._bucket = SharedRateLimiter(redis_url, vendor, calls_per_minute)
        self._cache = SharedCache(redis_url, vendor, cache_ttl_seconds)

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

    def get_json(
        self, path: str, params: dict | None = None, cache_key: tuple | None = None, ttl_seconds: float | None = None
    ):
        payload, _from_cache = self.get_json_cached(path, params, cache_key, ttl_seconds)
        return payload

    def get_json_cached(
        self,
        path: str,
        params: dict | None = None,
        cache_key: tuple | None = None,
        ttl_seconds: float | None = None,
    ) -> tuple:
        """Same as get_json but also reports whether the result was served
        from the TTL cache — callers use this to surface an honest "cached"
        vs "live/delayed" data_mode instead of always claiming a fresh call.

        ttl_seconds overrides this client's default cache TTL for this one
        call — callers pass LOW_FREQUENCY_TTL_SECONDS for slow-changing
        facts (news, fundamentals, corporate actions) so they don't re-spend
        vendor quota re-fetching data that hasn't changed.
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
        except httpx.TimeoutException as exc:
            counters.increment("provider.failures")
            counters.increment(f"provider.failures.{self.vendor}")
            raise ProviderDataUnavailable(
                f"{self.vendor} {path} timed out after {self.timeout}s — vendor slow or unreachable."
            ) from exc
        except httpx.HTTPError as exc:
            counters.increment("provider.failures")
            counters.increment(f"provider.failures.{self.vendor}")
            raise ProviderDataUnavailable(
                f"{self.vendor} {path} connection failed: {type(exc).__name__}"
            ) from exc
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
            self._cache.put(cache_key, payload, ttl_seconds)
        return payload, False
