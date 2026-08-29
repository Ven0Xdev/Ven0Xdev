"""In-process deduplication.

This is a *cache*, not the guarantee. The authoritative check is the UNIQUE
index on ``market_events.dedup_key``: an in-memory set is empty after a restart
and is not shared between workers, so relying on it alone would let duplicates
through in exactly the situations that matter.

What it buys is avoiding a database round-trip for the duplicates a single
process can recognise itself, which on a busy stream is most of them.
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass


@dataclass
class DedupStats:
    seen: int = 0
    duplicates: int = 0
    evictions: int = 0

    @property
    def unique(self) -> int:
        return self.seen - self.duplicates


class DedupCache:
    """Bounded LRU set of dedup keys."""

    __slots__ = ("_capacity", "_keys", "stats")

    def __init__(self, capacity: int) -> None:
        if capacity < 1:
            raise ValueError("dedup cache capacity must be positive")
        self._capacity = capacity
        self._keys: OrderedDict[str, None] = OrderedDict()
        self.stats = DedupStats()

    def __len__(self) -> int:
        return len(self._keys)

    @property
    def capacity(self) -> int:
        return self._capacity

    def check_and_add(self, key: str) -> bool:
        """Return True if ``key`` is new, False if it was already seen.

        Marks the key as most-recently-used either way, so a key that keeps
        recurring is not evicted while it is still active.
        """
        self.stats.seen += 1
        if key in self._keys:
            self._keys.move_to_end(key)
            self.stats.duplicates += 1
            return False
        self._keys[key] = None
        if len(self._keys) > self._capacity:
            self._keys.popitem(last=False)
            self.stats.evictions += 1
        return True

    def contains(self, key: str) -> bool:
        return key in self._keys

    def clear(self) -> None:
        self._keys.clear()
