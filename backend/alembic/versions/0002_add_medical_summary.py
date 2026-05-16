"""add medical_summary to patients

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("medical_summary", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("patients", "medical_summary")
