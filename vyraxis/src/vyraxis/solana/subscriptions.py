"""Subscription request builders for the Solana PubSub protocol."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from vyraxis.core.config import Commitment


@dataclass(frozen=True, slots=True)
class Subscription:
    """One PubSub subscription and the notification method it produces."""

    #: Stable logical name persisted on every event from this subscription.
    name: str
    method: str
    notification: str
    params: list[Any] = field(default_factory=list)
    #: Heartbeat subscriptions prove the socket is alive but carry no market
    #: data, so the pipeline drops them after stamping liveness.
    heartbeat: bool = False


def logs_subscription(program_id: str, commitment: Commitment = "confirmed") -> Subscription:
    """Subscribe to transaction logs mentioning ``program_id``.

    ``logsSubscribe`` with a ``mentions`` filter is the discovery primitive:
    it delivers every transaction touching the program, which is how new mints,
    new pools and swaps are noticed without polling.
    """
    return Subscription(
        name=f"logs:{program_id}",
        method="logsSubscribe",
        notification="logsNotification",
        params=[{"mentions": [program_id]}, {"commitment": commitment}],
    )


def all_logs_subscription(commitment: Commitment = "confirmed") -> Subscription:
    """Subscribe to all logs. Firehose volume - only for a dedicated node."""
    return Subscription(
        name="logs:all",
        method="logsSubscribe",
        notification="logsNotification",
        params=["all", {"commitment": commitment}],
    )


def program_subscription(program_id: str, commitment: Commitment = "confirmed") -> Subscription:
    """Subscribe to account changes owned by ``program_id``."""
    return Subscription(
        name=f"program:{program_id}",
        method="programSubscribe",
        notification="programNotification",
        params=[program_id, {"encoding": "base64", "commitment": commitment}],
    )


def slot_subscription() -> Subscription:
    """Subscribe to slot advancement.

    Attached automatically as a heartbeat. Without it a quiet market is
    indistinguishable from a dead socket, and stale-detection would recycle a
    perfectly healthy connection (or, worse, never fire at all).
    """
    return Subscription(
        name="slots",
        method="slotSubscribe",
        notification="slotNotification",
        heartbeat=True,
    )


def unsubscribe_method(method: str) -> str:
    """Map a subscribe method to its unsubscribe counterpart."""
    if not method.endswith("Subscribe"):
        raise ValueError(f"not a subscribe method: {method!r}")
    return method[: -len("Subscribe")] + "Unsubscribe"
