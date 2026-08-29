"""Classification of raw subscription messages into normalized events.

What this layer can and cannot know
-----------------------------------
``logsSubscribe`` delivers a transaction's *log lines*, its signature, its slot
and whether it failed. It does **not** deliver mints, amounts or account keys.
So a log-derived event is honestly marked :data:`DecodeStatus.PARTIAL`: the
kind and signature are real, and ``token_mint``/amounts stay ``None`` until the
enrichment step reads the transaction itself.

Classification is marker-based and each marker that fires is recorded in
``reason_codes``. That makes every classification auditable and every
misclassification reproducible from the stored row - the log lines are kept in
``raw`` as well.

The markers are heuristics over program log output, not consensus rules. They
are declared as data below so they can be corrected without touching logic, and
they are exercised by ``tests/unit/test_normalizer.py``.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Final

from vyraxis.core.clock import from_unix_seconds
from vyraxis.core.enums import DecodeStatus, EventKind, TradeDirection
from vyraxis.core.logging import get_logger
from vyraxis.scanner.events import NormalizedEvent, payload_dedup_key, signature_dedup_key
from vyraxis.solana import programs
from vyraxis.solana.provider import RawEvent

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class LogMarker:
    """A log substring that implies an event kind."""

    #: Matched case-sensitively against each log line.
    needle: str
    kind: EventKind
    #: Recorded in ``reason_codes`` when this marker fires.
    code: str
    direction: TradeDirection | None = None
    #: When set, the marker only applies to logs of this program's subscription.
    program_id: str | None = None
    #: Higher wins when several markers match one transaction.
    priority: int = 0


#: Ordered by specificity. Program-scoped markers outrank generic SPL ones so a
#: pump.fun "Create" is a token launch rather than a bare InitializeMint.
LOG_MARKERS: Final[tuple[LogMarker, ...]] = (
    LogMarker(
        "Program log: Instruction: Create",
        EventKind.TOKEN_CREATED,
        "PUMPFUN_CREATE",
        program_id=programs.PUMP_FUN,
        priority=90,
    ),
    LogMarker(
        "Program log: Instruction: Buy",
        EventKind.SWAP,
        "PUMPFUN_BUY",
        direction=TradeDirection.BUY,
        program_id=programs.PUMP_FUN,
        priority=80,
    ),
    LogMarker(
        "Program log: Instruction: Sell",
        EventKind.SWAP,
        "PUMPFUN_SELL",
        direction=TradeDirection.SELL,
        program_id=programs.PUMP_FUN,
        priority=80,
    ),
    LogMarker(
        "Program log: initialize2",
        EventKind.POOL_CREATED,
        "RAYDIUM_INITIALIZE2",
        program_id=programs.RAYDIUM_AMM_V4,
        priority=95,
    ),
    LogMarker(
        "Program log: ray_log",
        EventKind.SWAP,
        "RAYDIUM_RAY_LOG",
        program_id=programs.RAYDIUM_AMM_V4,
        priority=40,
    ),
    LogMarker(
        "Program log: Instruction: InitializeMint2",
        EventKind.TOKEN_CREATED,
        "SPL_INITIALIZE_MINT2",
        priority=70,
    ),
    LogMarker(
        "Program log: Instruction: InitializeMint",
        EventKind.TOKEN_CREATED,
        "SPL_INITIALIZE_MINT",
        priority=69,
    ),
    LogMarker(
        "Program log: Instruction: SetAuthority",
        EventKind.AUTHORITY_CHANGED,
        "SPL_SET_AUTHORITY",
        priority=75,
    ),
    LogMarker(
        "Program log: Instruction: MintTo",
        EventKind.MINT,
        "SPL_MINT_TO",
        priority=50,
    ),
    LogMarker(
        "Program log: Instruction: Burn",
        EventKind.BURN,
        "SPL_BURN",
        priority=50,
    ),
    LogMarker(
        "Program log: Instruction: Transfer",
        EventKind.TRANSFER,
        "SPL_TRANSFER",
        priority=10,
    ),
)


@dataclass(frozen=True, slots=True)
class Classification:
    kind: EventKind
    direction: TradeDirection | None
    reason_codes: tuple[str, ...]


class LogNotificationNormalizer:
    """Turns ``logsNotification`` messages into :class:`NormalizedEvent`.

    Transactions that failed on chain are still normalized and persisted: a
    burst of failed swaps against a token is a signal (honeypot behaviour,
    broken pool), and discarding it would hide it.
    """

    def __init__(self, *, keep_failed_transactions: bool = True) -> None:
        self._keep_failed = keep_failed_transactions

    def normalize(self, raw: RawEvent) -> NormalizedEvent | None:
        payload = raw.payload
        method = payload.get("method")
        if method != "logsNotification":
            return self._unclassified(raw, reason="UNSUPPORTED_NOTIFICATION")

        result = ((payload.get("params") or {}).get("result")) or {}
        value = result.get("value") or {}
        signature = value.get("signature")
        logs = value.get("logs")
        tx_error = value.get("err")

        if not isinstance(logs, list):
            return self._unclassified(raw, reason="NO_LOGS_IN_NOTIFICATION")
        if not isinstance(signature, str) or not signature:
            return self._unclassified(raw, reason="NO_SIGNATURE_IN_NOTIFICATION")

        program_id = _program_from_stream(raw.stream)
        classification = classify_logs(logs, program_id=program_id)

        reason_codes = classification.reason_codes
        if tx_error is not None:
            if not self._keep_failed:
                return None
            reason_codes = (*reason_codes, "TX_FAILED")

        # The payload's context slot is authoritative: it is the value the node
        # actually reported and the value persisted in ``raw``. The envelope's
        # slot is a convenience copy the transport extracted from it, used only
        # when the payload omits the context.
        slot = (result.get("context") or {}).get("slot")
        if not isinstance(slot, int):
            slot = raw.slot
        if not isinstance(slot, int):
            # Slot is required for ordering; without it the event cannot be
            # placed in chain sequence, so it is recorded as unclassified with
            # an explicit reason rather than being given a made-up slot.
            return self._unclassified(raw, reason="NO_SLOT_IN_NOTIFICATION")

        return NormalizedEvent(
            dedup_key=signature_dedup_key(signature, classification.kind),
            kind=classification.kind,
            decode_status=DecodeStatus.PARTIAL,
            provider=raw.provider,
            stream=raw.stream,
            slot=slot,
            observed_at=raw.received_at,
            signature=signature,
            program_id=program_id,
            direction=classification.direction,
            reason_codes=reason_codes,
            raw={"logs": logs, "err": tx_error, "source": "logsNotification"},
        )

    def _unclassified(self, raw: RawEvent, *, reason: str) -> NormalizedEvent:
        """Record a message we could not classify. Never silently dropped."""
        log.warning("event_unclassified", stream=raw.stream, reason=reason)
        return NormalizedEvent(
            dedup_key=payload_dedup_key(raw.stream, raw.slot, raw.payload),
            kind=EventKind.UNCLASSIFIED,
            decode_status=DecodeStatus.UNDECODED,
            provider=raw.provider,
            stream=raw.stream,
            slot=raw.slot or 0,
            observed_at=raw.received_at,
            program_id=_program_from_stream(raw.stream),
            reason_codes=(reason,),
            raw={"payload": raw.payload, "source": "unclassified"},
        )


def classify_logs(logs: Sequence[str], *, program_id: str | None = None) -> Classification:
    """Choose an event kind from a transaction's log lines.

    All matching markers contribute a reason code; the highest-priority one
    decides the kind. Recording the losers matters: it is how you later discover
    that pool creations are being shadowed by a generic Transfer marker.
    """
    matches: list[LogMarker] = []
    for marker in LOG_MARKERS:
        if marker.program_id is not None and marker.program_id != program_id:
            continue
        if any(marker.needle in line for line in logs):
            matches.append(marker)

    if not matches:
        return Classification(EventKind.UNCLASSIFIED, None, ("NO_MARKER_MATCH",))

    matches.sort(key=lambda m: m.priority, reverse=True)
    winner = matches[0]
    return Classification(
        kind=winner.kind,
        direction=winner.direction,
        reason_codes=tuple(m.code for m in matches),
    )


def _program_from_stream(stream: str) -> str | None:
    """Recover the watched program id from a stream name such as ``logs:<id>``."""
    if ":" not in stream:
        return None
    _, _, candidate = stream.partition(":")
    return candidate if candidate in programs.BY_ID else None


def block_time_from_payload(payload: dict[str, Any]) -> Any:
    """Extract chain time from a payload when present, else ``None``."""
    block_time = payload.get("blockTime")
    if isinstance(block_time, int):
        return from_unix_seconds(block_time)
    return None
