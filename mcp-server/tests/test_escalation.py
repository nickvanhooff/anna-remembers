import pytest
import respx
import httpx

from tools.escalation import escalate_to_human

_FAKE_ID = "abc-123"
_BACKEND = "http://backend:8000"


def _mock_post(respx_mock, status_code=201, urgency="high"):
    respx_mock.post(f"{_BACKEND}/escalations/").mock(
        return_value=httpx.Response(
            status_code,
            json={
                "id": _FAKE_ID,
                "patient_id": "patient-1",
                "session_id": None,
                "reason": "test",
                "urgency": urgency,
                "status": "open",
                "notification_status": "pending",
                "created_at": "2026-05-14T10:00:00",
            },
        )
    )


@pytest.mark.asyncio
@respx.mock
async def test_escalate_stores_via_backend(respx_mock):
    """escalate_to_human POST'et naar de backend en geeft het escalation-ID terug."""
    _mock_post(respx_mock)
    result = await escalate_to_human(
        patient_id="patient-1",
        reason="Gewicht gestegen met 3 kg in 2 dagen",
        urgency="high",
    )
    assert result == _FAKE_ID
    assert respx_mock.calls.call_count == 1


@pytest.mark.asyncio
@respx.mock
async def test_escalate_accepts_all_urgency_levels(respx_mock):
    """Alle geldige urgency-waarden worden doorgestuurd naar de backend."""
    for urgency in ("low", "medium", "high"):
        _mock_post(respx_mock, urgency=urgency)
        result = await escalate_to_human(
            patient_id="p1",
            reason="test",
            urgency=urgency,
        )
        assert result == _FAKE_ID
    assert respx_mock.calls.call_count == 3


@pytest.mark.asyncio
async def test_escalate_rejects_invalid_urgency():
    """Ongeldige urgency gooit een ValueError vóór de HTTP-call."""
    with pytest.raises(ValueError, match="urgency moet"):
        await escalate_to_human(
            patient_id="p1",
            reason="test",
            urgency="critical",
        )


@pytest.mark.asyncio
@respx.mock
async def test_escalate_raises_on_backend_error(respx_mock):
    """HTTP-fout van de backend bubbelt op als httpx.HTTPStatusError."""
    respx_mock.post(f"{_BACKEND}/escalations/").mock(
        return_value=httpx.Response(500, json={"detail": "internal error"})
    )
    with pytest.raises(httpx.HTTPStatusError):
        await escalate_to_human(
            patient_id="p1",
            reason="test",
            urgency="high",
        )
