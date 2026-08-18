"""autonomous paper trading

Adds the gating primitives for Phase C (services/paper_trading/
autonomous.py): a platform-wide emergency stop
(platform_settings.autonomous_trading_paused), a per-simulation opt-in
(paper_trading_accounts.autonomous_trading_enabled), and provenance on
PaperPosition (opened_by, ncs_signal_id) so an autonomous open is never
indistinguishable from one a user placed themselves. All additive with
safe defaults — no existing row's meaning changes.

Revision ID: b7f2a83c1d05
Revises: a1c4d9e2f6b3
Create Date: 2026-08-18 19:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7f2a83c1d05'
down_revision: Union[str, Sequence[str], None] = 'a1c4d9e2f6b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'platform_settings',
        sa.Column('autonomous_trading_paused', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'paper_trading_accounts',
        sa.Column('autonomous_trading_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'paper_positions',
        sa.Column('opened_by', sa.String(length=16), nullable=False, server_default='manual'),
    )
    op.add_column(
        'paper_positions',
        sa.Column('ncs_signal_id', sa.Integer(), sa.ForeignKey('ncs_signals.id'), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('paper_positions', 'ncs_signal_id')
    op.drop_column('paper_positions', 'opened_by')
    op.drop_column('paper_trading_accounts', 'autonomous_trading_enabled')
    op.drop_column('platform_settings', 'autonomous_trading_paused')
