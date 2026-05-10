import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

PatientStatus = Literal["success", "warning", "urgent", "info"]


class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    birth_date: date | None = None
    medication_schedule: dict = {}
    notes: str | None = None
    status: PatientStatus = "info"


class PatientUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    birth_date: date | None = None
    medication_schedule: dict | None = None
    notes: str | None = None
    status: PatientStatus | None = None


class PatientResponse(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    birth_date: date | None
    medication_schedule: dict
    notes: str | None
    status: PatientStatus
    created_at: datetime

    model_config = {"from_attributes": True}
