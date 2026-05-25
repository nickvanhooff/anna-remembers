# backend/alembic/versions/0006_add_twilio_to_setting.py
"""add twilio_to setting

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-24
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("INSERT INTO settings (key, value) VALUES ('twilio_to', '')")


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key = 'twilio_to'")
