# Chat Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /chat/{patient_id}` volledig werkend: RAG-context ophalen → LLM aanroepen → antwoord opslaan in PostgreSQL.

**Architecture:** FastAPI roept via `MCPClient` (fastmcp.Client over SSE) de MCP server aan voor `recall_context` en `store_memory`. De LLM krijgt een 3-laags system prompt (persona + patiëntdata + RAG memories) plus de laatste 10 berichten uit de huidige sessie als conversation history.

**Tech Stack:** FastAPI, fastmcp 2.x (Client), SQLAlchemy, pytest + pytest-asyncio, unittest.mock

---

## Bestanden

| Bestand | Status | Rol |
|---|---|---|
| `mcp-server/tools/escalation.py` | Nieuw | `escalate_to_human` stub |
| `mcp-server/main.py` | Wijzigen | Escalatie tool registreren |
| `backend/requirements.txt` | Wijzigen | `fastmcp` toevoegen |
| `backend/services/mcp_client.py` | Herschrijven | `MCPClient` klasse + `get_mcp_client()` |
| `backend/routers/chat.py` | Herschrijven | Volledige chat flow wiren |
| `backend/tests/test_mcp_client.py` | Nieuw | Unit tests voor MCPClient |
| `backend/tests/test_chat.py` | Nieuw | Unit tests voor chat endpoint |

---

## Task 1: escalation stub in MCP server ✅ DONE (commits: d9bcb68, 71cef52)

**Files:**
- Create: `mcp-server/tools/escalation.py`
- Modify: `mcp-server/main.py`

- [x] **Stap 1: Schrijf de falende test**

Maak `mcp-server/tests/test_escalation.py`:

```python
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
```

- [x] **Stap 2: Verifieer dat de test faalt**

Vanuit `mcp-server/` directory:
```
pytest tests/test_escalation.py -v
```
Verwacht: `ModuleNotFoundError: No module named 'tools.escalation'`

- [x] **Stap 3: Implementeer de stub**

Maak `mcp-server/tools/escalation.py`:

```python
async def escalate_to_human(
    patient_id: str,
    reason: str,
    urgency: str,
) -> None:
    """Stub — escalatie naar zorgverlener.

    urgency: "low" | "medium" | "high"
    Kanaal: email (low/medium) | Slack (high) — implementatie volgt.
    """
    pass
```

- [x] **Stap 4: Registreer de tool in mcp-server/main.py**

Vervang de volledige inhoud van `mcp-server/main.py`:

```python
import os
from fastmcp import FastMCP

from services.embedding import get_embedding_provider
from tools.escalation import escalate_to_human as _escalate_to_human
from tools.memory import recall_context as _recall_context
from tools.memory import store_memory as _store_memory

mcp = FastMCP("anna-remembers-mcp")
_embed = get_embedding_provider()


@mcp.tool()
async def store_memory(
    content: str,
    source: str,
    patient_id: str,
    session_id: str,
) -> str:
    """Sla een geheugenblok op voor een patiënt."""
    return await _store_memory(content, source, patient_id, session_id, _embed)


@mcp.tool()
async def recall_context(
    query: str,
    patient_id: str,
    limit: int,
) -> list[dict]:
    """Haal semantisch gerelateerde herinneringen op voor een patiënt."""
    return await _recall_context(query, patient_id, limit, _embed)


@mcp.tool()
async def escalate_to_human(
    patient_id: str,
    reason: str,
    urgency: str,
) -> None:
    """Escaleer naar een zorgverlener. urgency: low | medium | high."""
    return await _escalate_to_human(patient_id, reason, urgency)


if __name__ == "__main__":
    port = int(os.getenv("MCP_PORT", "8001"))
    mcp.run(transport="sse", host="0.0.0.0", port=port)
```

- [x] **Stap 5: Verifieer dat alle MCP server tests slagen**

```
pytest tests/ -v
```
Verwacht: alle tests PASS (inclusief de 2 nieuwe escalatie tests + de 7 bestaande)

- [x] **Stap 6: Commit**

```bash
git add mcp-server/tools/escalation.py mcp-server/main.py mcp-server/tests/test_escalation.py
git commit -m "feat(mcp): add escalate_to_human stub + register all tools"
```

---

## Task 2: MCPClient implementeren in backend ✅ DONE (commit: 9188dcc)

**Files:**
- Modify: `backend/requirements.txt`
- Rewrite: `backend/services/mcp_client.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_mcp_client.py`

- [x] **Stap 1: Voeg fastmcp toe aan backend requirements**

`backend/requirements.txt`:

```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
sqlalchemy>=2.0.0
alembic>=1.13.0
psycopg2-binary>=2.9.0
pydantic>=2.9.0
pydantic-settings>=2.6.0
python-dotenv>=1.0.0
httpx>=0.27.0
fastmcp>=2.0.0
```

- [x] **Stap 2: Maak backend/tests/__init__.py aan**

Leeg bestand, zodat pytest de map vindt:

```python
```

- [x] **Stap 3: Schrijf de falende tests voor MCPClient**

Maak `backend/tests/test_mcp_client.py`:

```python
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.mcp_client import MCPClient


def _text_content(text: str):
    """Simuleert een fastmcp TextContent object."""
    obj = MagicMock()
    obj.text = text
    return obj


@pytest.fixture
def client():
    return MCPClient(base_url="http://mcp-server:8001")


@pytest.mark.asyncio
async def test_recall_context_calls_correct_tool(client):
    """recall_context roept call_tool aan met juiste naam en args."""
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
    """store_memory roept call_tool aan en geeft de doc_id terug."""
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
    """get_symptom_trends retourneert leeg dict — is nog niet geïmplementeerd."""
    result = await client.get_symptom_trends(patient_id="patient-1", weeks=4)
    assert result == {}


@pytest.mark.asyncio
async def test_escalate_to_human_is_stub(client):
    """escalate_to_human retourneert None — is een stub."""
    result = await client.escalate_to_human(
        patient_id="patient-1",
        reason="Gewicht +3kg in 2 dagen",
        urgency="high",
    )
    assert result is None
```

- [ ] **Stap 4: Verifieer dat de tests falen**

Vanuit `backend/` directory:
```
pytest tests/test_mcp_client.py -v
```
Verwacht: `ImportError` of `NotImplementedError` — MCPClient bestaat nog niet correct.

- [ ] **Stap 5: Implementeer MCPClient**

Vervang de volledige inhoud van `backend/services/mcp_client.py`:

```python
"""MCP-client — verbindt FastAPI met de MCP-server via het SSE-protocol.

FastAPI roept nooit rechtstreeks ChromaDB of de embedder aan.
Alle AI-geheugenlogica zit in de MCP-server op poort 8001.
"""
import json
import os

from fastmcp import Client


class MCPClient:
    """Wrapper om fastmcp.Client die de MCP tools als Python-methodes aanbiedt."""

    def __init__(self, base_url: str) -> None:
        self._url = f"{base_url}/sse"

    async def recall_context(
        self,
        query: str,
        patient_id: str,
        limit: int = 5,
    ) -> list[dict]:
        """Semantische RAG-search over eerdere uitspraken van een patiënt."""
        async with Client(self._url) as client:
            result = await client.call_tool(
                "recall_context",
                {"query": query, "patient_id": patient_id, "limit": limit},
            )
        return json.loads(result[0].text)

    async def store_memory(
        self,
        content: str,
        source: str,
        patient_id: str,
        session_id: str,
    ) -> str:
        """Sla een uitspraak op als vector in ChromaDB via de MCP-server.

        source: "patient_stated" | "ai_inferred"
        Retourneert de doc_id (UUID) van het opgeslagen document.
        """
        async with Client(self._url) as client:
            result = await client.call_tool(
                "store_memory",
                {
                    "content": content,
                    "source": source,
                    "patient_id": patient_id,
                    "session_id": session_id,
                },
            )
        return result[0].text

    async def get_symptom_trends(
        self,
        patient_id: str,
        weeks: int = 4,
    ) -> dict:
        """Stub — get_symptom_trends volgt in een volgend issue."""
        return {}

    async def escalate_to_human(
        self,
        patient_id: str,
        reason: str,
        urgency: str,
    ) -> None:
        """Stub — escalatie volgt in een volgend issue.

        urgency: "low" | "medium" | "high"
        """
        pass


def get_mcp_client() -> MCPClient:
    """FastAPI Depends() factory — leest MCP_URL uit de omgeving."""
    base_url = os.getenv("MCP_URL", "http://mcp-server:8001")
    return MCPClient(base_url=base_url)
```

- [ ] **Stap 6: Verifieer dat alle tests slagen**

```
pytest tests/test_mcp_client.py -v
```
Verwacht: 4 tests PASS

- [ ] **Stap 7: Commit**

```bash
git add backend/requirements.txt backend/services/mcp_client.py backend/tests/__init__.py backend/tests/test_mcp_client.py
git commit -m "feat(backend): implement MCPClient with fastmcp SSE transport"
```

---

## Task 3: chat.py volledig wiren

**Files:**
- Rewrite: `backend/routers/chat.py`
- Create: `backend/tests/test_chat.py`

- [x] **Stap 1: Schrijf de falende tests voor de chat router**

Maak `backend/tests/test_chat.py`:

```python
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from models.base import Base
from models.patient import Patient
from models.session import Session as ChatSession
from models.message import Message
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
    test_client, patient, mock_mcp = client_with_patient

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
    test_client, patient, mock_mcp = client_with_patient

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
    mock_mcp.recall_context = AsyncMock(return_value=[
        {"content": "Kortademig na traplopen", "source": "patient_stated",
         "session_id": "s-1", "distance": 0.1},
    ])

    captured_system = {}

    with patch("routers.chat.get_llm_provider") as mock_llm_factory:
        mock_llm = AsyncMock()

        async def capture_chat(messages, system=None):
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
```

- [x] **Stap 2: Verifieer dat de tests falen**

```
pytest tests/test_chat.py -v
```
Verwacht: tests falen omdat `get_mcp_client` nog niet als `Depends()` in chat.py zit.

- [x] **Stap 3: Herschrijf chat.py met volledige flow**

Vervang de volledige inhoud van `backend/routers/chat.py`:

```python
"""Chat router — wekelijkse check-in gesprekken met Anna."""
import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.message import Message
from models.patient import Patient
from models.session import Session as ChatSession
from schemas.message import ChatRequest, MessageResponse
from services.database import get_db
from services.llm import get_llm_provider
from services.mcp_client import MCPClient, get_mcp_client

router = APIRouter(prefix="/chat", tags=["chat"])

_HISTORY_LIMIT = 10


def _build_system_prompt(
    patient: Patient,
    memories: list[dict],
) -> str:
    """Bouw de 3-laags system prompt voor Anna.

    Laag 1: persona + gedragsregels
    Laag 2: patiëntgegevens uit PostgreSQL
    Laag 3: semantisch relevante herinneringen uit ChromaDB
    """
    name = f"{patient.first_name} {patient.last_name}"
    medication = json.dumps(patient.medication_schedule, ensure_ascii=False)
    notes = patient.notes or "Geen aanvullende notities."

    memory_block = ""
    if memories:
        lines = "\n".join(
            f"- [{m['source']}] {m['content']}" for m in memories
        )
        memory_block = f"\n\nRelevante eerdere uitspraken van deze patiënt:\n{lines}"

    return (
        f"Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten. "
        f"Je spreekt met {name}.\n\n"
        f"Gedragsregels:\n"
        f"- Verzin nooit symptomen, medicatie of gewicht die de patiënt niet heeft gemeld.\n"
        f"- Refereer aan eerdere uitspraken als die relevant zijn voor het huidige gesprek.\n"
        f"- Stel maximaal één gerichte vervolgvraag per response.\n"
        f"- Spreek altijd Nederlands.\n\n"
        f"Patiëntgegevens:\n"
        f"- Naam: {name}\n"
        f"- Medicatieschema: {medication}\n"
        f"- Notities zorgverlener: {notes}"
        f"{memory_block}"
    )


@router.post("/{patient_id}", response_model=MessageResponse)
async def chat(
    patient_id: uuid.UUID,
    body: ChatRequest,
    db: Session = Depends(get_db),
    mcp: MCPClient = Depends(get_mcp_client),
) -> Message:
    """Stuur een bericht namens de patiënt en ontvang Anna's response.

    Flow:
    1. Valideer patiënt en haal/maak sessie aan
    2. Sla user-bericht op in PostgreSQL
    3. Haal RAG-context + sla geheugen op (parallel via asyncio.gather)
    4. Haal laatste 10 berichten op als conversation history
    5. Bouw system prompt (3 lagen: persona + patiëntdata + RAG)
    6. Roep LLM aan
    7. Sla assistant-antwoord op
    8. Escalatie stub (implementatie volgt)
    """
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")

    # Haal bestaande open sessie op, of maak een nieuwe
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.patient_id == patient_id,
            ChatSession.ended_at.is_(None),
        )
        .first()
    )
    if not session:
        session = ChatSession(patient_id=patient_id)
        db.add(session)
        db.commit()
        db.refresh(session)

    # Sla het user-bericht op in PostgreSQL
    user_message = Message(
        session_id=session.id,
        role="user",
        content=body.content,
    )
    db.add(user_message)
    db.commit()

    # RAG-context ophalen + geheugen opslaan — parallel voor minimale latency
    memories, _ = await asyncio.gather(
        mcp.recall_context(
            query=body.content,
            patient_id=str(patient_id),
            limit=5,
        ),
        mcp.store_memory(
            content=body.content,
            source="patient_stated",
            patient_id=str(patient_id),
            session_id=str(session.id),
        ),
    )

    # Laatste 10 berichten van de huidige sessie als conversation history
    recent = (
        db.query(Message)
        .filter(Message.session_id == session.id)
        .order_by(Message.created_at.desc())
        .limit(_HISTORY_LIMIT)
        .all()
    )
    recent.reverse()
    history = [{"role": m.role, "content": m.content} for m in recent]

    # Bouw system prompt en roep LLM aan
    system_prompt = _build_system_prompt(patient, memories)
    llm = get_llm_provider()
    response_text = await llm.chat(messages=history, system=system_prompt)

    # Sla Anna's antwoord op
    assistant_message = Message(
        session_id=session.id,
        role="assistant",
        content=response_text,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    # Escalatie stub — implementatie volgt in een volgend issue
    await mcp.escalate_to_human(
        patient_id=str(patient_id),
        reason="",
        urgency="low",
    )

    return assistant_message
```

- [x] **Stap 4: Verifieer dat alle backend tests slagen**

```
pytest tests/ -v
```
Verwacht: alle tests PASS (4 MCPClient tests + 6 chat tests)

- [ ] **Stap 5: Commit**

```bash
git add backend/routers/chat.py backend/tests/test_chat.py
git commit -m "feat(backend): wire chat endpoint — RAG context + LLM + PostgreSQL"
```

---

## Task 4: handmatig end-to-end testen

**Files:** Geen codewijzigingen — alleen testen

- [ ] **Stap 1: Start alle services**

```bash
docker compose up -d
```
Wacht tot alle containers healthy zijn:
```bash
docker compose ps
```
Verwacht: `postgres`, `chromadb`, `ollama`, `mcp-server`, `backend` zijn allemaal `running`.

- [ ] **Stap 2: Haal een patiënt-ID op**

```bash
curl http://localhost:8000/patients
```
Kopieer een `id` uit de response. Als de lijst leeg is, voeg eerst een patiënt toe:
```bash
curl -X POST http://localhost:8000/patients \
  -H "Content-Type: application/json" \
  -d '{"first_name": "Jan", "last_name": "Jansen", "medication_schedule": {}}'
```

- [ ] **Stap 3: Stuur een eerste bericht**

```bash
curl -X POST http://localhost:8000/chat/<PATIENT_ID> \
  -H "Content-Type: application/json" \
  -d '{"content": "Ik voel me de laatste dagen wat kortademig na het traplopen."}'
```
Verwacht: JSON response met `role: "assistant"` en een antwoord van Anna. Response tijd: 1–5 seconden.

- [ ] **Stap 4: Stuur een vervolgbericht en controleer of Anna refereert aan het vorige**

```bash
curl -X POST http://localhost:8000/chat/<PATIENT_ID> \
  -H "Content-Type: application/json" \
  -d '{"content": "Vandaag gaat het iets beter."}'
```
Verwacht: Anna verwijst naar "kortademig na het traplopen" uit het vorige bericht — dit bewijst dat RAG werkt.

- [ ] **Stap 5: Commit STAPPEN.md update**

Voeg de stap toe aan `portfolio/STAPPEN.md` en commit.

---

## Acceptatiecriteria — verificatie

| Criterium | Getest in |
|---|---|
| `recall_context` aangeroepen vóór LLM-call | `test_chat_calls_recall_context_before_llm` |
| `store_memory` na user bericht met `patient_stated` | `test_chat_calls_store_memory_with_patient_stated` |
| LLM via `services/llm.py` (provider-agnostisch) | `test_chat_returns_assistant_message` (mock) |
| Sessie + berichten opgeslagen in PostgreSQL | `test_chat_saves_both_messages_to_db` |
| RAG memories in system prompt | `test_chat_rag_memories_appear_in_system_prompt` |
| Ollama + gemma4:e4b geeft antwoord | Task 4 handmatige E2E test |
