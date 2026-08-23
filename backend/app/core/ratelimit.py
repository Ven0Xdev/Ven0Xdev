"""In-process token-bucket rate limiter.

L0 implementation (single replica); the Redis-backed version replaces the
storage, not the interface, at horizontal scale-out (architecture NFR-S3).
"""
from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, last_refill)


def check_rate_limit(key: str, per_minute: int) -> tuple[bool, int]:
    """Returns (allowed, retry_after_seconds)."""
    fill_rate = per_minute / 60.0
    with _lock:
        tokens, last = _buckets.get(key, (float(per_minute), time.monotonic()))
        now = time.monotonic()
        tokens = min(float(per_minute), tokens + (now - last) * fill_rate)
        if tokens >= 1.0:
            _buckets[key] = (tokens - 1.0, now)
            return True, 0
        _buckets[key] = (tokens, now)
        return False, max(1, int((1.0 - tokens) / fill_rate))


def reset_for_tests() -> None:
    with _lock:
        _buckets.clear()
