"""SharedCache/SharedRateLimiter (http_base.py) — the caching/rate-limiting
layer added to keep a 20-symbol universe within Twelve Data's/Alpha
Vantage's free-tier quotas. No live Redis or vendor API needed: Redis
absence/failure is exactly the fallback path these tests exercise.
"""
import time

from app.services.data_providers.http_base import (
    LOW_FREQUENCY_TTL_SECONDS,
    SharedCache,
    SharedRateLimiter,
    TTLCache,
    _connect_redis,
)


def test_low_frequency_ttl_is_hours_not_minutes():
    # The whole point: news/fundamentals must survive far longer than the
    # default 300s quote/OHLCV TTL, or a 20-symbol pass burns the Alpha
    # Vantage daily quota in minutes.
    assert LOW_FREQUENCY_TTL_SECONDS >= 6 * 60 * 60


def test_connect_redis_returns_none_when_unset():
    assert _connect_redis(None) is None
    assert _connect_redis("") is None


def test_connect_redis_degrades_on_unreachable_host():
    # No live Redis in this test environment — a real connection attempt
    # must degrade to None, never raise.
    assert _connect_redis("redis://127.0.0.1:1/0") is None


def test_ttl_cache_expires_after_its_ttl():
    cache = TTLCache(default_ttl_seconds=1000)
    cache.put(("k",), "v", ttl_seconds=0.05)
    assert cache.get(("k",)) == "v"
    time.sleep(0.1)
    assert cache.get(("k",)) is None


def test_ttl_cache_put_without_override_uses_constructor_default():
    cache = TTLCache(default_ttl_seconds=1000)
    cache.put(("k",), "v")
    assert cache.get(("k",)) == "v"  # still within the 1000s default


def test_shared_cache_without_redis_falls_back_to_in_process_store():
    cache = SharedCache(redis_url=None, namespace="test", default_ttl_seconds=1000)
    assert cache.get(("k",)) is None
    cache.put(("k",), {"a": 1})
    assert cache.get(("k",)) == {"a": 1}


def test_shared_cache_ttl_override_is_honored_without_redis():
    cache = SharedCache(redis_url=None, namespace="test", default_ttl_seconds=1000)
    cache.put(("k",), "fresh", ttl_seconds=0.05)
    assert cache.get(("k",)) == "fresh"
    time.sleep(0.1)
    assert cache.get(("k",)) is None


def test_shared_cache_degrades_when_redis_unreachable():
    # Same contract as _connect_redis alone: an unreachable Redis at
    # construction must not raise, and the cache must still work via the
    # local fallback.
    cache = SharedCache(redis_url="redis://127.0.0.1:1/0", namespace="test", default_ttl_seconds=1000)
    cache.put(("k",), "v")
    assert cache.get(("k",)) == "v"


def test_shared_rate_limiter_without_redis_still_limits_locally():
    limiter = SharedRateLimiter(redis_url=None, key="test", calls_per_minute=10_000)
    start = time.monotonic()
    for _ in range(5):
        limiter.acquire()
    # 10k/min is effectively unthrottled at n=5 — this just proves acquire()
    # doesn't hang or raise on the no-Redis path.
    assert time.monotonic() - start < 2.0


def test_shared_rate_limiter_degrades_when_redis_unreachable():
    limiter = SharedRateLimiter(redis_url="redis://127.0.0.1:1/0", key="test", calls_per_minute=10_000)
    limiter.acquire()  # must not raise
