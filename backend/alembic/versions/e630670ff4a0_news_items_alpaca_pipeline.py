"""news_items alpaca pipeline

Restructures news_items from "one row per (ticker, article)" (defined at
baseline but never actually populated by anything — confirmed empty in
every deployment) to "one row per article", with `symbols` (JSON list)
mapping it to every relevant ticker, `provider`+`external_id` as the
dedup key, and the sentiment/novelty/relevance/reliability/impact/category
fields services/news/classify.py computes. Safe to restructure directly
(no data migration) since the table has never been written to.

Revision ID: e630670ff4a0
Revises: 5215f923adb5
Create Date: 2026-08-18 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e630670ff4a0'
down_revision: Union[str, Sequence[str], None] = '5215f923adb5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('news_items', schema=None) as batch_op:
        batch_op.drop_index('ix_news_ticker_published')
        batch_op.drop_column('ticker_symbol')

        batch_op.add_column(sa.Column('provider', sa.String(length=32), nullable=False, server_default='alpaca'))
        batch_op.add_column(sa.Column('external_id', sa.String(length=64), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('summary', sa.String(length=2048), nullable=True))
        batch_op.add_column(sa.Column('symbols', sa.JSON(), nullable=False, server_default='[]'))
        batch_op.add_column(sa.Column('received_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
        batch_op.add_column(sa.Column('update_count', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('sentiment_label', sa.String(length=16), nullable=False, server_default='uncertain'))
        batch_op.add_column(sa.Column('novelty', sa.Float(), nullable=False, server_default='1.0'))
        batch_op.add_column(sa.Column('relevance', sa.Float(), nullable=False, server_default='0.5'))
        batch_op.add_column(sa.Column('reliability', sa.Float(), nullable=False, server_default='0.5'))
        batch_op.add_column(sa.Column('impact', sa.Float(), nullable=False, server_default='0.0'))
        batch_op.add_column(sa.Column('category', sa.String(length=24), nullable=True))

    op.create_index('ux_news_items_external_id', 'news_items', ['provider', 'external_id'], unique=True)
    op.create_index('ix_news_items_published', 'news_items', ['published_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_news_items_published', table_name='news_items')
    op.drop_index('ux_news_items_external_id', table_name='news_items')

    with op.batch_alter_table('news_items', schema=None) as batch_op:
        batch_op.drop_column('category')
        batch_op.drop_column('impact')
        batch_op.drop_column('reliability')
        batch_op.drop_column('relevance')
        batch_op.drop_column('novelty')
        batch_op.drop_column('sentiment_label')
        batch_op.drop_column('update_count')
        batch_op.drop_column('received_at')
        batch_op.drop_column('symbols')
        batch_op.drop_column('summary')
        batch_op.drop_column('external_id')
        batch_op.drop_column('provider')

        batch_op.add_column(sa.Column('ticker_symbol', sa.String(length=16), nullable=False, server_default=''))

    op.create_index('ix_news_ticker_published', 'news_items', ['ticker_symbol', 'published_at'])
