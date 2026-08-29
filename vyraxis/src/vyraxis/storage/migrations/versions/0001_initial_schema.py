"""initial phase0 phase1 schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-29 16:07:50.655464+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ingest_checkpoints",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("stream", sa.String(length=96), nullable=False),
        sa.Column("last_slot", sa.BigInteger(), nullable=True),
        sa.Column("last_signature", sa.String(length=96), nullable=True),
        sa.Column("events_ingested", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ingest_checkpoints")),
        sa.UniqueConstraint("stream", name="uq_ingest_checkpoints_stream"),
        sa.UniqueConstraint("stream", name=op.f("uq_ingest_checkpoints_stream")),
    )
    op.create_table(
        "provider_health_snapshots",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("component", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "HEALTHY",
                "DEGRADED",
                "UNHEALTHY",
                "UNKNOWN",
                name="health_status",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "connection_state",
            sa.Enum(
                "DISCONNECTED",
                "CONNECTING",
                "CONNECTED",
                "SUBSCRIBED",
                "RECONNECTING",
                "STOPPED",
                name="connection_state",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=True,
        ),
        sa.Column("observed_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_provider_health_snapshots")),
    )
    op.create_index(
        "ix_provider_health_snapshots_component_observed_at",
        "provider_health_snapshots",
        ["component", "observed_at"],
        unique=False,
    )
    op.create_table(
        "system_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("occurred_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "level",
            sa.Enum(
                "INFO",
                "WARNING",
                "ERROR",
                "CRITICAL",
                name="system_event_level",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("event", sa.String(length=128), nullable=False),
        sa.Column("instance", sa.String(length=64), nullable=False),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_system_events")),
    )
    op.create_index(
        "ix_system_events_category_occurred_at",
        "system_events",
        ["category", "occurred_at"],
        unique=False,
    )
    op.create_index("ix_system_events_occurred_at", "system_events", ["occurred_at"], unique=False)
    op.create_table(
        "tokens",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("mint", sa.String(length=44), nullable=False),
        sa.Column("token_program", sa.String(length=44), nullable=True),
        sa.Column("decimals", sa.SmallInteger(), nullable=True),
        sa.Column("supply_raw", sa.Numeric(precision=40, scale=0), nullable=True),
        sa.Column("mint_authority", sa.String(length=44), nullable=True),
        sa.Column("freeze_authority", sa.String(length=44), nullable=True),
        sa.Column("is_initialized", sa.Boolean(), nullable=True),
        sa.Column("chain_state_checked_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("symbol", sa.String(length=64), nullable=True),
        sa.Column("first_seen_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("first_seen_slot", sa.BigInteger(), nullable=True),
        sa.Column("created_block_time", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("discovery_source", sa.String(length=64), nullable=False),
        sa.Column("last_event_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("event_count", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tokens")),
        sa.UniqueConstraint("mint", name=op.f("uq_tokens_mint")),
    )
    op.create_index("ix_tokens_first_seen_at", "tokens", ["first_seen_at"], unique=False)
    op.create_index("ix_tokens_last_event_at", "tokens", ["last_event_at"], unique=False)
    op.create_table(
        "wallets",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("address", sa.String(length=44), nullable=False),
        sa.Column("first_seen_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("last_seen_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("event_count", sa.BigInteger(), nullable=False),
        sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_wallets")),
        sa.UniqueConstraint("address", name=op.f("uq_wallets_address")),
    )
    op.create_index("ix_wallets_last_seen_at", "wallets", ["last_seen_at"], unique=False)
    op.create_table(
        "pools",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("address", sa.String(length=44), nullable=False),
        sa.Column("dex", sa.String(length=48), nullable=False),
        sa.Column("program_id", sa.String(length=44), nullable=False),
        sa.Column("base_mint", sa.String(length=44), nullable=True),
        sa.Column("quote_mint", sa.String(length=44), nullable=True),
        sa.Column("base_vault", sa.String(length=44), nullable=True),
        sa.Column("quote_vault", sa.String(length=44), nullable=True),
        sa.Column("lp_mint", sa.String(length=44), nullable=True),
        sa.Column("first_seen_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("first_seen_slot", sa.BigInteger(), nullable=True),
        sa.Column("created_block_time", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("discovery_source", sa.String(length=64), nullable=False),
        sa.Column("last_event_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("event_count", sa.BigInteger(), nullable=False),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["base_mint"],
            ["tokens.mint"],
            name=op.f("fk_pools_base_mint_tokens"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["quote_mint"],
            ["tokens.mint"],
            name=op.f("fk_pools_quote_mint_tokens"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pools")),
        sa.UniqueConstraint("address", name=op.f("uq_pools_address")),
    )
    op.create_index(
        "ix_pools_base_mint_first_seen_at", "pools", ["base_mint", "first_seen_at"], unique=False
    )
    op.create_index("ix_pools_dex_first_seen_at", "pools", ["dex", "first_seen_at"], unique=False)
    op.create_table(
        "market_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("dedup_key", sa.String(length=200), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "TOKEN_CREATED",
                "POOL_CREATED",
                "SWAP",
                "LIQUIDITY_ADDED",
                "LIQUIDITY_REMOVED",
                "TRANSFER",
                "AUTHORITY_CHANGED",
                "MINT",
                "BURN",
                "UNCLASSIFIED",
                name="event_kind",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "decode_status",
            sa.Enum(
                "DECODED",
                "PARTIAL",
                "UNDECODED",
                name="decode_status",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("stream", sa.String(length=64), nullable=False),
        sa.Column("slot", sa.BigInteger(), nullable=False),
        sa.Column("signature", sa.String(length=96), nullable=True),
        sa.Column("block_time", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("observed_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("ingest_latency_ms", sa.Integer(), nullable=True),
        sa.Column("program_id", sa.String(length=44), nullable=True),
        sa.Column("token_mint", sa.String(length=44), nullable=True),
        sa.Column("pool_address", sa.String(length=44), nullable=True),
        sa.Column("actor_wallet", sa.String(length=44), nullable=True),
        sa.Column(
            "direction",
            sa.Enum(
                "BUY",
                "SELL",
                name="trade_direction",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=True,
        ),
        sa.Column("base_amount_raw", sa.Numeric(precision=40, scale=0), nullable=True),
        sa.Column("quote_amount_raw", sa.Numeric(precision=40, scale=0), nullable=True),
        sa.Column("reason_codes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["pool_address"],
            ["pools.address"],
            name=op.f("fk_market_events_pool_address_pools"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["token_mint"],
            ["tokens.mint"],
            name=op.f("fk_market_events_token_mint_tokens"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_market_events")),
        sa.UniqueConstraint("dedup_key", name=op.f("uq_market_events_dedup_key")),
    )
    op.create_index(
        "ix_market_events_kind_observed_at", "market_events", ["kind", "observed_at"], unique=False
    )
    op.create_index(
        "ix_market_events_pool_address_observed_at",
        "market_events",
        ["pool_address", "observed_at"],
        unique=False,
    )
    op.create_index("ix_market_events_signature", "market_events", ["signature"], unique=False)
    op.create_index("ix_market_events_slot", "market_events", ["slot"], unique=False)
    op.create_index(
        "ix_market_events_token_mint_observed_at",
        "market_events",
        ["token_mint", "observed_at"],
        unique=False,
    )
    op.create_table(
        "observations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("token_mint", sa.String(length=44), nullable=False),
        sa.Column("pool_address", sa.String(length=44), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "DISCOVERY",
                "HORIZON",
                name="observation_kind",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING",
                "CAPTURED",
                "MISSED",
                "FAILED",
                name="observation_status",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("anchor_observation_id", sa.BigInteger(), nullable=True),
        sa.Column("horizon_seconds", sa.Integer(), nullable=True),
        sa.Column("due_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("captured_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("slot", sa.BigInteger(), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("failure_reason", sa.String(length=200), nullable=True),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["anchor_observation_id"],
            ["observations.id"],
            name=op.f("fk_observations_anchor_observation_id_observations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["pool_address"],
            ["pools.address"],
            name=op.f("fk_observations_pool_address_pools"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["token_mint"],
            ["tokens.mint"],
            name=op.f("fk_observations_token_mint_tokens"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_observations")),
    )
    op.create_index(
        "ix_observations_due_at_status", "observations", ["due_at", "status"], unique=False
    )
    op.create_index(
        "ix_observations_token_mint_due_at", "observations", ["token_mint", "due_at"], unique=False
    )
    op.create_index(
        "uq_observations_anchor_horizon",
        "observations",
        ["anchor_observation_id", "horizon_seconds"],
        unique=True,
        postgresql_where=sa.text("kind = 'HORIZON'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_observations_anchor_horizon",
        table_name="observations",
        postgresql_where=sa.text("kind = 'HORIZON'"),
    )
    op.drop_index("ix_observations_token_mint_due_at", table_name="observations")
    op.drop_index("ix_observations_due_at_status", table_name="observations")
    op.drop_table("observations")
    op.drop_index("ix_market_events_token_mint_observed_at", table_name="market_events")
    op.drop_index("ix_market_events_slot", table_name="market_events")
    op.drop_index("ix_market_events_signature", table_name="market_events")
    op.drop_index("ix_market_events_pool_address_observed_at", table_name="market_events")
    op.drop_index("ix_market_events_kind_observed_at", table_name="market_events")
    op.drop_table("market_events")
    op.drop_index("ix_pools_dex_first_seen_at", table_name="pools")
    op.drop_index("ix_pools_base_mint_first_seen_at", table_name="pools")
    op.drop_table("pools")
    op.drop_index("ix_wallets_last_seen_at", table_name="wallets")
    op.drop_table("wallets")
    op.drop_index("ix_tokens_last_event_at", table_name="tokens")
    op.drop_index("ix_tokens_first_seen_at", table_name="tokens")
    op.drop_table("tokens")
    op.drop_index("ix_system_events_occurred_at", table_name="system_events")
    op.drop_index("ix_system_events_category_occurred_at", table_name="system_events")
    op.drop_table("system_events")
    op.drop_index(
        "ix_provider_health_snapshots_component_observed_at", table_name="provider_health_snapshots"
    )
    op.drop_table("provider_health_snapshots")
    op.drop_table("ingest_checkpoints")
