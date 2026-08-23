"""paper trading simulations

Turns PaperTradingAccount from "one row per user" into "one row per
simulation, many per user, at most one active" — adds simulation_number,
label, is_active, archived_at, drops the old unique(user_id) constraint,
and adds a partial unique index enforcing at most one active simulation
per user. Existing rows (the one-per-user account created under the old
model) become simulation #1, active.

Revision ID: 09bfaea134f2
Revises: 327d3acc37c3
Create Date: 2026-08-18 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '09bfaea134f2'
down_revision: Union[str, Sequence[str], None] = '327d3acc37c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    with op.batch_alter_table('paper_trading_accounts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('simulation_number', sa.Integer(), nullable=False, server_default='1'))
        batch_op.add_column(sa.Column('label', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))

    # Every pre-existing row was implicitly "the" account for its user
    # under the old one-per-user model — it becomes simulation #1, active
    # (both already true via the server defaults above, so nothing further
    # to backfill).

    # Drop the old unique(user_id) index so a user can have more than one
    # (archived) simulation row. The original column was declared
    # `unique=True, index=True` together, which SQLAlchemy/Postgres
    # realized as a single unique *index* named ix_paper_trading_accounts_
    # user_id (confirmed via \d on the live table), not a separate named
    # constraint — verified directly rather than assumed. Index drop/create
    # doesn't need SQLite's batch-table-recreate mode (that's only required
    # for column add/drop/alter).
    op.drop_index('ix_paper_trading_accounts_user_id', table_name='paper_trading_accounts')

    op.create_index(
        'ux_paper_trading_accounts_one_active_per_user',
        'paper_trading_accounts',
        ['user_id'],
        unique=True,
        sqlite_where=sa.text('is_active IS 1') if not is_postgres else None,
        postgresql_where=sa.text('is_active IS TRUE') if is_postgres else None,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ux_paper_trading_accounts_one_active_per_user', table_name='paper_trading_accounts')

    op.create_index(
        'ix_paper_trading_accounts_user_id',
        'paper_trading_accounts',
        ['user_id'],
        unique=True,
    )

    with op.batch_alter_table('paper_trading_accounts', schema=None) as batch_op:
        batch_op.drop_column('archived_at')
        batch_op.drop_column('is_active')
        batch_op.drop_column('label')
        batch_op.drop_column('simulation_number')
