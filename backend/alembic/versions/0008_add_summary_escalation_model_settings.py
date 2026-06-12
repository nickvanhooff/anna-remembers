# backend/alembic/versions/0008_add_summary_escalation_model_settings.py
"""add summary_llm_model and escalation_llm_model settings

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-09
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("INSERT INTO settings (key, value) VALUES ('summary_llm_model', 'DeepSeek-V4-Flash')")
    op.execute("INSERT INTO settings (key, value) VALUES ('escalation_llm_model', 'DeepSeek-V4-Flash')")


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key IN ('summary_llm_model', 'escalation_llm_model')")
