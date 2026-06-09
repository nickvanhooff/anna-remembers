# backend/alembic/versions/0007_add_llm_settings.py
"""add llm_provider and llm_model settings

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-09
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("INSERT INTO settings (key, value) VALUES ('llm_provider', 'portkey')")
    op.execute("INSERT INTO settings (key, value) VALUES ('llm_model', 'gpt-5.4')")


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key IN ('llm_provider', 'llm_model')")
