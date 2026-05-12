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

