"""shadow positions

Shadow observation — passive, hypothetical tracking of what a fired NCS
signal would have returned, using real closed-bar prices only. Never
the paper trading engine, never labeled "NEXORA INTERNAL PAPER". One
row per fired NcsSignal (the unique index on ncs_signal_id is that
one-shadow-per-fired-signal guarantee).

Revision ID: a1c4d9e2f6b3
Revises: e630670ff4a0
Create Date: 2026-08-18 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c4d9e2f6b3'
down_revision: Union[str, Sequence[str], None] = 'e630670ff4a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'shadow_positions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ncs_signal_id', sa.Integer(), sa.ForeignKey('ncs_signals.id'), nullable=False),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('timeframe', sa.String(length=8), nullable=False),
        sa.Column('direction', sa.String(length=8), nullable=False),
        sa.Column('entry_bar_ts', sa.DateTime(timezone=True), nullable=False),
        sa.Column('entry_price', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=8), nullable=False, server_default='OPEN'),
        sa.Column('holding_bars_elapsed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('mfe_pct', sa.Float(), nullable=False, server_default='0'),
        sa.Column('mae_pct', sa.Float(), nullable=False, server_default='0'),
        sa.Column('exit_bar_ts', sa.DateTime(timezone=True), nullable=True),
        sa.Column('exit_price', sa.Float(), nullable=True),
        sa.Column('exit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('exit_reason', sa.String(length=32), nullable=True),
        sa.Column('pnl_pct', sa.Float(), nullable=True),
        sa.Column('version', sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_shadow_positions_ticker_symbol', 'shadow_positions', ['ticker_symbol'])
    op.create_index('ix_shadow_positions_status', 'shadow_positions', ['status'])
    op.create_index(
        'ix_shadow_positions_ticker_tf_status', 'shadow_positions', ['ticker_symbol', 'timeframe', 'status']
    )
    op.create_index(
        'ux_shadow_positions_ncs_signal', 'shadow_positions', ['ncs_signal_id'], unique=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('shadow_positions')
