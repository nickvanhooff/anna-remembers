"""Escalations router — store and manage escalations to care providers."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from models.escalation import Escalation
from schemas.escalation import EscalationCreate, EscalationResponse, EscalationStatusUpdate
from services.database import get_db

router = APIRouter(prefix="/escalations", tags=["escalations"])

_VALID_URGENCY = {"low", "medium", "high"}
_VALID_STATUS = {"open", "acknowledged", "resolved"}


def _to_response(e: Escalation) -> EscalationResponse:
    return EscalationResponse.model_validate({
        "id": e.id,
        "patient_id": e.patient_id,
        "patient_name": f"{e.patient.first_name} {e.patient.last_name}",
        "session_id": e.session_id,
        "reason": e.reason,
        "urgency": e.urgency,
        "status": e.status,
        "notification_status": e.notification_status,
        "created_at": e.created_at,
    })


@router.post("/", response_model=EscalationResponse, status_code=201)
def create_escalation(body: EscalationCreate, db: Session = Depends(get_db)) -> EscalationResponse:
    """Store an escalation. Called by the MCP server tool escalate_to_human."""
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
    db.refresh(escalation, ["patient"])

    # Issue #25: send notification here (email for low/medium, Slack for high)
    # and update escalation.notification_status to "sent" or "failed".

    return _to_response(escalation)


@router.get("/", response_model=list[EscalationResponse])
def list_escalations(db: Session = Depends(get_db)) -> list[EscalationResponse]:
    """Return all escalations, newest first."""
    rows = (
        db.query(Escalation)
        .options(joinedload(Escalation.patient))
        .order_by(Escalation.created_at.desc())
        .all()
    )
    return [_to_response(e) for e in rows]


@router.get("/{escalation_id}", response_model=EscalationResponse)
def get_escalation(escalation_id: uuid.UUID, db: Session = Depends(get_db)) -> EscalationResponse:
    """Return one escalation by ID."""
    escalation = (
        db.query(Escalation)
        .options(joinedload(Escalation.patient))
        .filter(Escalation.id == escalation_id)
        .first()
    )
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalatie niet gevonden")
    return _to_response(escalation)


@router.patch("/{escalation_id}/status", response_model=EscalationResponse)
def update_escalation_status(
    escalation_id: uuid.UUID,
    body: EscalationStatusUpdate,
    db: Session = Depends(get_db),
) -> EscalationResponse:
    """Update status (open → acknowledged → resolved)."""
    if body.status not in _VALID_STATUS:
        raise HTTPException(status_code=422, detail=f"status moet een van {_VALID_STATUS} zijn")

    escalation = (
        db.query(Escalation)
        .options(joinedload(Escalation.patient))
        .filter(Escalation.id == escalation_id)
        .first()
    )
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalatie niet gevonden")

    escalation.status = body.status
    db.commit()
    db.refresh(escalation)
    return _to_response(escalation)
