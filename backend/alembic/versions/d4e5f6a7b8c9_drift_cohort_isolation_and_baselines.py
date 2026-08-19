"""drift cohort isolation columns + drift_baselines table

Adds cohort-provenance columns to predictions (feature_schema_version,
provider_class, data_source, data_mode — all nullable, never backfilled
for pre-existing rows) and a new drift_baselines table: a frozen,
cohort-keyed PSI reference distribution built once from a cohort's own
matured (Outcome-joined) predictions, never silently recomputed. See
services/monitoring/drift.py's module docstring.

Revision ID: d4e5f6a7b8c9
Revises: c9d3e07a5b1f
Create Date: 2026-08-19 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c9d3e07a5b1f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('predictions', sa.Column('feature_schema_version', sa.String(length=32), nullable=True))
    op.add_column('predictions', sa.Column('provider_class', sa.String(length=32), nullable=True))
    op.add_column('predictions', sa.Column('data_source', sa.String(length=48), nullable=True))
    op.add_column('predictions', sa.Column('data_mode', sa.String(length=16), nullable=True))
    op.create_index('ix_predictions_feature_schema_version', 'predictions', ['feature_schema_version'])
    op.create_index('ix_predictions_provider_class', 'predictions', ['provider_class'])
    op.create_index('ix_predictions_data_mode', 'predictions', ['data_mode'])

    op.create_table(
        'drift_baselines',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('engine_mode', sa.String(length=16), nullable=False),
        sa.Column('model_version', sa.String(length=64), nullable=True),
        sa.Column('risk_policy_version', sa.String(length=48), nullable=False),
        sa.Column('feature_schema_version', sa.String(length=32), nullable=False),
        sa.Column('provider_class', sa.String(length=32), nullable=False),
        sa.Column('data_mode', sa.String(length=16), nullable=False),
        sa.Column('established_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('sample_size', sa.Integer(), nullable=False),
        sa.Column('values', sa.JSON(), nullable=False),
    )
    op.create_index(
        'ux_drift_baselines_cohort',
        'drift_baselines',
        ['engine_mode', 'model_version', 'risk_policy_version', 'feature_schema_version', 'provider_class', 'data_mode'],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ux_drift_baselines_cohort', table_name='drift_baselines')
    op.drop_table('drift_baselines')
    op.drop_index('ix_predictions_data_mode', table_name='predictions')
    op.drop_index('ix_predictions_provider_class', table_name='predictions')
    op.drop_index('ix_predictions_feature_schema_version', table_name='predictions')
    op.drop_column('predictions', 'data_mode')
    op.drop_column('predictions', 'data_source')
    op.drop_column('predictions', 'provider_class')
    op.drop_column('predictions', 'feature_schema_version')
