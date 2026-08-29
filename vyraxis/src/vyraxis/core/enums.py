"""Domain enumerations shared across modules.

All values are stored in the database as short strings with CHECK constraints
rather than native PostgreSQL enums: adding a member must be a code change plus
a cheap constraint migration, not an ``ALTER TYPE`` that locks the table.
"""

from __future__ import annotations

from enum import StrEnum


class EventKind(StrEnum):
    """Normalized classification of an on-chain occurrence."""

    TOKEN_CREATED = "TOKEN_CREATED"
    POOL_CREATED = "POOL_CREATED"
    SWAP = "SWAP"
    LIQUIDITY_ADDED = "LIQUIDITY_ADDED"
    LIQUIDITY_REMOVED = "LIQUIDITY_REMOVED"
    TRANSFER = "TRANSFER"
    AUTHORITY_CHANGED = "AUTHORITY_CHANGED"
    MINT = "MINT"
    BURN = "BURN"
    #: Recognised as relevant (matched a watched program) but not decodable into
    #: a more specific kind. Retained deliberately: an undecoded event is data we
    #: could not yet interpret, not data we may discard.
    UNCLASSIFIED = "UNCLASSIFIED"


class TradeDirection(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class DecodeStatus(StrEnum):
    """How completely a raw payload was understood."""

    #: Every field the decoder claims was extracted from the payload.
    DECODED = "DECODED"
    #: Some fields extracted; others unavailable in this payload shape.
    PARTIAL = "PARTIAL"
    #: Nothing beyond envelope metadata could be extracted.
    UNDECODED = "UNDECODED"


class ObservationKind(StrEnum):
    #: Captured at the moment a candidate was discovered.
    DISCOVERY = "DISCOVERY"
    #: Captured at a fixed offset after a discovery observation.
    HORIZON = "HORIZON"


class ObservationStatus(StrEnum):
    PENDING = "PENDING"
    CAPTURED = "CAPTURED"
    #: Due time passed without a capture (e.g. process was down). Never
    #: back-filled with data from a later moment.
    MISSED = "MISSED"
    FAILED = "FAILED"


class HealthStatus(StrEnum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    UNHEALTHY = "UNHEALTHY"
    UNKNOWN = "UNKNOWN"


class ConnectionState(StrEnum):
    DISCONNECTED = "DISCONNECTED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    SUBSCRIBED = "SUBSCRIBED"
    RECONNECTING = "RECONNECTING"
    STOPPED = "STOPPED"


class SystemEventLevel(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"
