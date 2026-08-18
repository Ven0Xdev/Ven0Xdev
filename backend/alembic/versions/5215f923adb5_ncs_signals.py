"""ncs signals

Nexora Conviction Signal — a new, versioned, append-only signal table
distinct from the existing `signals` table. One row per (ticker,
timeframe, closed bar); the unique index on (ticker_symbol, timeframe,
bar_ts) is the anti-repaint guarantee — services/signals/ncs.py never
writes a second row for a bar it already evaluated.

Revision ID: 5215f923adb5
Revises: 09bfaea134f2
Create Date: 2026-08-18 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5215f923adb5'
down_revision: Union[str, Sequence[str], None] = '09bfaea134f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'ncs_signals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('timeframe', sa.String(length=8), nullable=False),
        sa.Column('bar_ts', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('raw_verdict', sa.String(length=16), nullable=False),
        sa.Column('confirmed_verdict', sa.String(length=16), nullable=True),
        sa.Column('fired', sa.Boolean(), nullable=False),
        sa.Column('composite_score', sa.Float(), nullable=False),
        sa.Column('confidence_pct', sa.Float(), nullable=False),
        sa.Column('risk_score', sa.Float(), nullable=False),
        sa.Column('explanation', sa.String(), nullable=False),
        sa.Column('components', sa.JSON(), nullable=False),
        sa.Column('vetoed', sa.Boolean(), nullable=False),
        sa.Column('veto_reason', sa.String(), nullable=True),
        sa.Column('version', sa.String(length=32), nullable=False),
        sa.Column('data_source', sa.String(length=32), nullable=False),
        sa.Column('data_mode', sa.String(length=16), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ncs_signals_ticker_symbol', 'ncs_signals', ['ticker_symbol'])
    op.create_index('ix_ncs_signals_bar_ts', 'ncs_signals', ['bar_ts'])
    op.create_index(
        'ix_ncs_signals_ticker_tf_created', 'ncs_signals', ['ticker_symbol', 'timeframe', 'created_at']
    )
    op.create_index(
        'ux_ncs_signals_ticker_tf_bar', 'ncs_signals', ['ticker_symbol', 'timeframe', 'bar_ts'], unique=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('ncs_signals')
