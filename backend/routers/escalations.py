"""Escalaties router — opslaan en beheren van escalaties naar zorgverleners."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.escalation import Escalation
from schemas.escalation import EscalationCreate, EscalationResponse, EscalationStatusUpdate
from services.database import get_db

router = APIRouter(prefix="/escalations", tags=["escalations"])

_VALID_URGENCY = {"low", "medium", "high"}
_VALID_STATUS = {"open", "acknowledged", "resolved"}


@router.post("/", response_model=EscalationResponse, status_code=201)
def create_escalation(body: EscalationCreate, db: Session = Depends(get_db)) -> Escalation:
    """Sla een escalatie op. Aangeroepen door de MCP-server tool escalate_to_human."""
    if body.urgency not in _VALID_URGENCY:
        raise HTTPException(status_code=422, detail=f"urgency moet een van {_VALID_URGENCY} zijn")

    escalation = Escalation(
        patient_id=body.patient_id,
        session_id=body.session_id,
        reason=body.reason,
        urgency=body.urgency,
        status="open",
        notification_status="pending",
    )
    db.add(escalation)
    db.commit()
    db.refresh(escalation)

    # Issue #25: stuur hier de notificatie (email bij low/medium, Slack bij high)
    # en update escalation.notification_status naar "sent" of "failed".

    return escalation


@router.get("/", response_model=list[EscalationResponse])
def list_escalations(db: Session = Depends(get_db)) -> list[Escalation]:
    """Geef alle escalaties terug, nieuwste eerst."""
    return db.query(Escalation).order_by(Escalation.created_at.desc()).all()


@router.get("/{escalation_id}", response_model=EscalationResponse)
def get_escalation(escalation_id: uuid.UUID, db: Session = Depends(get_db)) -> Escalation:
    """Geef één escalatie op basis van ID."""
    escalation = db.get(Escalation, escalation_id)
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalatie niet gevonden")
    return escalation


@router.patch("/{escalation_id}/status", response_model=EscalationResponse)
def update_escalation_status(
    escalation_id: uuid.UUID,
    body: EscalationStatusUpdate,
    db: Session = Depends(get_db),
) -> Escalation:
    """Werk de status bij (open → acknowledged → resolved)."""
    if body.status not in _VALID_STATUS:
        raise HTTPException(status_code=422, detail=f"status moet een van {_VALID_STATUS} zijn")

    escalation = db.get(Escalation, escalation_id)
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalatie niet gevonden")

    escalation.status = body.status
    db.commit()
    db.refresh(escalation)
    return escalation
