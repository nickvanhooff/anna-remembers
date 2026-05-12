import uuid
import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from models.base import Base
from models.message import Message
from models.patient import Patient
from services.database import get_db
from services.mcp_client import get_mcp_client

# StaticPool zodat alle sessions dezelfde in-memory SQLite connection delen
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def make_mock_mcp(memories=None):
    """Maak een MCPClient mock met standaard lege responses."""
    mock = AsyncMock()
    mock.recall_context = AsyncMock(return_value=memories or [])
    mock.store_memory = AsyncMock(return_value=str(uuid.uuid4()))
    mock.escalate_to_human = AsyncMock(return_value=None)
    return mock


@pytest.fixture
def client_with_patient():
    """TestClient met patiënt in de database. Ruimt op na elke test."""
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    patient = Patient(
        first_name="Jan",
        last_name="Jansen",
        medication_schedule={},
        status="info",
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    db.close()

    mock_mcp = make_mock_mcp()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_mcp_client] = lambda: mock_mcp

    test_client = TestClient(app)
    yield test_client, patient, mock_mcp

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_chat_returns_assistant_message(client_with_patient):
    """POST /chat/{id} geeft een assistant MessageResponse terug."""
    test_client, patient, _mock_mcp = client_with_patient

    with patch("routers.chat.get_llm_provider") as mock_llm_factory:
        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(return_value="Hoe voelt u zich vandaag?")
        mock_llm_factory.return_value = mock_llm

        response = test_client.post(
            f"/chat/{patient.id}",
            json={"content": "Ik voel me kortademig."},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "assistant"
    assert data["content"] == "Hoe voelt u zich vandaag?"
    assert "id" in data
    assert "session_id" in data


def test_chat_calls_recall_context_before_llm(client_with_patient):
    """recall_context wordt aangeroepen vóór de LLM-call."""
    test_client, patient, mock_mcp = client_with_patient

    call_order = []
    mock_mcp.recall_context = AsyncMock(
        side_effect=lambda **kwargs: call_order.append("recall") or []
    )

    with patch("routers.chat.get_llm_provider") as mock_llm_factory:
        mock_llm = AsyncMock()

        async def llm_chat(*args, **kwargs):
            await asyncio.sleep(0)
            call_order.append("llm")
            return "Antwoord van Anna"

        mock_llm.chat = llm_chat
        mock_llm_factory.return_value = mock_llm

        test_client.post(
            f"/chat/{patient.id}",
            json={"content": "Ik heb pijn."},
        )

    assert call_order.index("recall") < call_order.index("llm")


def test_chat_calls_store_memory_with_patient_stated(client_with_patient):
    """store_memory wordt aangeroepen met source=patient_stated voor elk user bericht."""
    test_client, patient, mock_mcp = client_with_patient

    with patch("routers.chat.get_llm_provider") as mock_llm_factory:
        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(return_value="Goed om te horen.")
        mock_llm_factory.return_value = mock_llm

        test_client.post(
            f"/chat/{patient.id}",
            json={"content": "Ik voel me goed vandaag."},
        )

    mock_mcp.store_memory.assert_called_once()
    call_kwargs = mock_mcp.store_memory.call_args.kwargs
    assert call_kwargs["source"] == "patient_stated"
    assert call_kwargs["content"] == "Ik voel me goed vandaag."
    assert call_kwargs["patient_id"] == str(patient.id)


def test_chat_saves_both_messages_to_db(client_with_patient):
    """Zowel het user bericht als het assistant antwoord worden opgeslagen in PostgreSQL."""
    test_client, patient, _mock_mcp = client_with_patient

    with patch("routers.chat.get_llm_provider") as mock_llm_factory:
        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(return_value="Anna's antwoord")
        mock_llm_factory.return_value = mock_llm

        test_client.post(
            f"/chat/{patient.id}",
            json={"content": "Test bericht"},
        )

    # StaticPool deelt de connection — nieuwe session ziet dezelfde data
    db = TestingSessionLocal()
    try:
        messages = db.query(Message).all()
        assert len(messages) == 2
        roles = {m.role for m in messages}
        assert roles == {"user", "assistant"}
    finally:
        db.close()


def test_chat_returns_404_for_unknown_patient(client_with_patient):
    """POST /chat/{id} met onbekend ID geeft 404."""
    test_client, _, _ = client_with_patient
    unknown_id = uuid.uuid4()
    response = test_client.post(
        f"/chat/{unknown_id}",
        json={"content": "Hallo"},
    )
    assert response.status_code == 404


def test_chat_rag_memories_appear_in_system_prompt(client_with_patient):
    """Memories uit recall_context verschijnen in de system prompt naar de LLM."""
    test_client, patient, mock_mcp = client_with_patient
    mock_mcp.recall_context = AsyncMock(
        return_value=[
            {
                "content": "Kortademig na traplopen",
                "source": "patient_stated",
                "session_id": "s-1",
                "distance": 0.1,
            },
        ]
    )

    captured_system = {}

    with patch("routers.chat.get_llm_provider") as mock_llm_factory:
        mock_llm = AsyncMock()

        async def capture_chat(messages, system=None):
            await asyncio.sleep(0)
            captured_system["value"] = system
            return "Antwoord"

        mock_llm.chat = capture_chat
        mock_llm_factory.return_value = mock_llm

        test_client.post(
            f"/chat/{patient.id}",
            json={"content": "Hoe gaat het?"},
        )

    assert "Kortademig na traplopen" in captured_system["value"]
    assert "patient_stated" in captured_system["value"]


def test_chat_debug_includes_context_proof(client_with_patient):
    """Met ?debug=true bevat de response context_proof (Postgres vs RAG)."""
    test_client, patient, mock_mcp = client_with_patient
    doc_id = "chroma-doc-uuid-1"
    mock_mcp.store_memory = AsyncMock(return_value=doc_id)
    mock_mcp.recall_context = AsyncMock(
        return_value=[
            {
                "content": "Eerder: moe na wandelen",
                "source": "patient_stated",
                "session_id": "prior-session",
                "distance": 0.42,
            },
        ]
    )

    with patch("routers.chat.get_llm_provider") as mock_llm_factory:
        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(return_value="Dank u, ik noteer het.")
        mock_llm_factory.return_value = mock_llm

        response = test_client.post(
            f"/chat/{patient.id}?debug=true",
            json={"content": "Vandaag weer moe."},
        )

    assert response.status_code == 200
    data = response.json()
    assert "context_proof" in data
    proof = data["context_proof"]
    assert proof["postgres"]["origin"] == "postgresql"
    assert proof["postgres"]["database_table"] == "messages"
    assert proof["postgres"]["messages_in_history"] >= 1
    assert any(e["role"] == "user" for e in proof["postgres"]["history_entries"])
    assert proof["rag"]["origin"] == "mcp_recall_context"
    assert proof["rag"]["query"] == "Vandaag weer moe."
    assert proof["rag"]["hit_count"] == 1
    assert proof["rag"]["hits"][0]["content"] == "Eerder: moe na wandelen"
    assert proof["store_memory"]["origin"] == "mcp_store_memory"
    assert proof["store_memory"]["chroma_document_id"] == doc_id
    assert proof["combined"]["system_prompt_includes_rag_block"] is True
    assert proof["combined"]["history_messages_sent_to_llm"] == proof["postgres"][
        "messages_in_history"
    ]


def test_chat_without_debug_omits_context_proof_key(client_with_patient):
    """Zonder debug heeft de JSON geen context_proof veld (exclude_none)."""
    test_client, patient, _mock_mcp = client_with_patient

    with patch("routers.chat.get_llm_provider") as mock_llm_factory:
        mock_llm = AsyncMock()
        mock_llm.chat = AsyncMock(return_value="Ok.")
        mock_llm_factory.return_value = mock_llm

        response = test_client.post(
            f"/chat/{patient.id}",
            json={"content": "Hallo"},
        )

    assert response.status_code == 200
    assert "context_proof" not in response.json()

