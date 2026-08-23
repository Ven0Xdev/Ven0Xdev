"""platform_settings timezone-aware updated_at

Missed from b8923a563975's sweep — platform_settings.updated_at is written
by app/services/platform_settings.py's set_safe_mode_override() (already
aware-UTC since that fix) but the column itself was still plain DateTime,
so Postgres silently dropped the tzinfo on write. Confirmed live: GET
/admin/safe-mode kept returning a naive updated_at after b8923a563975 was
applied and the API restarted.

Revision ID: 6f88b7d7f1ca
Revises: b8923a563975
Create Date: 2026-08-18 14:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6f88b7d7f1ca'
down_revision: Union[str, Sequence[str], None] = 'b8923a563975'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    with op.batch_alter_table('platform_settings', schema=None) as batch_op:
        kwargs = {"postgresql_using": "updated_at AT TIME ZONE 'UTC'"} if is_postgres else {}
        batch_op.alter_column(
            'updated_at',
            existing_type=sa.DateTime(),
            type_=sa.DateTime(timezone=True),
            existing_nullable=True,
            **kwargs,
        )


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    with op.batch_alter_table('platform_settings', schema=None) as batch_op:
        kwargs = {"postgresql_using": "updated_at AT TIME ZONE 'UTC'"} if is_postgres else {}
        batch_op.alter_column(
            'updated_at',
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(),
            existing_nullable=True,
            **kwargs,
        )
