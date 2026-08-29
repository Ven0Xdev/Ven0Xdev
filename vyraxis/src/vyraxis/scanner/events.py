"""The normalized event model.

This is the boundary type between "how a provider happens to speak" and the
rest of VYRAXIS. Everything downstream - RugGuard, features, backtests - reads
these fields and never a provider payload.

Field discipline:

* ``observed_at`` is when VYRAXIS learned of the event. It is required.
* ``block_time`` is chain time and is optional, because providers do not always
  supply it and inventing one would fabricate history.
* ``decode_status`` states honestly how much was actually extracted. A
  ``PARTIAL`` event with a null ``token_mint`` says "we do not know yet", which
  is information; a guessed mint would be a fabrication.
* ``reason_codes`` records *why* the classifier chose this kind, so a
  misclassification is diagnosable months later from the stored row alone.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from vyraxis.core.clock import ensure_utc
from vyraxis.core.enums import DecodeStatus, EventKind, TradeDirection


@dataclass(frozen=True, slots=True)
class NormalizedEvent:
    """A single, deduplicable on-chain fact."""

    dedup_key: str
    kind: EventKind
    decode_status: DecodeStatus
    provider: str
    stream: str
    slot: int
    observed_at: datetime

    signature: str | None = None
    block_time: datetime | None = None
    ingest_latency_ms: int | None = None

    program_id: str | None = None
    token_mint: str | None = None
    pool_address: str | None = None
    actor_wallet: str | None = None

    direction: TradeDirection | None = None
    base_amount_raw: int | None = None
    quote_amount_raw: int | None = None

    reason_codes: tuple[str, ...] = ()
    raw: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "observed_at", ensure_utc(self.observed_at))
        if self.block_time is not None:
            object.__setattr__(self, "block_time", ensure_utc(self.block_time))
        if self.slot < 0:
            raise ValueError(f"slot must be non-negative, got {self.slot}")

    def to_row(self) -> dict[str, Any]:
        """Map to a ``market_events`` insert row."""
        return {
            "dedup_key": self.dedup_key,
            "kind": self.kind,
            "decode_status": self.decode_status,
            "provider": self.provider,
            "stream": self.stream,
            "slot": self.slot,
            "signature": self.signature,
            "block_time": self.block_time,
            "observed_at": self.observed_at,
            "ingest_latency_ms": self.ingest_latency_ms,
            "program_id": self.program_id,
            "token_mint": self.token_mint,
            "pool_address": self.pool_address,
            "actor_wallet": self.actor_wallet,
            "direction": self.direction,
            "base_amount_raw": self.base_amount_raw,
            "quote_amount_raw": self.quote_amount_raw,
            "reason_codes": list(self.reason_codes),
            "raw": self.raw,
        }

    def with_enrichment(
        self,
        *,
        token_mint: str | None = None,
        pool_address: str | None = None,
        actor_wallet: str | None = None,
        direction: TradeDirection | None = None,
        base_amount_raw: int | None = None,
        quote_amount_raw: int | None = None,
        block_time: datetime | None = None,
        decode_status: DecodeStatus | None = None,
        extra_reason_codes: tuple[str, ...] = (),
        raw_extra: dict[str, Any] | None = None,
    ) -> NormalizedEvent:
        """Return a copy with additional decoded detail.

        Enrichment only ever *adds*: a field already known is never overwritten
        by a later, weaker source.
        """
        raw = dict(self.raw)
        if raw_extra:
            raw.update(raw_extra)
        return NormalizedEvent(
            dedup_key=self.dedup_key,
            kind=self.kind,
            decode_status=decode_status or self.decode_status,
            provider=self.provider,
            stream=self.stream,
            slot=self.slot,
            observed_at=self.observed_at,
            signature=self.signature,
            block_time=self.block_time or block_time,
            ingest_latency_ms=self.ingest_latency_ms,
            program_id=self.program_id,
            token_mint=self.token_mint or token_mint,
            pool_address=self.pool_address or pool_address,
            actor_wallet=self.actor_wallet or actor_wallet,
            direction=self.direction or direction,
            base_amount_raw=(
                self.base_amount_raw if self.base_amount_raw is not None else base_amount_raw
            ),
            quote_amount_raw=(
                self.quote_amount_raw if self.quote_amount_raw is not None else quote_amount_raw
            ),
            reason_codes=self.reason_codes + extra_reason_codes,
            raw=raw,
        )


def signature_dedup_key(signature: str, kind: EventKind) -> str:
    """Idempotency key for an event derived from a transaction.

    Keyed on (signature, kind) rather than signature alone: one transaction can
    legitimately contain several distinct facts (a pool creation *and* the first
    swap into it), and collapsing them would lose data. The same fact seen twice
    - via a replayed backlog, or via two subscriptions that both matched the
    transaction - collapses to one row, which is the point.
    """
    return f"sig:{signature}:{kind.value}"


def payload_dedup_key(stream: str, slot: int | None, payload: dict[str, Any]) -> str:
    """Content-addressed fallback for events with no signature.

    Deterministic across processes and restarts, so replaying the same message
    produces the same key and therefore no duplicate row.
    """
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()[:40]
    return f"raw:{stream}:{slot if slot is not None else 'na'}:{digest}"
