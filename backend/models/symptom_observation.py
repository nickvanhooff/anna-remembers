import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class SymptomObservation(Base):
    __tablename__ = "symptom_observations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    dyspnea: Mapped[int | None] = mapped_column(
        Integer,
        CheckConstraint("dyspnea IS NULL OR dyspnea BETWEEN 0 AND 3", name="chk_dyspnea"),
        nullable=True,
    )
    edema: Mapped[int | None] = mapped_column(
        Integer,
        CheckConstraint("edema IS NULL OR edema BETWEEN 0 AND 3", name="chk_edema"),
        nullable=True,
    )
    fatigue: Mapped[int | None] = mapped_column(
        Integer,
        CheckConstraint("fatigue IS NULL OR fatigue BETWEEN 0 AND 3", name="chk_fatigue"),
        nullable=True,
    )
    medication: Mapped[int | None] = mapped_column(
        Integer,
        CheckConstraint("medication IS NULL OR medication BETWEEN 0 AND 3", name="chk_medication"),
        nullable=True,
    )
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)

    reasoning: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    extracted_by: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="llm"
    )
