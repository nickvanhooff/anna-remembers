import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class Escalation(Base):
    __tablename__ = "escalations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # urgency determines notification channel: low=email, medium=email+slack, high=slack direct
    urgency: Mapped[str] = mapped_column(String(20), nullable=False)
    # status: open → acknowledged → resolved
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="open"
    )
    # notification_status: pending → sent | failed | skipped
    # Issue #25 implements actual delivery and updates this field.
    notification_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="pending"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    patient: Mapped["Patient"] = relationship(back_populates="escalations")  # noqa: F821
    session: Mapped["Session | None"] = relationship(back_populates="escalations")  # noqa: F821
