"""add symptom_observations table

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "symptom_observations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("week_number", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column(
            "observed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "dyspnea",
            sa.Integer(),
            sa.CheckConstraint("dyspnea IS NULL OR dyspnea BETWEEN 0 AND 3", name="chk_dyspnea"),
            nullable=True,
        ),
        sa.Column(
            "edema",
            sa.Integer(),
            sa.CheckConstraint("edema IS NULL OR edema BETWEEN 0 AND 3", name="chk_edema"),
            nullable=True,
        ),
        sa.Column(
            "fatigue",
            sa.Integer(),
            sa.CheckConstraint("fatigue IS NULL OR fatigue BETWEEN 0 AND 3", name="chk_fatigue"),
            nullable=True,
        ),
        sa.Column(
            "medication",
            sa.Integer(),
            sa.CheckConstraint("medication IS NULL OR medication BETWEEN 0 AND 3", name="chk_medication"),
            nullable=True,
        ),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column(
            "reasoning",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "extracted_by",
            sa.String(20),
            nullable=False,
            server_default="llm",
        ),
    )

    op.create_index(
        "idx_symptom_obs_patient_week",
        "symptom_observations",
        ["patient_id", "year", "week_number"],
    )


def downgrade() -> None:
    op.drop_index("idx_symptom_obs_patient_week", table_name="symptom_observations")
    op.drop_table("symptom_observations")
