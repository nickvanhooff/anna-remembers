"""Escalation tool — reports urgent situations to a care provider.

Approach (option B): stores the escalation via the FastAPI backend (POST /escalations)
so PostgreSQL logic stays in one place. The MCP tool is a thin orchestrator:
validate → call backend → log.

Notification (email/Slack) is handled by the backend in issue #25.
"""

import logging
import os

import httpx

logger = logging.getLogger(__name__)

_BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")
_VALID_URGENCY = {"low", "medium", "high"}


async def escalate_to_human(
    patient_id: str,
    reason: str,
    urgency: str,
) -> str:
    """Escalate to a care provider and store in PostgreSQL via the backend.

    urgency: "low" | "medium" | "high"
    Channel (issue #25): email (low/medium) | Slack (high)
    """
    if urgency not in _VALID_URGENCY:
        raise ValueError(f"urgency moet een van {_VALID_URGENCY} zijn, got: {urgency!r}")

    payload = {
        "patient_id": patient_id,
        "session_id": None,
        "reason": reason,
        "urgency": urgency,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(f"{_BACKEND_URL}/escalations/", json=payload)
        response.raise_for_status()
        escalation = response.json()

    escalation_id = escalation["id"]
    logger.warning(
        "[ESCALATIE] patient=%s urgency=%s id=%s | %s",
        patient_id,
        urgency,
        escalation_id,
        reason,
    )

    # Issue #25: notification (email/Slack) is triggered from the backend
    # after storing — notification_status in DB starts as "pending".

    return escalation_id
