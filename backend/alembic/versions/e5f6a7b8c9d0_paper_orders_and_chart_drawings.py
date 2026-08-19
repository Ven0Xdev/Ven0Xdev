"""paper_orders + chart_drawings

Adds the order-lifecycle table backing the chart Order Ticket (market/
limit/stop/take_profit/stop_loss, OCO brackets, idempotency — see
services/paper_trading/orders.py) and the chart-drawing persistence table
(trendline/hline/vline/ray/rectangle/fibonacci/text/arrow — see
app/api/v1/endpoints/chart_drawings.py). Both purely additive.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'paper_orders',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('paper_trading_accounts.id'), nullable=False),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('side', sa.String(length=8), nullable=False),
        sa.Column('order_type', sa.String(length=16), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('limit_price', sa.Float(), nullable=True),
        sa.Column('stop_price', sa.Float(), nullable=True),
        sa.Column('bracket_take_profit', sa.Float(), nullable=True),
        sa.Column('bracket_stop_loss', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('regular_hours_only', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('filled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('filled_price', sa.Float(), nullable=True),
        sa.Column('rejected_reason', sa.String(), nullable=True),
        sa.Column('cancelled_reason', sa.String(), nullable=True),
        sa.Column('idempotency_key', sa.String(length=64), nullable=False),
        sa.Column('origin', sa.String(length=16), nullable=False),
        sa.Column('position_id', sa.Integer(), sa.ForeignKey('paper_positions.id'), nullable=True),
        sa.Column('oco_group_id', sa.String(length=36), nullable=True),
        sa.Column('ncs_signal_id', sa.Integer(), sa.ForeignKey('ncs_signals.id'), nullable=True),
        sa.Column('data_source', sa.String(length=32), nullable=False),
        sa.Column('data_mode', sa.String(length=16), nullable=False),
    )
    op.create_index('ix_paper_orders_account_id', 'paper_orders', ['account_id'])
    op.create_index('ix_paper_orders_ticker_symbol', 'paper_orders', ['ticker_symbol'])
    op.create_index('ix_paper_orders_status', 'paper_orders', ['status'])
    op.create_index('ix_paper_orders_position_id', 'paper_orders', ['position_id'])
    op.create_index('ix_paper_orders_oco_group_id', 'paper_orders', ['oco_group_id'])
    op.create_index('ux_paper_orders_account_idempotency', 'paper_orders', ['account_id', 'idempotency_key'], unique=True)
    op.create_index('ix_paper_orders_account_status', 'paper_orders', ['account_id', 'status'])

    op.create_table(
        'chart_drawings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('timeframe', sa.String(length=8), nullable=False),
        sa.Column('drawing_type', sa.String(length=24), nullable=False),
        sa.Column('data', sa.JSON(), nullable=False),
        sa.Column('locked', sa.Boolean(), nullable=False),
        sa.Column('hidden', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_chart_drawings_user_id', 'chart_drawings', ['user_id'])
    op.create_index('ix_chart_drawings_ticker_symbol', 'chart_drawings', ['ticker_symbol'])
    op.create_index('ix_chart_drawings_owner_scope', 'chart_drawings', ['user_id', 'ticker_symbol', 'timeframe'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_chart_drawings_owner_scope', table_name='chart_drawings')
    op.drop_index('ix_chart_drawings_ticker_symbol', table_name='chart_drawings')
    op.drop_index('ix_chart_drawings_user_id', table_name='chart_drawings')
    op.drop_table('chart_drawings')

    op.drop_index('ix_paper_orders_account_status', table_name='paper_orders')
    op.drop_index('ux_paper_orders_account_idempotency', table_name='paper_orders')
    op.drop_index('ix_paper_orders_oco_group_id', table_name='paper_orders')
    op.drop_index('ix_paper_orders_position_id', table_name='paper_orders')
    op.drop_index('ix_paper_orders_status', table_name='paper_orders')
    op.drop_index('ix_paper_orders_ticker_symbol', table_name='paper_orders')
    op.drop_index('ix_paper_orders_account_id', table_name='paper_orders')
    op.drop_table('paper_orders')
