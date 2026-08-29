"""In-process dedup cache behaviour."""

from __future__ import annotations

import pytest

from vyraxis.scanner.dedup import DedupCache


def test_first_sighting_is_new_repeat_is_not() -> None:
    cache = DedupCache(10)
    assert cache.check_and_add("a") is True
    assert cache.check_and_add("a") is False
    assert cache.stats.seen == 2
    assert cache.stats.duplicates == 1
    assert cache.stats.unique == 1


def test_capacity_is_enforced_and_evictions_counted() -> None:
    cache = DedupCache(3)
    for key in "abcd":
        cache.check_and_add(key)
    assert len(cache) == 3
    assert cache.stats.evictions == 1
    # 'a' was the least recently used and was evicted.
    assert not cache.contains("a")
    assert cache.contains("d")


def test_recurring_keys_are_not_evicted_while_active() -> None:
    cache = DedupCache(3)
    for key in ("a", "b", "c"):
        cache.check_and_add(key)
    cache.check_and_add("a")  # touch -> most recently used
    cache.check_and_add("d")  # evicts 'b', not 'a'
    assert cache.contains("a")
    assert not cache.contains("b")


def test_eviction_can_admit_a_stale_duplicate() -> None:
    """The documented limitation: this is a cache, not the guarantee.

    An evicted key looks new again. That is exactly why the database UNIQUE
    index remains the authoritative dedup check.
    """
    cache = DedupCache(2)
    cache.check_and_add("a")
    cache.check_and_add("b")
    cache.check_and_add("c")  # evicts 'a'
    assert cache.check_and_add("a") is True


def test_zero_capacity_is_rejected() -> None:
    with pytest.raises(ValueError, match="capacity must be positive"):
        DedupCache(0)
