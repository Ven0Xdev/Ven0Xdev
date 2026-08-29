"""VYRAXIS relational schema (Phase 0/1 subset).

Only entities the data engine actually writes are defined here. Tables for
later phases (features, scores, decisions, backtests, models) are specified in
``docs/DATA_MODEL.md`` and will be added by the migration that introduces the
code writing to them - an empty table nothing populates is a claim of progress
that has not been earned.

Two conventions run through every table:

* ``observed_at`` is VYRAXIS wall-clock at ingestion; ``block_time`` is chain
  time and is nullable because the chain does not always supply it. Any
  point-in-time reconstruction must filter on ``observed_at``.
* Monetary and token quantities are NUMERIC. No DOUBLE PRECISION column exists
  anywhere in this schema.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from vyraxis.core.enums import (
    ConnectionState,
    DecodeStatus,
    EventKind,
    HealthStatus,
    ObservationKind,
    ObservationStatus,
    SystemEventLevel,
    TradeDirection,
)
from vyraxis.storage.base import (
    ADDRESS_LEN,
    SIGNATURE_LEN,
    Base,
    Json,
    RawAmount,
    UtcTimestamp,
    string_enum,
    utc_now_server_default,
)


class Token(Base):
    """An SPL mint VYRAXIS has observed.

    Rows are created on first sighting with whatever is known at that instant;
    on-chain state (decimals, authorities, supply) is filled in by a subsequent
    RPC read and stamped with ``chain_state_checked_at`` so downstream code can
    tell "authority is None" from "we have not looked yet".
    """

    __tablename__ = "tokens"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    mint: Mapped[str] = mapped_column(String(ADDRESS_LEN), nullable=False, unique=True)
    token_program: Mapped[str | None] = mapped_column(String(ADDRESS_LEN))

    decimals: Mapped[int | None] = mapped_column(SmallInteger)
    supply_raw: Mapped[Decimal | None] = mapped_column(RawAmount)
    mint_authority: Mapped[str | None] = mapped_column(String(ADDRESS_LEN))
    freeze_authority: Mapped[str | None] = mapped_column(String(ADDRESS_LEN))
    is_initialized: Mapped[bool | None] = mapped_column(Boolean)
    chain_state_checked_at: Mapped[datetime | None] = mapped_column(UtcTimestamp)

    name: Mapped[str | None] = mapped_column(String(200))
    symbol: Mapped[str | None] = mapped_column(String(64))

    first_seen_at: Mapped[datetime] = mapped_column(UtcTimestamp, nullable=False)
    first_seen_slot: Mapped[int | None] = mapped_column(BigInteger)
    created_block_time: Mapped[datetime | None] = mapped_column(UtcTimestamp)
    discovery_source: Mapped[str] = mapped_column(String(64), nullable=False)

    last_event_at: Mapped[datetime | None] = mapped_column(UtcTimestamp)
    event_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        UtcTimestamp, nullable=False, server_default=utc_now_server_default()
    )

    pools: Mapped[list[Pool]] = relationship(
        back_populates="base_token",
        primaryjoin="Token.mint == foreign(Pool.base_mint)",
        viewonly=True,
    )

    __table_args__ = (
        Index("ix_tokens_first_seen_at", "first_seen_at"),
        Index("ix_tokens_last_event_at", "last_event_at"),
    )


class Pool(Base):
    """A liquidity pool / market account on some DEX program."""

    __tablename__ = "pools"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    address: Mapped[str] = mapped_column(String(ADDRESS_LEN), nullable=False, unique=True)
    dex: Mapped[str] = mapped_column(String(48), nullable=False)
    program_id: Mapped[str] = mapped_column(String(ADDRESS_LEN), nullable=False)

    base_mint: Mapped[str | None] = mapped_column(
        String(ADDRESS_LEN), ForeignKey("tokens.mint", ondelete="RESTRICT")
    )
    quote_mint: Mapped[str | None] = mapped_column(
        String(ADDRESS_LEN), ForeignKey("tokens.mint", ondelete="RESTRICT")
    )
    base_vault: Mapped[str | None] = mapped_column(String(ADDRESS_LEN))
    quote_vault: Mapped[str | None] = mapped_column(String(ADDRESS_LEN))
    lp_mint: Mapped[str | None] = mapped_column(String(ADDRESS_LEN))

    first_seen_at: Mapped[datetime] = mapped_column(UtcTimestamp, nullable=False)
    first_seen_slot: Mapped[int | None] = mapped_column(BigInteger)
    created_block_time: Mapped[datetime | None] = mapped_column(UtcTimestamp)
    discovery_source: Mapped[str] = mapped_column(String(64), nullable=False)

    last_event_at: Mapped[datetime | None] = mapped_column(UtcTimestamp)
    event_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    raw: Mapped[dict[str, Any] | None] = mapped_column(Json)

    created_at: Mapped[datetime] = mapped_column(
        UtcTimestamp, nullable=False, server_default=utc_now_server_default()
    )

    base_token: Mapped[Token | None] = relationship(
        back_populates="pools",
        primaryjoin="foreign(Pool.base_mint) == Token.mint",
        viewonly=True,
    )

    __table_args__ = (
        Index("ix_pools_base_mint_first_seen_at", "base_mint", "first_seen_at"),
        Index("ix_pools_dex_first_seen_at", "dex", "first_seen_at"),
    )


class Wallet(Base):
    """A wallet address VYRAXIS has seen act on chain.

    Phase 1 records existence and activity counters only. Behavioural scoring
    belongs to the wallet-intelligence phase and is deliberately absent: a
    column named ``is_smart_money`` that nothing computes would be a lie.
    """

    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    address: Mapped[str] = mapped_column(String(ADDRESS_LEN), nullable=False, unique=True)
    first_seen_at: Mapped[datetime] = mapped_column(UtcTimestamp, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(UtcTimestamp, nullable=False)
    event_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    labels: Mapped[dict[str, Any] | None] = mapped_column(Json)

    __table_args__ = (Index("ix_wallets_last_seen_at", "last_seen_at"),)


class MarketEvent(Base):
    """A normalized on-chain occurrence.

    ``dedup_key`` is the authoritative idempotency key and is UNIQUE: the
    ingestion path inserts with ``ON CONFLICT DO NOTHING``, so replaying a
    WebSocket backlog or running two ingest workers cannot double-count.
    """

    __tablename__ = "market_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    dedup_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)

    kind: Mapped[EventKind] = mapped_column(string_enum(EventKind, "event_kind"), nullable=False)
    decode_status: Mapped[DecodeStatus] = mapped_column(
        string_enum(DecodeStatus, "decode_status"), nullable=False
    )

    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    stream: Mapped[str] = mapped_column(String(64), nullable=False)

    slot: Mapped[int] = mapped_column(BigInteger, nullable=False)
    signature: Mapped[str | None] = mapped_column(String(SIGNATURE_LEN))
    #: Chain-reported time. NULL when the provider did not supply one.
    block_time: Mapped[datetime | None] = mapped_column(UtcTimestamp)
    #: When VYRAXIS received this. Never NULL; the only leak-safe ordering key.
    observed_at: Mapped[datetime] = mapped_column(UtcTimestamp, nullable=False)
    ingest_latency_ms: Mapped[int | None] = mapped_column(Integer)

    program_id: Mapped[str | None] = mapped_column(String(ADDRESS_LEN))
    token_mint: Mapped[str | None] = mapped_column(
        String(ADDRESS_LEN), ForeignKey("tokens.mint", ondelete="RESTRICT")
    )
    pool_address: Mapped[str | None] = mapped_column(
        String(ADDRESS_LEN), ForeignKey("pools.address", ondelete="RESTRICT")
    )
    actor_wallet: Mapped[str | None] = mapped_column(String(ADDRESS_LEN))

    direction: Mapped[TradeDirection | None] = mapped_column(
        string_enum(TradeDirection, "trade_direction")
    )
    base_amount_raw: Mapped[Decimal | None] = mapped_column(RawAmount)
    quote_amount_raw: Mapped[Decimal | None] = mapped_column(RawAmount)

    reason_codes: Mapped[list[str] | None] = mapped_column(Json)
    raw: Mapped[dict[str, Any]] = mapped_column(Json, nullable=False)

    __table_args__ = (
        Index("ix_market_events_token_mint_observed_at", "token_mint", "observed_at"),
        Index("ix_market_events_pool_address_observed_at", "pool_address", "observed_at"),
        Index("ix_market_events_kind_observed_at", "kind", "observed_at"),
        Index("ix_market_events_slot", "slot"),
        Index("ix_market_events_signature", "signature"),
    )


class Observation(Base):
    """An immutable, timestamped snapshot about a token/pool.

    A DISCOVERY observation is written when a candidate is first seen. HORIZON
    observations are scheduled relative to it and are only ever filled with data
    captured at or after ``due_at``. Nothing back-fills a horizon row using data
    from a different moment - that is the single most important guarantee this
    table exists to provide.
    """

    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    token_mint: Mapped[str] = mapped_column(
        String(ADDRESS_LEN), ForeignKey("tokens.mint", ondelete="RESTRICT"), nullable=False
    )
    pool_address: Mapped[str | None] = mapped_column(
        String(ADDRESS_LEN), ForeignKey("pools.address", ondelete="RESTRICT")
    )

    kind: Mapped[ObservationKind] = mapped_column(
        string_enum(ObservationKind, "observation_kind"), nullable=False
    )
    status: Mapped[ObservationStatus] = mapped_column(
        string_enum(ObservationStatus, "observation_status"), nullable=False
    )

    anchor_observation_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("observations.id", ondelete="CASCADE")
    )
    horizon_seconds: Mapped[int | None] = mapped_column(Integer)

    #: Earliest instant this observation may legitimately be captured.
    due_at: Mapped[datetime] = mapped_column(UtcTimestamp, nullable=False)
    #: Instant it actually was captured. NULL while PENDING.
    captured_at: Mapped[datetime | None] = mapped_column(UtcTimestamp)
    slot: Mapped[int | None] = mapped_column(BigInteger)

    source: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(Json)
    failure_reason: Mapped[str | None] = mapped_column(String(200))

    created_at: Mapped[datetime] = mapped_column(
        UtcTimestamp, nullable=False, server_default=utc_now_server_default()
    )

    __table_args__ = (
        Index("ix_observations_due_at_status", "due_at", "status"),
        Index("ix_observations_token_mint_due_at", "token_mint", "due_at"),
        # One horizon row per (anchor, horizon). Partial so DISCOVERY rows,
        # which carry NULLs for both, are unaffected.
        Index(
            "uq_observations_anchor_horizon",
            "anchor_observation_id",
            "horizon_seconds",
            unique=True,
            postgresql_where=(text("kind = 'HORIZON'")),
        ),
    )


class ProviderHealthSnapshot(Base):
    """Point-in-time health of an external dependency."""

    __tablename__ = "provider_health_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    component: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[HealthStatus] = mapped_column(
        string_enum(HealthStatus, "health_status"), nullable=False
    )
    connection_state: Mapped[ConnectionState | None] = mapped_column(
        string_enum(ConnectionState, "connection_state")
    )
    observed_at: Mapped[datetime] = mapped_column(UtcTimestamp, nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    detail: Mapped[dict[str, Any] | None] = mapped_column(Json)

    __table_args__ = (
        Index("ix_provider_health_snapshots_component_observed_at", "component", "observed_at"),
    )


class SystemEvent(Base):
    """Durable record of notable system-level occurrences.

    Ingestion failures, reconnects, dropped events and integrity violations are
    written here as well as logged, so that an operator reading the database
    alone can reconstruct what the process experienced.
    """

    __tablename__ = "system_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    occurred_at: Mapped[datetime] = mapped_column(UtcTimestamp, nullable=False)
    level: Mapped[SystemEventLevel] = mapped_column(
        string_enum(SystemEventLevel, "system_event_level"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    event: Mapped[str] = mapped_column(String(128), nullable=False)
    instance: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[dict[str, Any] | None] = mapped_column(Json)

    __table_args__ = (
        Index("ix_system_events_occurred_at", "occurred_at"),
        Index("ix_system_events_category_occurred_at", "category", "occurred_at"),
    )


class IngestCheckpoint(Base):
    """Resume position for a stream, so a restart does not re-scan from zero."""

    __tablename__ = "ingest_checkpoints"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    stream: Mapped[str] = mapped_column(String(96), nullable=False, unique=True)
    last_slot: Mapped[int | None] = mapped_column(BigInteger)
    last_signature: Mapped[str | None] = mapped_column(String(SIGNATURE_LEN))
    events_ingested: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(UtcTimestamp, nullable=False)

    __table_args__ = (UniqueConstraint("stream", name="uq_ingest_checkpoints_stream"),)


__all__ = [
    "Base",
    "IngestCheckpoint",
    "MarketEvent",
    "Observation",
    "Pool",
    "ProviderHealthSnapshot",
    "SystemEvent",
    "Token",
    "Wallet",
]
