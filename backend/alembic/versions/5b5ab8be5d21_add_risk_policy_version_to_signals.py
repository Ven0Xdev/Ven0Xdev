"""add risk policy version to signals

Additive, backfill-safe: a NOT NULL column on a table that may already
have rows needs a server_default so existing rows get a real value
instead of the migration failing outright (same pattern as
aceab66d1590's timeframe/patterns_detected columns).

Revision ID: 5b5ab8be5d21
Revises: c7debfca52a5
Create Date: 2026-08-14 19:02:50.259863

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b5ab8be5d21'
down_revision: Union[str, Sequence[str], None] = 'c7debfca52a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'signals',
        sa.Column('risk_policy_version', sa.String(length=48), nullable=False, server_default='unversioned'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('signals', 'risk_policy_version')
