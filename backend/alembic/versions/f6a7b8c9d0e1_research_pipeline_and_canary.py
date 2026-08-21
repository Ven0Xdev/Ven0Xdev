"""historical research pipeline + research model registry + Canary

Adds the durable multi-year historical data store (historical_bars,
point_in_time_fundamentals, corporate_actions, historical_news_articles),
its resumable-backfill checkpoint table (backfill_checkpoints), the
research model registry (research_models, canary_decisions) with its own
state machine distinct from model_versions, and the fully separate
Research Canary paper-trading ledger (canary_account, canary_positions,
canary_orders) — never PaperTradingAccount/PaperPosition/PaperOrder.
Every table here is purely additive; nothing existing is touched.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'historical_bars',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('timeframe', sa.String(length=8), nullable=False),
        sa.Column('ts', sa.DateTime(timezone=True), nullable=False),
        sa.Column('open', sa.Float(), nullable=False),
        sa.Column('high', sa.Float(), nullable=False),
        sa.Column('low', sa.Float(), nullable=False),
        sa.Column('close', sa.Float(), nullable=False),
        sa.Column('volume', sa.Float(), nullable=False),
        sa.Column('adjusted', sa.Boolean(), nullable=False),
        sa.Column('session', sa.String(length=16), nullable=False),
        sa.Column('data_source', sa.String(length=32), nullable=False),
        sa.Column('feed', sa.String(length=16), nullable=False),
        sa.Column('ingested_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_historical_bars_ticker_symbol', 'historical_bars', ['ticker_symbol'])
    op.create_index('ix_historical_bars_symbol_tf_ts', 'historical_bars', ['ticker_symbol', 'timeframe', 'ts'])
    op.create_index(
        'ux_historical_bars_symbol_tf_ts', 'historical_bars', ['ticker_symbol', 'timeframe', 'ts'], unique=True,
    )

    op.create_table(
        'point_in_time_fundamentals',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('taxonomy', sa.String(length=16), nullable=False),
        sa.Column('concept', sa.String(length=64), nullable=False),
        sa.Column('unit', sa.String(length=16), nullable=False),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('filed_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('form', sa.String(length=16), nullable=True),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('ingested_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_pit_fundamentals_ticker_symbol', 'point_in_time_fundamentals', ['ticker_symbol'])
    op.create_index(
        'ix_pit_fundamentals_symbol_concept_filed', 'point_in_time_fundamentals',
        ['ticker_symbol', 'concept', 'filed_date'],
    )
    op.create_index(
        'ux_pit_fundamentals_identity', 'point_in_time_fundamentals',
        ['ticker_symbol', 'concept', 'period_end', 'filed_date'], unique=True,
    )

    op.create_table(
        'corporate_actions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('action_type', sa.String(length=16), nullable=False),
        sa.Column('ex_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ratio', sa.Float(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=True),
        sa.Column('data_source', sa.String(length=32), nullable=False),
        sa.Column('ingested_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_corporate_actions_ticker_symbol', 'corporate_actions', ['ticker_symbol'])
    op.create_index(
        'ux_corporate_actions_identity', 'corporate_actions', ['ticker_symbol', 'action_type', 'ex_date'], unique=True,
    )

    op.create_table(
        'historical_news_articles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('headline', sa.String(length=512), nullable=False),
        sa.Column('url', sa.String(length=1024), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('sentiment_score', sa.Float(), nullable=True),
        sa.Column('source', sa.String(length=64), nullable=False),
        sa.Column('data_source', sa.String(length=32), nullable=False),
        sa.Column('ingested_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_historical_news_ticker_symbol', 'historical_news_articles', ['ticker_symbol'])
    op.create_index('ix_historical_news_published_at', 'historical_news_articles', ['published_at'])
    op.create_index('ux_historical_news_identity', 'historical_news_articles', ['ticker_symbol', 'url'], unique=True)

    op.create_table(
        'backfill_checkpoints',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('provider', sa.String(length=32), nullable=False),
        sa.Column('dataset', sa.String(length=32), nullable=False),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('cursor', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('rows_ingested', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        'ux_backfill_checkpoint_identity', 'backfill_checkpoints', ['provider', 'dataset', 'ticker_symbol'], unique=True,
    )

    op.create_table(
        'research_models',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('family', sa.String(length=32), nullable=False),
        sa.Column('horizon', sa.String(length=16), nullable=False),
        sa.Column('version', sa.String(length=32), nullable=False),
        sa.Column('artifact_path', sa.String(length=255), nullable=True),
        sa.Column('state', sa.String(length=24), nullable=False),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('walk_forward_report', sa.JSON(), nullable=False),
        sa.Column('holdout_report', sa.JSON(), nullable=False),
        sa.Column('stress_test_report', sa.JSON(), nullable=False),
        sa.Column('leakage_checks', sa.JSON(), nullable=False),
        sa.Column('dataset_summary', sa.JSON(), nullable=False),
        sa.Column('trained_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('qualified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_research_models_family_horizon', 'research_models', ['family', 'horizon'])
    op.create_index('ix_research_models_state', 'research_models', ['state'])

    op.create_table(
        'canary_account',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('cash_balance', sa.Float(), nullable=False),
        sa.Column('starting_balance', sa.Float(), nullable=False),
        sa.Column('peak_equity', sa.Float(), nullable=False),
        sa.Column('auto_paused', sa.Boolean(), nullable=False),
        sa.Column('auto_pause_reason', sa.Text(), nullable=True),
        sa.Column('positions_opened_today', sa.Integer(), nullable=False),
        sa.Column('positions_opened_today_date', sa.String(length=10), nullable=True),
        sa.Column('realized_pnl_today_dollars', sa.Float(), nullable=False),
        sa.Column('realized_pnl_today_date', sa.String(length=10), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )

    op.create_table(
        'canary_positions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('research_model_id', sa.Integer(), sa.ForeignKey('research_models.id'), nullable=False),
        sa.Column('canary_decision_id', sa.Integer(), nullable=True),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('horizon', sa.String(length=16), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('avg_entry_price', sa.Float(), nullable=False),
        sa.Column('opened_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('stop_loss', sa.Float(), nullable=False),
        sa.Column('take_profit', sa.Float(), nullable=True),
        sa.Column('max_holding_until', sa.DateTime(timezone=True), nullable=False),
        sa.Column('risk_dollars_at_entry', sa.Float(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('exit_price', sa.Float(), nullable=True),
        sa.Column('exit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('exit_reason', sa.String(length=32), nullable=True),
        sa.Column('realized_pnl_dollars', sa.Float(), nullable=True),
        sa.Column('data_source', sa.String(length=32), nullable=False),
        sa.Column('data_mode', sa.String(length=16), nullable=False),
    )
    op.create_index('ix_canary_positions_ticker_symbol', 'canary_positions', ['ticker_symbol'])
    op.create_index('ix_canary_positions_research_model_id', 'canary_positions', ['research_model_id'])
    op.create_index('ix_canary_positions_status', 'canary_positions', ['status'])

    op.create_table(
        'canary_decisions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('research_model_id', sa.Integer(), sa.ForeignKey('research_models.id'), nullable=False),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('horizon', sa.String(length=16), nullable=False),
        sa.Column('evaluated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('verdict', sa.String(length=16), nullable=False),
        sa.Column('probability', sa.Float(), nullable=False),
        sa.Column('fired', sa.Boolean(), nullable=False),
        sa.Column('no_trade_reason', sa.Text(), nullable=True),
        sa.Column('red_team_passed', sa.Boolean(), nullable=True),
        sa.Column('red_team_veto_reason', sa.Text(), nullable=True),
        sa.Column('drift_status', sa.String(length=24), nullable=True),
        sa.Column('data_stale', sa.Boolean(), nullable=False),
        sa.Column('canary_position_id', sa.Integer(), sa.ForeignKey('canary_positions.id'), nullable=True),
    )
    op.create_index('ix_canary_decisions_ticker_symbol', 'canary_decisions', ['ticker_symbol'])
    op.create_index('ix_canary_decisions_research_model_id', 'canary_decisions', ['research_model_id'])

    op.create_foreign_key(
        'fk_canary_positions_decision', 'canary_positions', 'canary_decisions', ['canary_decision_id'], ['id'],
    )

    op.create_table(
        'canary_orders',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('research_model_id', sa.Integer(), sa.ForeignKey('research_models.id'), nullable=False),
        sa.Column('canary_decision_id', sa.Integer(), sa.ForeignKey('canary_decisions.id'), nullable=True),
        sa.Column('ticker_symbol', sa.String(length=16), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('idempotency_key', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('rejected_reason', sa.Text(), nullable=True),
        sa.Column('filled_price', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('canary_position_id', sa.Integer(), sa.ForeignKey('canary_positions.id'), nullable=True),
    )
    op.create_index('ix_canary_orders_ticker_symbol', 'canary_orders', ['ticker_symbol'])
    op.create_index('ux_canary_orders_idempotency_key', 'canary_orders', ['idempotency_key'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('canary_orders')
    op.drop_constraint('fk_canary_positions_decision', 'canary_positions', type_='foreignkey')
    op.drop_index('ix_canary_decisions_research_model_id', table_name='canary_decisions')
    op.drop_index('ix_canary_decisions_ticker_symbol', table_name='canary_decisions')
    op.drop_table('canary_decisions')
    op.drop_index('ix_canary_positions_status', table_name='canary_positions')
    op.drop_index('ix_canary_positions_research_model_id', table_name='canary_positions')
    op.drop_index('ix_canary_positions_ticker_symbol', table_name='canary_positions')
    op.drop_table('canary_positions')
    op.drop_table('canary_account')
    op.drop_index('ix_research_models_state', table_name='research_models')
    op.drop_index('ix_research_models_family_horizon', table_name='research_models')
    op.drop_table('research_models')
    op.drop_index('ux_backfill_checkpoint_identity', table_name='backfill_checkpoints')
    op.drop_table('backfill_checkpoints')
    op.drop_index('ux_historical_news_identity', table_name='historical_news_articles')
    op.drop_index('ix_historical_news_published_at', table_name='historical_news_articles')
    op.drop_index('ix_historical_news_ticker_symbol', table_name='historical_news_articles')
    op.drop_table('historical_news_articles')
    op.drop_index('ux_corporate_actions_identity', table_name='corporate_actions')
    op.drop_index('ix_corporate_actions_ticker_symbol', table_name='corporate_actions')
    op.drop_table('corporate_actions')
    op.drop_index('ux_pit_fundamentals_identity', table_name='point_in_time_fundamentals')
    op.drop_index('ix_pit_fundamentals_symbol_concept_filed', table_name='point_in_time_fundamentals')
    op.drop_index('ix_pit_fundamentals_ticker_symbol', table_name='point_in_time_fundamentals')
    op.drop_table('point_in_time_fundamentals')
    op.drop_index('ux_historical_bars_symbol_tf_ts', table_name='historical_bars')
    op.drop_index('ix_historical_bars_symbol_tf_ts', table_name='historical_bars')
    op.drop_index('ix_historical_bars_ticker_symbol', table_name='historical_bars')
    op.drop_table('historical_bars')
