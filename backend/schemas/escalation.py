import uuid
from datetime import datetime

from pydantic import BaseModel


class EscalationResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    session_id: uuid.UUID | None
    reason: str
    urgency: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
