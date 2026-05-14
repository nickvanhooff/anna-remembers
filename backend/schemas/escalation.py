import uuid
from datetime import datetime

from pydantic import BaseModel


class EscalationCreate(BaseModel):
    patient_id: uuid.UUID
    session_id: uuid.UUID | None = None
    reason: str
    urgency: str  # "low" | "medium" | "high"


class EscalationStatusUpdate(BaseModel):
    status: str  # "open" | "acknowledged" | "resolved"


class EscalationResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    session_id: uuid.UUID | None
    reason: str
    urgency: str
    status: str
    notification_status: str
    created_at: datetime

    model_config = {"from_attributes": True}
