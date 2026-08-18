"""chat message provenance metadata

Adds chat_messages.meta (nullable JSON) — assistant turns now record which
backend answered (template/llm), the grounding analysis's data source/mode/
engine mode, drift/safe-mode status, and confidence caveats at answer time,
so reloaded chat history shows the same provenance as the live reply
instead of losing it on refresh.

Revision ID: 327d3acc37c3
Revises: 6f88b7d7f1ca
Create Date: 2026-08-18 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '327d3acc37c3'
down_revision: Union[str, Sequence[str], None] = '6f88b7d7f1ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('meta', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.drop_column('meta')
