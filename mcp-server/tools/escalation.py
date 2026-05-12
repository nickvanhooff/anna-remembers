"""Escalatie-tool — stuurt urgente meldingen naar een zorgverlener.

Huidig: stub. Implementatie: email (low/medium) | Slack (high).
"""


async def escalate_to_human(
    patient_id: str,
    reason: str,
    urgency: str,
) -> None:
    """Stub — escalatie naar zorgverlener.

    urgency: "low" | "medium" | "high"
    Kanaal: email (low/medium) | Slack (high) — implementatie volgt.
    """
    # TODO: valideer urgency in {"low", "medium", "high"} bij echte implementatie
    pass
