import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.patient import Patient
from models.session import Session as SessionModel
from schemas.patient import PatientCreate, PatientResponse, PatientUpdate
from services.database import get_db

router = APIRouter(prefix="/patients", tags=["patients"])


def _with_stats(patient: Patient, session_count: int, last_session_at: datetime | None) -> PatientResponse:
    return PatientResponse.model_validate({
        "id": patient.id,
        "first_name": patient.first_name,
        "last_name": patient.last_name,
        "birth_date": patient.birth_date,
        "medication_schedule": patient.medication_schedule,
        "notes": patient.notes,
        "medical_summary": patient.medical_summary,
        "status": patient.status,
        "session_count": session_count,
        "last_session_at": last_session_at,
        "created_at": patient.created_at,
    })


@router.get("/", response_model=list[PatientResponse])
def list_patients(db: Session = Depends(get_db)) -> list[PatientResponse]:
    """Return all patients with session count and last session date."""
    rows = (
        db.query(
            Patient,
            func.count(SessionModel.id).label("session_count"),
            func.max(SessionModel.started_at).label("last_session_at"),
        )
        .outerjoin(SessionModel, SessionModel.patient_id == Patient.id)
        .group_by(Patient.id)
        .all()
    )
    return [_with_stats(p, cnt, last) for p, cnt, last in rows]


@router.post("/", response_model=PatientResponse, status_code=201)
def create_patient(body: PatientCreate, db: Session = Depends(get_db)) -> PatientResponse:
    """Create a new patient."""
    patient = Patient(**body.model_dump())
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return _with_stats(patient, 0, None)


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(patient_id: uuid.UUID, db: Session = Depends(get_db)) -> PatientResponse:
    """Return one patient by ID with session stats."""
    row = (
        db.query(
            Patient,
            func.count(SessionModel.id).label("session_count"),
            func.max(SessionModel.started_at).label("last_session_at"),
        )
        .outerjoin(SessionModel, SessionModel.patient_id == Patient.id)
        .filter(Patient.id == patient_id)
        .group_by(Patient.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")
    patient, cnt, last = row
    return _with_stats(patient, cnt, last)


@router.patch("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: uuid.UUID, body: PatientUpdate, db: Session = Depends(get_db)
) -> PatientResponse:
    """Update patient fields (only provided fields)."""
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    # Re-fetch with session stats
    row = (
        db.query(
            Patient,
            func.count(SessionModel.id).label("session_count"),
            func.max(SessionModel.started_at).label("last_session_at"),
        )
        .outerjoin(SessionModel, SessionModel.patient_id == Patient.id)
        .filter(Patient.id == patient_id)
        .group_by(Patient.id)
        .first()
    )
    p, cnt, last = row  # type: ignore[misc]
    return _with_stats(p, cnt, last)


@router.delete("/{patient_id}", status_code=204)
def delete_patient(patient_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    """Delete a patient and all related data (cascade)."""
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")
    db.delete(patient)
    db.commit()
