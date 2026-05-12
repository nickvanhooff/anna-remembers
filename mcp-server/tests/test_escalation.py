import pytest
from tools.escalation import escalate_to_human


@pytest.mark.asyncio
async def test_escalate_to_human_is_stub():
    """escalate_to_human is een stub — retourneert None zonder fout."""
    result = await escalate_to_human(
        patient_id="patient-1",
        reason="Gewicht gestegen met 3 kg in 2 dagen",
        urgency="high",
    )
    assert result is None


@pytest.mark.asyncio
async def test_escalate_accepts_all_urgency_levels():
    """Alle urgency-waarden zijn geldig — stub gooit nooit een fout."""
    for urgency in ("low", "medium", "high"):
        result = await escalate_to_human(
            patient_id="p1",
            reason="test",
            urgency=urgency,
        )
        assert result is None
