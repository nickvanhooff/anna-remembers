import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.mcp_client import MCPClient


def _text_content(text: str):
    """Simulates a fastmcp TextContent object."""
    obj = MagicMock()
    obj.text = text
    return obj


@pytest.fixture
def client():
    return MCPClient(base_url="http://mcp-server:8001")


@pytest.mark.asyncio
async def test_recall_context_calls_correct_tool(client):
    """recall_context calls call_tool with correct name and args."""
    memories = [
        {"content": "Kortademig na traplopen", "source": "patient_stated",
         "session_id": "s-1", "distance": 0.12}
    ]
    mock_inner = AsyncMock()
    mock_inner.call_tool = AsyncMock(
        return_value=[_text_content(json.dumps(memories))]
    )
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_inner)
    mock_ctx.__aexit__ = AsyncMock(return_value=None)

    with patch("services.mcp_client.Client", return_value=mock_ctx):
        result = await client.recall_context(
            query="klachten ademhaling",
            patient_id="patient-1",
            limit=5,
        )

    mock_inner.call_tool.assert_called_once_with(
        "recall_context",
        {"query": "klachten ademhaling", "patient_id": "patient-1", "limit": 5},
    )
    assert result == memories


@pytest.mark.asyncio
async def test_store_memory_calls_correct_tool(client):
    """store_memory calls call_tool and returns the doc_id."""
    doc_id = "550e8400-e29b-41d4-a716-446655440000"
    mock_inner = AsyncMock()
    mock_inner.call_tool = AsyncMock(
        return_value=[_text_content(doc_id)]
    )
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_inner)
    mock_ctx.__aexit__ = AsyncMock(return_value=None)

    with patch("services.mcp_client.Client", return_value=mock_ctx):
        result = await client.store_memory(
            content="Ik voel me beter vandaag.",
            source="patient_stated",
            patient_id="patient-1",
            session_id="session-42",
        )

    mock_inner.call_tool.assert_called_once_with(
        "store_memory",
        {
            "content": "Ik voel me beter vandaag.",
            "source": "patient_stated",
            "patient_id": "patient-1",
            "session_id": "session-42",
        },
    )
    assert result == doc_id


@pytest.mark.asyncio
async def test_get_symptom_trends_is_stub(client):
    """get_symptom_trends returns empty dict — not implemented yet."""
    result = await client.get_symptom_trends(patient_id="patient-1", weeks=4)
    assert result == {}


@pytest.mark.asyncio
async def test_escalate_to_human_is_stub(client):
    """escalate_to_human returns None — is a stub."""
    result = await client.escalate_to_human(
        patient_id="patient-1",
        reason="Gewicht +3kg in 2 dagen",
        urgency="high",
    )
    assert result is None
