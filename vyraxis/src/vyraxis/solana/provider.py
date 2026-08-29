"""Provider abstraction.

The contract below is expressed in terms of the **Solana JSON-RPC protocol**,
not in terms of any vendor. Swapping Helius for QuickNode, Triton or a
self-hosted validator is a URL change. A vendor with a proprietary "enhanced"
API is supported by writing an adapter that satisfies these Protocols and emits
the same :class:`RawEvent` envelope - never by leaking its response shape
upward.

Nothing in :mod:`vyraxis.scanner` and above may import a vendor SDK.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol, runtime_checkable

from vyraxis.core.enums import ConnectionState


@dataclass(frozen=True, slots=True)
class RawEvent:
    """An unprocessed message from a subscription, with ingestion provenance.

    ``payload`` is the provider's JSON as received. It is retained verbatim and
    persisted alongside the normalized row so that a decoding bug can be
    diagnosed - and re-processed - without re-fetching from the chain.
    """

    #: Logical stream name, e.g. "logs:TokenkegQ...".
    stream: str
    #: Provider label from configuration, recorded for provenance.
    provider: str
    #: Wall-clock instant VYRAXIS received the message (UTC).
    received_at: datetime
    #: Slot reported in the subscription context, when present.
    slot: int | None
    payload: dict[str, Any]
    #: Server-assigned subscription id, useful when correlating logs.
    subscription_id: int | None = None


@dataclass(frozen=True, slots=True)
class AccountInfo:
    """Result of ``getAccountInfo`` for a single account."""

    address: str
    lamports: int
    owner: str
    executable: bool
    rent_epoch: int | None
    data: bytes
    slot: int | None = None


@dataclass(frozen=True, slots=True)
class MintState:
    """Decoded SPL mint account state.

    ``mint_authority``/``freeze_authority`` are ``None`` when the on-chain
    COption is None, i.e. the authority has been **revoked**. That is a positive
    finding, not missing data; callers distinguish it from "not yet read" via
    the presence of a MintState at all.
    """

    mint: str
    decimals: int
    supply_raw: int
    mint_authority: str | None
    freeze_authority: str | None
    is_initialized: bool
    owner_program: str
    read_at: datetime
    slot: int | None = None


@dataclass(frozen=True, slots=True)
class ProviderStatus:
    """Snapshot of a provider connection, surfaced by health checks."""

    provider: str
    component: str
    state: ConnectionState
    healthy: bool
    detail: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class RpcProvider(Protocol):
    """Request/response access to chain state."""

    @property
    def provider_name(self) -> str: ...

    async def get_health(self) -> str: ...

    async def get_slot(self) -> int: ...

    async def get_block_time(self, slot: int) -> datetime | None: ...

    async def get_account_info(self, address: str) -> AccountInfo | None: ...

    async def get_multiple_accounts(self, addresses: Sequence[str]) -> list[AccountInfo | None]: ...

    async def get_mint_state(self, mint: str) -> MintState | None: ...

    async def get_transaction(self, signature: str) -> dict[str, Any] | None: ...

    async def close(self) -> None: ...


@runtime_checkable
class EventStreamProvider(Protocol):
    """Push access to chain activity.

    Implementations must yield forever, transparently recovering from
    disconnection. A dropped connection is an internal event to recover from and
    report, never an exception the consumer has to catch to stay alive.
    """

    @property
    def provider_name(self) -> str: ...

    @property
    def state(self) -> ConnectionState: ...

    def status(self) -> ProviderStatus: ...

    def stream(self) -> AsyncIterator[RawEvent]: ...

    async def stop(self) -> None: ...
