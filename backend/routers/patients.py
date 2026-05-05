import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.patient import Patient
from schemas.patient import PatientCreate, PatientResponse, PatientUpdate
from services.database import get_db

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("/", response_model=list[PatientResponse])
def list_patients(db: Session = Depends(get_db)) -> list[Patient]:
    """Geef alle patiënten terug."""
    return db.query(Patient).all()


@router.post("/", response_model=PatientResponse, status_code=201)
def create_patient(body: PatientCreate, db: Session = Depends(get_db)) -> Patient:
    """Maak een nieuwe patiënt aan."""
    patient = Patient(**body.model_dump())
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(patient_id: uuid.UUID, db: Session = Depends(get_db)) -> Patient:
    """Geef één patiënt op basis van ID."""
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")
    return patient


@router.patch("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: uuid.UUID, body: PatientUpdate, db: Session = Depends(get_db)
) -> Patient:
    """Pas patiëntgegevens aan (alleen meegegeven velden)."""
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient


@router.delete("/{patient_id}", status_code=204)
def delete_patient(patient_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    """Verwijder een patiënt en alle bijbehorende data (cascade)."""
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")
    db.delete(patient)
    db.commit()
