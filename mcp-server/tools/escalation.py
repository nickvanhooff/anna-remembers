"""Escalatie-tool — meldt urgente situaties aan een zorgverlener.

Aanpak (optie B): slaat de escalatie op via de FastAPI backend (POST /escalations)
zodat PostgreSQL-logica op één plek blijft. De MCP-tool is een dunne orchestrator:
valideren → backend aanroepen → loggen.

Notificatie (email/Slack) wordt afgehandeld door de backend in issue #25.
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
    """Escaleer naar een zorgverlener en sla op in PostgreSQL via de backend.

    urgency: "low" | "medium" | "high"
    Kanaal (issue #25): email (low/medium) | Slack (high)
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

    # Issue #25: notificatie (email/Slack) wordt getriggerd vanuit de backend
    # na het opslaan — notification_status in DB start op "pending".

    return escalation_id
