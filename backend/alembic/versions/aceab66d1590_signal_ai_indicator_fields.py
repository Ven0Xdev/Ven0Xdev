"""signal ai indicator fields

Revision ID: aceab66d1590
Revises: cf153aaf7ad5
Create Date: 2026-08-05 23:27:06.001599

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aceab66d1590'
down_revision: Union[str, Sequence[str], None] = 'cf153aaf7ad5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('signals', sa.Column('timeframe', sa.String(length=8), nullable=False, server_default='1D'))
    op.add_column('signals', sa.Column('signal_type', sa.String(length=24), nullable=True))
    op.add_column('signals', sa.Column('explanation', sa.String(), nullable=True))
    op.add_column('signals', sa.Column('market_regime', sa.String(length=24), nullable=True))
    op.add_column('signals', sa.Column('multi_timeframe_agreement', sa.Boolean(), nullable=True))
    op.add_column('signals', sa.Column('patterns_detected', sa.JSON(), nullable=False, server_default='[]'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('signals', 'patterns_detected')
    op.drop_column('signals', 'multi_timeframe_agreement')
    op.drop_column('signals', 'market_regime')
    op.drop_column('signals', 'explanation')
    op.drop_column('signals', 'signal_type')
    op.drop_column('signals', 'timeframe')
