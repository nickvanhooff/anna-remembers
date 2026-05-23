# backend/alembic/versions/0005_add_tts_provider_setting.py
"""add tts_provider setting

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-23
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("INSERT INTO settings (key, value) VALUES ('tts_provider', 'xtts')")


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key = 'tts_provider'")
