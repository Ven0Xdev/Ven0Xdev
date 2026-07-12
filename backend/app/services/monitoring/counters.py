"""In-process operational counters and latency samples.

Thread-safe, dependency-free, and deliberately in-memory: this is the L0
observability layer that always exists, even before Prometheus lands
(Phase 5). The registry survives for the process lifetime; a multi-replica
deployment aggregates per-replica values at scrape time.
"""
from __future__ import annotations

import threading
from collections import defaultdict, deque

_lock = threading.Lock()
_counters: dict[str, int] = defaultdict(int)
_latencies: dict[str, deque] = defaultdict(lambda: deque(maxlen=500))


def increment(name: str, by: int = 1) -> None:
    with _lock:
        _counters[name] += by


def record_latency(route: str, ms: float) -> None:
    with _lock:
        _latencies[route].append(ms)


def snapshot_counters() -> dict[str, int]:
    with _lock:
        return dict(_counters)


def latency_summary() -> dict[str, dict]:
    with _lock:
        out: dict[str, dict] = {}
        for route, samples in _latencies.items():
            if not samples:
                continue
            ordered = sorted(samples)
            n = len(ordered)
            out[route] = {
                "count": n,
                "p50_ms": round(ordered[n // 2], 1),
                "p95_ms": round(ordered[min(int(n * 0.95), n - 1)], 1),
                "max_ms": round(ordered[-1], 1),
            }
        return out


def reset_for_tests() -> None:
    with _lock:
        _counters.clear()
        _latencies.clear()
