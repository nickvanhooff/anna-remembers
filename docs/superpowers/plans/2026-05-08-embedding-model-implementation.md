# Embedding Model (bge-m3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementeer `EmbeddingProvider`, `store_memory` en `recall_context` in de MCP-server zodat patiëntgesprekken semantisch opgeslagen en opgehaald worden via ChromaDB + bge-m3.

**Architecture:** De MCP-server roept het Ollama embed-endpoint aan (`/api/embed`) om tekst om te zetten naar 1024-dim vectoren. Die vectoren worden opgeslagen in een ChromaDB-collectie `patient_memories` met metadata (patient_id, session_id, source-tag). De embedding provider is provider-agnostisch via een abstracte klasse, zelfde patroon als `backend/services/llm.py`.

**Tech Stack:** fastmcp, chromadb Python SDK, httpx, pytest, pytest-asyncio, respx

---

## Bestandsoverzicht

| Bestand | Actie | Verantwoordelijkheid |
|---|---|---|
| `mcp-server/services/__init__.py` | Aanmaken | Package marker |
| `mcp-server/services/embedding.py` | Aanmaken | `EmbeddingProvider` ABC, `OllamaEmbeddingProvider`, `EmbeddingUnavailableError`, factory |
| `mcp-server/tools/__init__.py` | Aanmaken | Package marker |
| `mcp-server/tools/memory.py` | Aanmaken | Pure logica: `store_memory`, `recall_context`, ChromaDB-client init |
| `mcp-server/main.py` | Aanpassen | Tools registreren met `@mcp.tool()`, embedding provider initialiseren |
| `mcp-server/requirements.txt` | Aanpassen | `httpx`, `pytest`, `pytest-asyncio`, `respx` toevoegen |
| `mcp-server/tests/__init__.py` | Aanmaken | Package marker |
| `mcp-server/tests/test_embedding.py` | Aanmaken | Unit tests voor `OllamaEmbeddingProvider` |
| `mcp-server/tests/test_memory.py` | Aanmaken | Unit tests voor `store_memory` en `recall_context` |
| `docker-compose.yml` | Aanpassen | `ollama-init` service + env vars voor mcp-server |
| `.env.example` | Aanpassen | `EMBEDDING_MODEL` toevoegen |

---

## Task 1: Dependencies + lege package-structuur

**Files:**
- Modify: `mcp-server/requirements.txt`
- Create: `mcp-server/services/__init__.py`
- Create: `mcp-server/tools/__init__.py`
- Create: `mcp-server/tests/__init__.py`

- [ ] **Stap 1.1: Voeg dependencies toe aan requirements.txt**

Vervang de volledige inhoud van `mcp-server/requirements.txt`:

```
fastmcp>=2.0.0
chromadb>=0.5.0
psycopg2-binary>=2.9.0
python-dotenv>=1.0.0
httpx>=0.27.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
respx>=0.21.0
```

- [ ] **Stap 1.2: Maak lege package markers aan**

Maak drie lege bestanden aan (inhoud: leeg):
- `mcp-server/services/__init__.py`
- `mcp-server/tools/__init__.py`
- `mcp-server/tests/__init__.py`

- [ ] **Stap 1.3: Commit**

```bash
git add mcp-server/requirements.txt mcp-server/services/__init__.py mcp-server/tools/__init__.py mcp-server/tests/__init__.py
git commit -m "chore: add httpx/pytest deps and package structure to mcp-server"
```

---

## Task 2: EmbeddingProvider ABC + OllamaEmbeddingProvider

**Files:**
- Create: `mcp-server/services/embedding.py`
- Create: `mcp-server/tests/test_embedding.py`

- [ ] **Stap 2.1: Schrijf de falende tests**

Maak `mcp-server/tests/test_embedding.py` aan:

```python
import pytest
import respx
from httpx import Response

from services.embedding import (
    EmbeddingProvider,
    EmbeddingUnavailableError,
    OllamaEmbeddingProvider,
    get_embedding_provider,
)


def test_embedding_provider_is_abstract():
    """EmbeddingProvider mag niet direct geïnstantieerd worden."""
    with pytest.raises(TypeError):
        EmbeddingProvider()


@pytest.mark.asyncio
@respx.mock
async def test_ollama_embed_returns_1024_vector():
    """Happy path: Ollama retourneert 1024 floats."""
    respx.post("http://localhost:11434/api/embed").mock(
        return_value=Response(200, json={"embeddings": [[0.1] * 1024]})
    )
    provider = OllamaEmbeddingProvider(model="bge-m3", base_url="http://localhost:11434")
    vector = await provider.embed("kortademig na traplopen")
    assert len(vector) == 1024
    assert vector[0] == pytest.approx(0.1)


@pytest.mark.asyncio
@respx.mock
async def test_ollama_embed_raises_on_connection_error():
    """Als Ollama onbereikbaar is, gooit embed() EmbeddingUnavailableError."""
    import httpx
    respx.post("http://localhost:11434/api/embed").mock(
        side_effect=httpx.ConnectError("connection refused")
    )
    provider = OllamaEmbeddingProvider(model="bge-m3", base_url="http://localhost:11434")
    with pytest.raises(EmbeddingUnavailableError, match="Ollama onbereikbaar"):
        await provider.embed("test")


def test_get_embedding_provider_returns_ollama(monkeypatch):
    """Factory geeft OllamaEmbeddingProvider terug met waarden uit env."""
    monkeypatch.setenv("EMBEDDING_MODEL", "bge-m3")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama:11434")
    provider = get_embedding_provider()
    assert isinstance(provider, OllamaEmbeddingProvider)
    assert provider.model == "bge-m3"
```

- [ ] **Stap 2.2: Draai de tests — verwacht FAIL**

```bash
cd mcp-server
pip install -r requirements.txt
pytest tests/test_embedding.py -v
```

Verwacht: `ModuleNotFoundError: No module named 'services.embedding'`

- [ ] **Stap 2.3: Implementeer services/embedding.py**

Maak `mcp-server/services/embedding.py` aan:

```python
import os
from abc import ABC, abstractmethod

import httpx


class EmbeddingProvider(ABC):
    """Abstracte basis voor alle embedding providers.

    Nieuwe provider toevoegen = nieuwe subklasse + registreren in get_embedding_provider().
    """

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Zet tekst om naar een float-vector.

        Args:
            text: de te embedden tekst
        Returns:
            lijst van floats (dimensies afhankelijk van model)
        """
        ...


class EmbeddingUnavailableError(Exception):
    """Gooit embedding.py als de embedding provider onbereikbaar is."""


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Embedding provider via Ollama /api/embed (bge-m3 standaard)."""

    def __init__(self, model: str, base_url: str) -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")

    async def embed(self, text: str) -> list[float]:
        """Vraag een vector op bij Ollama.

        Raises:
            EmbeddingUnavailableError: als Ollama niet bereikbaar is
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": self.model, "input": text},
                )
                response.raise_for_status()
                return response.json()["embeddings"][0]
        except httpx.RequestError as e:
            raise EmbeddingUnavailableError(
                f"Ollama onbereikbaar bij embed-aanroep: {e}"
            ) from e


def get_embedding_provider() -> EmbeddingProvider:
    """Factory — leest gewenste provider uit omgeving.

    EMBEDDING_MODEL en OLLAMA_BASE_URL worden uit env gelezen.
    """
    return OllamaEmbeddingProvider(
        model=os.getenv("EMBEDDING_MODEL", "bge-m3"),
        base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
    )
```

- [ ] **Stap 2.4: Draai de tests — verwacht PASS**

```bash
pytest tests/test_embedding.py -v
```

Verwacht:
```
PASSED tests/test_embedding.py::test_embedding_provider_is_abstract
PASSED tests/test_embedding.py::test_ollama_embed_returns_1024_vector
PASSED tests/test_embedding.py::test_ollama_embed_raises_on_connection_error
PASSED tests/test_embedding.py::test_get_embedding_provider_returns_ollama
4 passed
```

- [ ] **Stap 2.5: Commit**

```bash
git add mcp-server/services/embedding.py mcp-server/tests/test_embedding.py
git commit -m "feat: add EmbeddingProvider ABC and OllamaEmbeddingProvider with tests"
```

---

## Task 3: store_memory tool

**Files:**
- Create: `mcp-server/tools/memory.py`
- Create: `mcp-server/tests/test_memory.py` (store_memory tests)

- [ ] **Stap 3.1: Schrijf de falende test voor store_memory**

Maak `mcp-server/tests/test_memory.py` aan:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.embedding import EmbeddingProvider
from tools.memory import store_memory


class FakeEmbedder(EmbeddingProvider):
    """Nep-embedder die altijd een vaste 1024-dim vector teruggeeft."""

    async def embed(self, text: str) -> list[float]:
        return [0.42] * 1024


@pytest.mark.asyncio
async def test_store_memory_adds_to_chromadb():
    """store_memory embedt de content en roept collection.add() aan."""
    mock_collection = MagicMock()

    with patch("tools.memory.get_collection", return_value=mock_collection):
        doc_id = await store_memory(
            content="Ik voel me kortademig na traplopen.",
            source="patient_stated",
            patient_id="patient-1",
            session_id="session-42",
            embed=FakeEmbedder(),
        )

    mock_collection.add.assert_called_once()
    call_kwargs = mock_collection.add.call_args
    assert call_kwargs.kwargs["embeddings"] == [[0.42] * 1024]
    assert call_kwargs.kwargs["documents"] == ["Ik voel me kortademig na traplopen."]
    assert call_kwargs.kwargs["metadatas"][0]["patient_id"] == "patient-1"
    assert call_kwargs.kwargs["metadatas"][0]["source"] == "patient_stated"
    assert isinstance(doc_id, str) and len(doc_id) == 36  # UUID4


@pytest.mark.asyncio
async def test_store_memory_propagates_embedding_error():
    """Als embedding mislukt, gooit store_memory de fout door — geen silent failure."""
    from services.embedding import EmbeddingUnavailableError

    class FailingEmbedder(EmbeddingProvider):
        async def embed(self, text: str) -> list[float]:
            raise EmbeddingUnavailableError("Ollama onbereikbaar")

    with pytest.raises(EmbeddingUnavailableError):
        await store_memory(
            content="test",
            source="patient_stated",
            patient_id="p1",
            session_id="s1",
            embed=FailingEmbedder(),
        )
```

- [ ] **Stap 3.2: Draai de test — verwacht FAIL**

```bash
pytest tests/test_memory.py::test_store_memory_adds_to_chromadb -v
pytest tests/test_memory.py::test_store_memory_propagates_embedding_error -v
```

Verwacht: `ModuleNotFoundError: No module named 'tools.memory'`

- [ ] **Stap 3.3: Implementeer store_memory in tools/memory.py**

Maak `mcp-server/tools/memory.py` aan:

```python
import os
import uuid
from datetime import datetime, timezone

import chromadb

from services.embedding import EmbeddingProvider

_collection = None


def get_collection():
    """Lazy-init van de ChromaDB collectie (singleton per process)."""
    global _collection
    if _collection is None:
        client = chromadb.HttpClient(
            host=os.getenv("CHROMA_HOST", "chromadb"),
            port=int(os.getenv("CHROMA_PORT", "8000")),
        )
        _collection = client.get_or_create_collection(
            name="patient_memories",
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


async def store_memory(
    content: str,
    source: str,
    patient_id: str,
    session_id: str,
    embed: EmbeddingProvider,
) -> str:
    """Embedt content en slaat het op in ChromaDB.

    Args:
        content:    de te onthouden tekst
        source:     'patient_stated' of 'ai_inferred'
        patient_id: UUID van de patiënt
        session_id: UUID van de sessie
        embed:      embedding provider instantie
    Returns:
        UUID van het opgeslagen document
    """
    vector = await embed.embed(content)
    collection = get_collection()
    doc_id = str(uuid.uuid4())
    collection.add(
        embeddings=[vector],
        documents=[content],
        metadatas=[{
            "patient_id": patient_id,
            "session_id": session_id,
            "source": source,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }],
        ids=[doc_id],
    )
    return doc_id
```

- [ ] **Stap 3.4: Draai de tests — verwacht PASS**

```bash
pytest tests/test_memory.py::test_store_memory_adds_to_chromadb tests/test_memory.py::test_store_memory_propagates_embedding_error -v
```

Verwacht:
```
PASSED tests/test_memory.py::test_store_memory_adds_to_chromadb
PASSED tests/test_memory.py::test_store_memory_propagates_embedding_error
2 passed
```

- [ ] **Stap 3.5: Commit**

```bash
git add mcp-server/tools/memory.py mcp-server/tests/test_memory.py
git commit -m "feat: implement store_memory tool with ChromaDB and embedding"
```

---

## Task 4: recall_context tool

**Files:**
- Modify: `mcp-server/tools/memory.py`
- Modify: `mcp-server/tests/test_memory.py`

- [ ] **Stap 4.1: Voeg de falende test toe aan test_memory.py**

Voeg onderaan `mcp-server/tests/test_memory.py` toe:

```python
@pytest.mark.asyncio
async def test_recall_context_returns_sorted_memories():
    """recall_context zoekt in ChromaDB en retourneert content + metadata."""
    mock_collection = MagicMock()
    mock_collection.query.return_value = {
        "documents": [["Ik voel me kortademig.", "Gewicht gestegen met 2 kg."]],
        "metadatas": [[
            {"source": "patient_stated", "session_id": "s-1", "timestamp": "2026-05-01T10:00:00+00:00"},
            {"source": "patient_stated", "session_id": "s-2", "timestamp": "2026-05-08T10:00:00+00:00"},
        ]],
        "distances": [[0.12, 0.34]],
    }

    from tools.memory import recall_context

    with patch("tools.memory.get_collection", return_value=mock_collection):
        results = await recall_context(
            query="heeft de patiënt klachten over ademhaling?",
            patient_id="patient-1",
            limit=2,
            embed=FakeEmbedder(),
        )

    mock_collection.query.assert_called_once_with(
        query_embeddings=[[0.42] * 1024],
        where={"patient_id": "patient-1"},
        n_results=2,
    )
    assert len(results) == 2
    assert results[0]["content"] == "Ik voel me kortademig."
    assert results[0]["source"] == "patient_stated"
    assert results[0]["distance"] == pytest.approx(0.12)
    assert results[1]["session_id"] == "s-2"
```

- [ ] **Stap 4.2: Draai de test — verwacht FAIL**

```bash
pytest tests/test_memory.py::test_recall_context_returns_sorted_memories -v
```

Verwacht: `ImportError: cannot import name 'recall_context' from 'tools.memory'`

- [ ] **Stap 4.3: Voeg recall_context toe aan tools/memory.py**

Voeg onderaan `mcp-server/tools/memory.py` toe:

```python
async def recall_context(
    query: str,
    patient_id: str,
    limit: int,
    embed: EmbeddingProvider,
) -> list[dict]:
    """Zoek semantisch gerelateerde herinneringen voor een patiënt.

    Args:
        query:      zoekterm of vraagzin
        patient_id: UUID van de patiënt
        limit:      maximaal aantal resultaten
        embed:      embedding provider instantie
    Returns:
        lijst van dicts met keys: content, source, session_id, distance
    """
    vector = await embed.embed(query)
    collection = get_collection()
    results = collection.query(
        query_embeddings=[vector],
        where={"patient_id": patient_id},
        n_results=limit,
    )
    memories = []
    for i, doc in enumerate(results["documents"][0]):
        meta = results["metadatas"][0][i]
        memories.append({
            "content": doc,
            "source": meta["source"],
            "session_id": meta["session_id"],
            "distance": results["distances"][0][i],
        })
    return memories
```

- [ ] **Stap 4.4: Draai alle tests — verwacht PASS**

```bash
pytest tests/ -v
```

Verwacht:
```
PASSED tests/test_embedding.py::test_embedding_provider_is_abstract
PASSED tests/test_embedding.py::test_ollama_embed_returns_1024_vector
PASSED tests/test_embedding.py::test_ollama_embed_raises_on_connection_error
PASSED tests/test_embedding.py::test_get_embedding_provider_returns_ollama
PASSED tests/test_memory.py::test_store_memory_adds_to_chromadb
PASSED tests/test_memory.py::test_store_memory_propagates_embedding_error
PASSED tests/test_memory.py::test_recall_context_returns_sorted_memories
7 passed
```

- [ ] **Stap 4.5: Commit**

```bash
git add mcp-server/tools/memory.py mcp-server/tests/test_memory.py
git commit -m "feat: implement recall_context tool with ChromaDB vector search"
```

---

## Task 5: MCP-tools registreren in main.py

**Files:**
- Modify: `mcp-server/main.py`

- [ ] **Stap 5.1: Vervang de volledige inhoud van mcp-server/main.py**

```python
import os

from fastmcp import FastMCP

from services.embedding import get_embedding_provider
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
    """Sla een geheugenblok op voor een patiënt.

    Args:
        content:    de te onthouden tekst
        source:     'patient_stated' of 'ai_inferred'
        patient_id: UUID van de patiënt
        session_id: UUID van de huidige sessie
    Returns:
        UUID van het opgeslagen document
    """
    return await _store_memory(content, source, patient_id, session_id, _embed)


@mcp.tool()
async def recall_context(
    query: str,
    patient_id: str,
    limit: int,
) -> list[dict]:
    """Haal semantisch gerelateerde herinneringen op voor een patiënt.

    Args:
        query:      zoekterm of vraagzin
        patient_id: UUID van de patiënt
        limit:      maximaal aantal resultaten
    Returns:
        lijst van dicts met keys: content, source, session_id, distance
    """
    return await _recall_context(query, patient_id, limit, _embed)


if __name__ == "__main__":
    port = int(os.getenv("MCP_PORT", "8001"))
    mcp.run(transport="sse", host="0.0.0.0", port=port)
```

- [ ] **Stap 5.2: Controleer dat de tests nog steeds PASS**

```bash
pytest tests/ -v
```

Verwacht: `7 passed`

- [ ] **Stap 5.3: Commit**

```bash
git add mcp-server/main.py
git commit -m "feat: register store_memory and recall_context as MCP tools in main.py"
```

---

## Task 6: Docker Compose — ollama-init + mcp-server env vars

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Stap 6.1: Voeg ollama-init service toe en mcp-server env vars**

Vervang in `docker-compose.yml` het `mcp-server` blok en voeg `ollama-init` toe.

Vervang het bestaande `mcp-server` blok:

```yaml
  # --- MCP Server (fastmcp) ---

  mcp-server:
    build: ./mcp-server
    restart: unless-stopped
    ports:
      - "8001:8001"
    volumes:
      - ./mcp-server:/app
    environment:
      CHROMA_HOST: chromadb
      CHROMA_PORT: 8000
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      MCP_PORT: 8001
      OLLAMA_BASE_URL: http://ollama:11434
      EMBEDDING_MODEL: ${EMBEDDING_MODEL}
    depends_on:
      postgres:
        condition: service_healthy
      chromadb:
        condition: service_started
      ollama:
        condition: service_started
```

Voeg onderaan (vóór `volumes:`) toe:

```yaml
  # --- Ollama model init (eenmalig bij opstart) ---

  ollama-init:
    image: ollama/ollama
    depends_on:
      - ollama
    entrypoint: ["ollama", "pull", "bge-m3"]
    environment:
      OLLAMA_HOST: http://ollama:11434
    restart: "no"
```

- [ ] **Stap 6.2: Voeg EMBEDDING_MODEL toe aan .env.example**

Voeg toe aan `.env.example`:

```
EMBEDDING_MODEL=bge-m3
```

- [ ] **Stap 6.3: Voeg EMBEDDING_MODEL toe aan je lokale .env**

Voeg toe aan `.env`:

```
EMBEDDING_MODEL=bge-m3
```

- [ ] **Stap 6.4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: add ollama-init service for bge-m3 pull and embedding env vars"
```

---

## Task 7: STAPPEN.md bijwerken

**Files:**
- Modify: `portfolio/STAPPEN.md`

- [ ] **Stap 7.1: Voeg stap 10 toe aan portfolio/STAPPEN.md**

Voeg onderaan toe:

```markdown
## Stap 10 — 2026-05-08

**Wat:** Embedding model gekozen en geïmplementeerd (DL2).

**Gedaan:**
- `services/embedding.py` — `EmbeddingProvider` ABC, `OllamaEmbeddingProvider`, `EmbeddingUnavailableError`
- `tools/memory.py` — `store_memory` en `recall_context` met ChromaDB
- `main.py` — tools geregistreerd als MCP tools
- `docker-compose.yml` — `ollama-init` service toegevoegd voor `bge-m3` pull
- 7 unit tests geschreven (TDD)

**Beslissingen:**
- bge-m3 gekozen: meertalig state-of-the-art, 8192-token context, past op RTX 4050 via Ollama model-swapping
- Embedding in MCP-server: RAG-laag blijft volledig in MCP, FastAPI raakt ChromaDB niet
- Provider-agnostisch patroon: wisselen = één nieuwe subklasse in embedding.py

**Commit:** [wordt ingevuld na commit]
```

- [ ] **Stap 7.2: Commit**

```bash
git add portfolio/STAPPEN.md
git commit -m "docs: log stap 10 — embedding model bge-m3 implemented"
```
