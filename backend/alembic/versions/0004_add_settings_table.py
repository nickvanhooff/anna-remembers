"""add settings table

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.String(500), nullable=False),
    )
    op.execute("INSERT INTO settings (key, value) VALUES ('twilio_sms_enabled', 'true')")


def downgrade() -> None:
    op.drop_table("settings")
