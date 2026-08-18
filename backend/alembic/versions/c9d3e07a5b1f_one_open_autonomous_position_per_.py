"""one open autonomous position per account/ticker

Closes a TOCTOU race an independent review found in
services/paper_trading/autonomous.py: two near-concurrent autonomous
evaluations for the same account/ticker could each read "no open
position yet" before either committed, and both open one. Scoped to
opened_by='autonomous' only — manual trading's existing behavior (a
user may already hold more than one open position on the same ticker)
is deliberately unchanged.

Revision ID: c9d3e07a5b1f
Revises: b7f2a83c1d05
Create Date: 2026-08-19 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d3e07a5b1f'
down_revision: Union[str, Sequence[str], None] = 'b7f2a83c1d05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        'ux_paper_positions_one_open_autonomous_per_account_ticker',
        'paper_positions',
        ['account_id', 'ticker_symbol'],
        unique=True,
        postgresql_where=sa.text("status = 'open' AND opened_by = 'autonomous'"),
        sqlite_where=sa.text("status = 'open' AND opened_by = 'autonomous'"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ux_paper_positions_one_open_autonomous_per_account_ticker', table_name='paper_positions')
