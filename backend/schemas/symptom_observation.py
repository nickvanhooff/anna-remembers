import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class SymptomObservationCreate(BaseModel):
    patient_id:  uuid.UUID
    session_id:  uuid.UUID
    week_number: int
    year:        int
    dyspnea:     Optional[int]   = None
    edema:       Optional[int]   = None
    fatigue:     Optional[int]   = None
    medication:  Optional[int]   = None
    weight_kg:   Optional[float] = None
    reasoning:   dict            = {}

    @field_validator("dyspnea", "edema", "fatigue", "medication", mode="before")
    @classmethod
    def must_be_0_to_3(cls, v: object) -> object:
        if v is not None and v not in (0, 1, 2, 3):
            raise ValueError("Score moet 0, 1, 2 of 3 zijn, of None")
        return v


class SymptomObservationRead(SymptomObservationCreate):
    id:           uuid.UUID
    observed_at:  datetime
    extracted_by: str

    model_config = {"from_attributes": True}


class TrendPoint(BaseModel):
    week:       str
    dyspnea:    Optional[int]   = None
    edema:      Optional[int]   = None
    fatigue:    Optional[int]   = None
    medication: Optional[int]   = None
    weight_kg:  Optional[float] = None
    session_id: uuid.UUID


class TrendsResponse(BaseModel):
    patient_id: uuid.UUID
    weeks:      int
    data:       list[TrendPoint]
