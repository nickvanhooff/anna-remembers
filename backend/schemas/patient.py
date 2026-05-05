import uuid
from datetime import date, datetime

from pydantic import BaseModel


class PatientCreate(BaseModel):
    name: str
    birth_date: date | None = None
    medication_schedule: dict = {}
    notes: str | None = None


class PatientUpdate(BaseModel):
    name: str | None = None
    birth_date: date | None = None
    medication_schedule: dict | None = None
    notes: str | None = None


class PatientResponse(BaseModel):
    id: uuid.UUID
    name: str
    birth_date: date | None
    medication_schedule: dict
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
