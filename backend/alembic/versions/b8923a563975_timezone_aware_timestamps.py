"""timezone-aware timestamps

Every DateTime column becomes DateTime(timezone=True) (Postgres: TIMESTAMPTZ)
so timestamps round-trip as timezone-aware UTC instead of ambiguous naive
values — see app/db/types.py's UTCDateTime docstring for why. Existing data
was always written as UTC by convention (datetime.utcnow()), so the type
change reinterprets each naive value AT TIME ZONE 'UTC' rather than relying
on the session timezone. Also adds users.timezone, the IANA/preset display
preference.

Revision ID: b8923a563975
Revises: dd1d83f0b571
Create Date: 2026-08-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8923a563975'
down_revision: Union[str, Sequence[str], None] = 'dd1d83f0b571'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column, nullable) triples whose type changes from DateTime to
# DateTime(timezone=True). Nullability mirrors each column's current model
# definition exactly — alter_column needs it to preserve the NOT NULL
# constraint through the type change instead of silently dropping it.
_TZ_COLUMNS = [
    ("users", "created_at", False),
    ("alert_rules", "created_at", False),
    ("alert_rules", "last_fired_at", True),
    ("alert_events", "fired_at", False),
    ("watchlist_items", "added_at", False),
    ("portfolio_positions", "opened_at", False),
    ("paper_trading_accounts", "created_at", False),
    ("paper_positions", "opened_at", False),
    ("paper_positions", "closed_at", True),
    ("backtest_results", "start_date", False),
    ("backtest_results", "end_date", False),
    ("backtest_results", "created_at", False),
    ("backtest_trades", "entry_ts", False),
    ("backtest_trades", "exit_ts", True),
    ("scan_cycles", "started_at", False),
    ("scan_cycles", "finished_at", True),
    ("predictions", "created_at", False),
    ("outcomes", "evaluated_at", False),
    ("signals", "created_at", False),
    ("signal_events", "created_at", False),
    ("trades", "executed_at", False),
    ("tickers", "created_at", False),
    ("ohlcv_bars", "ts", False),
    ("model_versions", "trained_at", False),
    ("edgar_company_facts", "last_filing_date", True),
    ("edgar_company_facts", "fetched_at", False),
    ("assets", "created_at", False),
    ("chat_sessions", "created_at", False),
    ("chat_messages", "created_at", False),
    ("news_items", "published_at", False),
]


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('timezone', sa.String(length=64), nullable=True))

    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    for table, column, nullable in _TZ_COLUMNS:
        with op.batch_alter_table(table, schema=None) as batch_op:
            kwargs = {"postgresql_using": f"{column} AT TIME ZONE 'UTC'"} if is_postgres else {}
            batch_op.alter_column(
                column,
                existing_type=sa.DateTime(),
                type_=sa.DateTime(timezone=True),
                existing_nullable=nullable,
                **kwargs,
            )


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    for table, column, nullable in reversed(_TZ_COLUMNS):
        with op.batch_alter_table(table, schema=None) as batch_op:
            kwargs = {"postgresql_using": f"{column} AT TIME ZONE 'UTC'"} if is_postgres else {}
            batch_op.alter_column(
                column,
                existing_type=sa.DateTime(timezone=True),
                type_=sa.DateTime(),
                existing_nullable=nullable,
                **kwargs,
            )

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('timezone')
