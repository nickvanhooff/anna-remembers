import uuid
from datetime import datetime

from pydantic import BaseModel


class SessionResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    summary: str | None

    model_config = {"from_attributes": True}
