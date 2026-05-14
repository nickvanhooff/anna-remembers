"""add notification_status to escalations

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # pending → issue #25 pikt dit op en stuurt de notificatie
    op.add_column(
        "escalations",
        sa.Column(
            "notification_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
    )


def downgrade() -> None:
    op.drop_column("escalations", "notification_status")
