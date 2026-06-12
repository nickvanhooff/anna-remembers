# Portkey + Dual Embedding Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Portkey as LLM gateway (routing to OpenAI GPT-5.x), swap the escalation guardrail to DeepSeek via OpenAI-compatible API, add OpenAI embeddings as a switchable second provider with dual ChromaDB collections, and expose provider switching + migration in the frontend settings page.

**Architecture:** `PortkeyProvider` is added to `backend/services/llm.py` using the **`portkey_ai` SDK** (`from portkey_ai import AsyncPortkey`) — the same SDK as used in [r-huijts/portkeytester](https://github.com/r-huijts/portkeytester). The escalation guardrail in `_escalation.py` gets a parallel `openai_compat` branch for cloud models (DeepSeek, or any OpenAI-compatible endpoint). The embedding layer gains `OpenAIEmbeddingProvider` alongside the existing Ollama provider (direct OpenAI API, not via Portkey); ChromaDB maintains two named collections (`memories_bge_m3` and `memories_openai_3small`) selected at runtime via a mutable module-level holder in `mcp-server/main.py`. Two new MCP tools (`migrate_embeddings`, `switch_embedding_provider`) allow the backend to orchestrate a full provider migration. The frontend settings page adds a provider toggle and a migration button following the existing `tts_provider` pattern.

**Tech Stack:** `portkey-ai` SDK (LLM gateway), `openai` Python SDK (direct OpenAI embeddings + DeepSeek-compatible guardrail API), FastMCP MCP tools for migration, React settings page with existing `updateSetting()` / `getSettings()` hooks.

---

## File Map

| File | Change |
|---|---|
| `backend/requirements.txt` | Add `portkey-ai>=1.0,<2.0` + `openai>=1.0` |
| `backend/services/llm.py` | Add `PortkeyProvider` class + factory case |
| `backend/routers/chat/_escalation.py` | Add `openai_compat` branch for guardrail |
| `backend/routers/settings.py` | Add `POST /settings/migrate-embeddings` endpoint |
| `backend/services/mcp_client.py` | Add `migrate_embeddings()` + `switch_embedding_provider()` methods |
| `mcp-server/requirements.txt` | Add `openai>=1.0` |
| `mcp-server/services/embedding.py` | Add `OpenAIEmbeddingProvider` + update factory |
| `mcp-server/tools/memory.py` | Dual collections, `get_collection(provider)` keyed by name |
| `mcp-server/tools/migration.py` | New file: `migrate_embeddings(source, target)` logic |
| `mcp-server/main.py` | Mutable `_embed_holder`, two new MCP tools |
| `docker-compose.yml` | New env vars for both services |
| `frontend/.../settings-screen.tsx` | Embedding provider section + migration button |

---

## Task 1: Add SDK dependencies to requirements

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `mcp-server/requirements.txt`

> The [portkeytester repo](https://github.com/r-huijts/portkeytester) uses `portkey-ai>=1.0.0,<2.0.0` as the official Portkey SDK.
> `openai` is added separately for direct OpenAI embeddings and the DeepSeek-compatible guardrail.

- [ ] **Step 1: Add portkey-ai + openai to backend requirements**

In `backend/requirements.txt`, add:
```
portkey-ai>=1.0,<2.0
openai>=1.0
```

- [ ] **Step 2: Add openai to mcp-server requirements**

In `mcp-server/requirements.txt`, add:
```
openai>=1.0
```

- [ ] **Step 3: Verify Docker builds (dry-run)**

```bash
docker compose build backend mcp-server 2>&1 | tail -20
```
Expected: both services build without error.

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt mcp-server/requirements.txt
git commit -m "chore: add portkey-ai and openai SDK dependencies"
```

---

## Task 2: Portkey LLM Provider

**Files:**
- Modify: `backend/services/llm.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_llm.py` (or create if absent), add:

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

@pytest.mark.asyncio
async def test_portkey_provider_calls_chat_completions():
    """PortkeyProvider must use portkey_ai.AsyncPortkey and return model response."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "antwoord"
    mock_response.usage.prompt_tokens = 10
    mock_response.usage.completion_tokens = 5

    with patch("portkey_ai.AsyncPortkey") as mock_portkey_class:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_portkey_class.return_value = mock_client

        from services.llm import PortkeyProvider
        provider = PortkeyProvider(api_key="pk-test", model="gpt-4.1", config=None)
        result = await provider.chat([{"role": "user", "content": "hallo"}])

        assert result == "antwoord"
        mock_portkey_class.assert_called_once_with(api_key="pk-test", config=None)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker compose run --no-deps --rm backend pytest tests/test_llm.py -v 2>&1 | tail -20
```
Expected: `ImportError` or `AttributeError` — `PortkeyProvider` does not exist yet.

- [ ] **Step 3: Implement PortkeyProvider**

Add after the `GroqProvider` class in `backend/services/llm.py`, before `get_llm_provider()`:

```python
class PortkeyProvider(LLMProvider):
    """LLM provider via Portkey AI gateway (portkey_ai SDK, same pattern as r-huijts/portkeytester).

    Portkey routes to the configured virtual key target (OpenAI, Anthropic, etc.)
    based on the config set in the Portkey dashboard.
    """

    def __init__(self, api_key: str, model: str, config: str | None = None) -> None:
        self.api_key = api_key
        self.model = model
        self.config = config  # optional Portkey config ID or virtual key slug

    async def chat(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
    ) -> str:
        from portkey_ai import AsyncPortkey

        client = AsyncPortkey(api_key=self.api_key, config=self.config)

        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        langfuse = get_client()
        with langfuse.start_as_current_observation(
            as_type="generation",
            name="llm-generation",
            model=self.model,
            input=all_messages,
        ) as gen:
            response = await client.chat.completions.create(
                model=self.model,
                messages=all_messages,
                max_tokens=1024,
            )
            result = response.choices[0].message.content or ""
            gen.update(
                output=result,
                usage_details={
                    "input": response.usage.prompt_tokens,
                    "output": response.usage.completion_tokens,
                },
            )
        return result
```

- [ ] **Step 4: Add factory case**

In `get_llm_provider()` in `backend/services/llm.py`, add before the final `raise ValueError`:

```python
    if provider == "portkey":
        api_key = os.getenv("PORTKEY_API_KEY", "")
        if not api_key:
            raise ValueError("PORTKEY_API_KEY is niet ingesteld in de omgeving.")
        return PortkeyProvider(
            api_key=api_key,
            model=os.getenv("PORTKEY_MODEL", "gpt-4.1"),
            config=os.getenv("PORTKEY_CONFIG", None),
        )
```

Also update the docstring of `get_llm_provider()`:
```python
    LLM_PROVIDER=portkey       →  PortkeyProvider (Portkey AI gateway → OpenAI, etc.)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
docker compose run --no-deps --rm backend pytest tests/test_llm.py -v 2>&1 | tail -20
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/services/llm.py backend/tests/test_llm.py
git commit -m "feat: add PortkeyProvider to LLM factory (routes to OpenAI via Portkey gateway)"
```

---

## Task 3: DeepSeek guardrail via OpenAI-compatible API

**Files:**
- Modify: `backend/routers/chat/_escalation.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_escalation.py`, add:

```python
@pytest.mark.asyncio
async def test_layer1_uses_openai_compat_when_configured(monkeypatch):
    """When ESCALATION_PROVIDER=openai_compat, layer1 must call OpenAI SDK, not Ollama."""
    import backend.routers.chat._escalation as esc_module

    monkeypatch.setattr(esc_module, "_ESCALATION_PROVIDER", "openai_compat")
    monkeypatch.setattr(esc_module, "_ESCALATION_API_KEY", "ds-test-key")
    monkeypatch.setattr(esc_module, "_ESCALATION_BASE_URL", "https://api.deepseek.com/v1")
    monkeypatch.setattr(esc_module, "_ESCALATION_MODEL", "deepseek-chat")

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = '{"escalate": false, "urgency": "low", "reason": "test"}'

    with patch("openai.AsyncOpenAI") as mock_openai_class:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        mock_openai_class.return_value = mock_client

        raw = await esc_module._classify_openai_compat("ik voel me goed")
        assert raw == '{"escalate": false, "urgency": "low", "reason": "test"}'
        mock_openai_class.assert_called_once()
        call_kwargs = mock_openai_class.call_args.kwargs
        assert call_kwargs["base_url"] == "https://api.deepseek.com/v1"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker compose run --no-deps --rm backend pytest tests/test_escalation.py::test_layer1_uses_openai_compat_when_configured -v 2>&1 | tail -20
```
Expected: `AttributeError` — `_classify_openai_compat` does not exist.

- [ ] **Step 3: Extract Ollama call to helper + add openai_compat helper**

In `backend/routers/chat/_escalation.py`, add after the module-level constants (after line 65):

```python
_ESCALATION_PROVIDER = os.getenv("ESCALATION_PROVIDER", "ollama")  # ollama | openai_compat
_ESCALATION_BASE_URL = os.getenv("ESCALATION_BASE_URL", "https://api.deepseek.com/v1")
_ESCALATION_API_KEY = os.getenv("ESCALATION_API_KEY", "")
```

Then add two helper functions before `layer1_classify`:

```python
async def _classify_ollama(patient_message: str) -> str:
    """Call local Ollama for escalation classification."""
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            f"{_OLLAMA_BASE_URL}/api/chat",
            json={
                "model": _ESCALATION_MODEL,
                "messages": [
                    {"role": "system", "content": _CLASSIFY_SYSTEM},
                    {"role": "user", "content": f"Patient message: {patient_message}"},
                ],
                "stream": False,
                "format": "json",
                "options": {"num_predict": 128},
            },
        )
        response.raise_for_status()
        return response.json()["message"]["content"]


async def _classify_openai_compat(patient_message: str) -> str:
    """Call any OpenAI-compatible API for escalation classification (DeepSeek, etc.)."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=_ESCALATION_API_KEY, base_url=_ESCALATION_BASE_URL)
    response = await client.chat.completions.create(
        model=_ESCALATION_MODEL,
        messages=[
            {"role": "system", "content": _CLASSIFY_SYSTEM},
            {"role": "user", "content": f"Patient message: {patient_message}"},
        ],
        max_tokens=128,
        response_format={"type": "json_object"},
        timeout=90.0,
    )
    return response.choices[0].message.content or "{}"
```

- [ ] **Step 4: Replace the inline httpx block in layer1_classify**

In `layer1_classify`, replace the entire `async with httpx.AsyncClient` block (lines ~193–209) with:

```python
            if _ESCALATION_PROVIDER == "openai_compat":
                raw = await _classify_openai_compat(patient_message)
            else:
                raw = await _classify_ollama(patient_message)
            gen_span.update(output=raw)
```

Keep the `langfuse` span wrapper around this block. The span `input` is still `user_prompt = f"Patient message: {patient_message}"`.

- [ ] **Step 5: Run test to verify it passes**

```bash
docker compose run --no-deps --rm backend pytest tests/test_escalation.py -v 2>&1 | tail -20
```
Expected: all escalation tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/chat/_escalation.py backend/tests/test_escalation.py
git commit -m "feat: add openai_compat branch to escalation guardrail (enables DeepSeek v4)"
```

---

## Task 4: OpenAI EmbeddingProvider in mcp-server

**Files:**
- Modify: `mcp-server/services/embedding.py`

- [ ] **Step 1: Write the failing test**

In `mcp-server/tests/test_embedding.py`, add:

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_openai_embedding_provider_returns_vector():
    mock_response = MagicMock()
    mock_response.data = [MagicMock()]
    mock_response.data[0].embedding = [0.1, 0.2, 0.3]

    with patch("openai.AsyncOpenAI") as mock_openai_class:
        mock_client = AsyncMock()
        mock_client.embeddings.create = AsyncMock(return_value=mock_response)
        mock_openai_class.return_value = mock_client

        from services.embedding import OpenAIEmbeddingProvider
        provider = OpenAIEmbeddingProvider(api_key="test-key", model="text-embedding-3-small")
        result = await provider.embed("test text")

        assert result == [0.1, 0.2, 0.3]
        mock_client.embeddings.create.assert_called_once_with(
            input="test text", model="text-embedding-3-small"
        )


def test_get_embedding_provider_returns_openai_when_configured(monkeypatch):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    import importlib
    import services.embedding as emb_mod
    importlib.reload(emb_mod)

    from services.embedding import OpenAIEmbeddingProvider
    provider = emb_mod.get_embedding_provider()
    assert isinstance(provider, OpenAIEmbeddingProvider)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker compose run --no-deps --rm mcp-server pytest tests/test_embedding.py -v 2>&1 | tail -20
```
Expected: `ImportError` — `OpenAIEmbeddingProvider` does not exist.

- [ ] **Step 3: Add OpenAIEmbeddingProvider**

Append to `mcp-server/services/embedding.py`:

```python
class OpenAIEmbeddingProvider(EmbeddingProvider):
    """Embedding provider via OpenAI text-embedding API."""

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    async def embed(self, text: str) -> list[float]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.embeddings.create(input=text, model=self.model)
        return response.data[0].embedding
```

- [ ] **Step 4: Update factory**

Replace the `get_embedding_provider()` function in `mcp-server/services/embedding.py`:

```python
def get_embedding_provider() -> EmbeddingProvider:
    """Factory — reads EMBEDDING_PROVIDER from environment.

    EMBEDDING_PROVIDER=ollama   →  OllamaEmbeddingProvider with bge-m3 (default)
    EMBEDDING_PROVIDER=openai   →  OpenAIEmbeddingProvider with text-embedding-3-small
    """
    provider = os.getenv("EMBEDDING_PROVIDER", "ollama")

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is niet ingesteld voor OpenAI embeddings.")
        return OpenAIEmbeddingProvider(
            api_key=api_key,
            model=os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
        )

    return OllamaEmbeddingProvider(
        model=os.getenv("EMBEDDING_MODEL", "bge-m3"),
        base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
    )
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
docker compose run --no-deps --rm mcp-server pytest tests/test_embedding.py -v 2>&1 | tail -20
```
Expected: all embedding tests PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/services/embedding.py mcp-server/tests/test_embedding.py
git commit -m "feat: add OpenAIEmbeddingProvider to mcp-server embedding factory"
```

---

## Task 5: Dual ChromaDB collections in memory.py

**Files:**
- Modify: `mcp-server/tools/memory.py`

- [ ] **Step 1: Write the failing test**

In `mcp-server/tests/test_memory.py`, add:

```python
def test_get_collection_returns_different_collections_per_provider():
    """Two different providers must return two different named collections."""
    import chromadb
    from unittest.mock import MagicMock, patch

    mock_chroma = MagicMock()
    bge_collection = MagicMock()
    openai_collection = MagicMock()

    def fake_get_or_create(name, metadata):
        if "bge" in name:
            return bge_collection
        return openai_collection

    mock_chroma.get_or_create_collection.side_effect = fake_get_or_create

    with patch("chromadb.HttpClient", return_value=mock_chroma):
        import importlib
        import tools.memory as mem_mod
        importlib.reload(mem_mod)

        col_ollama = mem_mod.get_collection("ollama")
        col_openai = mem_mod.get_collection("openai")

        assert col_ollama is bge_collection
        assert col_openai is openai_collection
        assert col_ollama is not col_openai
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker compose run --no-deps --rm mcp-server pytest tests/test_memory.py::test_get_collection_returns_different_collections_per_provider -v 2>&1 | tail -20
```
Expected: `TypeError` — `get_collection()` takes 0 arguments.

- [ ] **Step 3: Update memory.py**

Replace `mcp-server/tools/memory.py` entirely:

```python
import hashlib
import os
from datetime import datetime, timezone

import chromadb

from services.embedding import EmbeddingProvider

_collections: dict[str, chromadb.Collection] = {}

_COLLECTION_NAMES: dict[str, str] = {
    "ollama": "memories_bge_m3",
    "openai": "memories_openai_3small",
}


def get_collection(provider: str) -> chromadb.Collection:
    """Return (or lazily create) the ChromaDB collection for the given embedding provider."""
    if provider not in _collections:
        client = chromadb.HttpClient(
            host=os.getenv("CHROMA_HOST", "chromadb"),
            port=int(os.getenv("CHROMA_PORT", "8000")),
        )
        name = _COLLECTION_NAMES.get(provider, f"memories_{provider}")
        _collections[provider] = client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )
    return _collections[provider]


async def store_memory(
    content: str,
    source: str,
    patient_id: str,
    session_id: str,
    embed: EmbeddingProvider,
    provider: str,
) -> str:
    """Embed content and store it in the collection for the active provider."""
    vector = await embed.embed(content)
    collection = get_collection(provider)
    doc_id = hashlib.sha256(f"{patient_id}:{content}".encode()).hexdigest()[:32]
    collection.upsert(
        embeddings=[vector],
        documents=[content],
        metadatas=[
            {
                "patient_id": patient_id,
                "session_id": session_id,
                "source": source,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
        ids=[doc_id],
    )
    return doc_id


async def recall_context(
    query: str,
    patient_id: str,
    limit: int,
    embed: EmbeddingProvider,
    provider: str,
) -> list[dict]:
    """Search semantically related memories in the collection for the active provider."""
    vector = await embed.embed(query)
    collection = get_collection(provider)
    results = collection.query(
        query_embeddings=[vector],
        where={"patient_id": patient_id},
        n_results=limit,
    )
    memories: list[dict] = []
    for i, doc in enumerate(results["documents"][0]):
        meta = results["metadatas"][0][i]
        memories.append(
            {
                "content": doc,
                "source": meta["source"],
                "session_id": meta["session_id"],
                "distance": results["distances"][0][i],
            }
        )
    return memories
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose run --no-deps --rm mcp-server pytest tests/test_memory.py -v 2>&1 | tail -20
```
Expected: all memory tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/tools/memory.py mcp-server/tests/test_memory.py
git commit -m "feat: dual ChromaDB collections — memories_bge_m3 and memories_openai_3small"
```

---

## Task 6: Migration tool + update mcp-server main.py

**Files:**
- Create: `mcp-server/tools/migration.py`
- Modify: `mcp-server/main.py`

- [ ] **Step 1: Write the failing test**

Create `mcp-server/tests/test_migration.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_migrate_embeddings_re_embeds_all_documents():
    """Migration must read all docs from source, re-embed with target, upsert to target."""
    source_collection = MagicMock()
    source_collection.get.return_value = {
        "ids": ["abc123", "def456"],
        "documents": ["pijn op de borst", "medicijn genomen"],
        "metadatas": [
            {"patient_id": "p1", "session_id": "s1", "source": "patient_stated", "timestamp": "2026-01-01T00:00:00Z"},
            {"patient_id": "p1", "session_id": "s1", "source": "patient_stated", "timestamp": "2026-01-01T00:00:00Z"},
        ],
    }

    target_collection = MagicMock()

    mock_target_embed = AsyncMock()
    mock_target_embed.embed = AsyncMock(side_effect=[[0.1, 0.2], [0.3, 0.4]])

    with patch("tools.memory.get_collection") as mock_get_col, \
         patch("services.embedding.get_embedding_provider") as mock_factory:

        mock_get_col.side_effect = lambda p: source_collection if p == "ollama" else target_collection
        mock_factory.return_value = mock_target_embed

        from tools.migration import migrate_embeddings
        result = await migrate_embeddings(source_provider="ollama", target_provider="openai")

        assert result["migrated"] == 2
        assert result["errors"] == 0
        assert target_collection.upsert.call_count == 2
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker compose run --no-deps --rm mcp-server pytest tests/test_migration.py -v 2>&1 | tail -20
```
Expected: `ModuleNotFoundError` — `tools.migration` does not exist.

- [ ] **Step 3: Create migration.py**

Create `mcp-server/tools/migration.py`:

```python
"""One-shot migration: re-embeds all memories from one ChromaDB collection to another."""

import logging
import os

from services.embedding import get_embedding_provider
from tools.memory import get_collection

logger = logging.getLogger(__name__)


async def migrate_embeddings(source_provider: str, target_provider: str) -> dict:
    """Re-embed all memories from source_provider collection into target_provider collection.

    Idempotent: documents with the same ID are upserted, so re-running is safe.

    Returns:
        {"migrated": int, "errors": int}
    """
    if source_provider == target_provider:
        return {"migrated": 0, "errors": 0, "message": "Source en target zijn hetzelfde."}

    source_col = get_collection(source_provider)
    target_col = get_collection(target_provider)

    all_docs = source_col.get(include=["documents", "metadatas"])
    ids = all_docs.get("ids", [])
    documents = all_docs.get("documents", [])
    metadatas = all_docs.get("metadatas", [])

    if not ids:
        logger.info("Migratie: geen documenten gevonden in %s", source_provider)
        return {"migrated": 0, "errors": 0}

    target_embed = get_embedding_provider_by_name(target_provider)

    migrated = 0
    errors = 0
    for doc_id, content, meta in zip(ids, documents, metadatas):
        try:
            vector = await target_embed.embed(content)
            target_col.upsert(
                embeddings=[vector],
                documents=[content],
                metadatas=[meta],
                ids=[doc_id],
            )
            migrated += 1
        except Exception as exc:
            logger.error("Migratie mislukt voor doc %s: %s", doc_id, exc)
            errors += 1

    logger.info("Migratie klaar: %d gemigreerd, %d fouten", migrated, errors)
    return {"migrated": migrated, "errors": errors}


def get_embedding_provider_by_name(provider: str):
    """Temporarily override EMBEDDING_PROVIDER env var and call the factory."""
    original = os.environ.get("EMBEDDING_PROVIDER", "ollama")
    os.environ["EMBEDDING_PROVIDER"] = provider
    try:
        return get_embedding_provider()
    finally:
        os.environ["EMBEDDING_PROVIDER"] = original
```

- [ ] **Step 4: Update mcp-server/main.py**

Replace `mcp-server/main.py` entirely:

```python
import logging
import os
from contextlib import asynccontextmanager

from fastmcp import FastMCP

from services.embedding import EmbeddingProvider, get_embedding_provider
from tools.escalation import escalate_to_human as _escalate_to_human
from tools.memory import recall_context as _recall_context
from tools.memory import store_memory as _store_memory
from tools.migration import migrate_embeddings as _migrate_embeddings, get_embedding_provider_by_name

_log = logging.getLogger(__name__)


class _EmbedHolder:
    """Mutable wrapper so MCP tools can hot-swap the active embedding provider."""
    def __init__(self) -> None:
        self.provider_name: str = os.getenv("EMBEDDING_PROVIDER", "ollama")
        self.instance: EmbeddingProvider = get_embedding_provider()


_holder = _EmbedHolder()


@asynccontextmanager
async def lifespan(app: FastMCP):
    try:
        await _holder.instance.embed("warmup")
        _log.info("Embedding provider '%s' warm en geladen", _holder.provider_name)
    except Exception as e:
        _log.warning("Warmup mislukt: %s", e)
    yield


mcp = FastMCP("anna-remembers-mcp", lifespan=lifespan)


@mcp.tool()
async def store_memory(
    content: str,
    source: str,
    patient_id: str,
    session_id: str,
) -> str:
    """Store a memory block for a patient."""
    return await _store_memory(content, source, patient_id, session_id, _holder.instance, _holder.provider_name)


@mcp.tool()
async def recall_context(
    query: str,
    patient_id: str,
    limit: int,
) -> list[dict]:
    """Retrieve semantically related memories for a patient."""
    return await _recall_context(query, patient_id, limit, _holder.instance, _holder.provider_name)


@mcp.tool()
async def escalate_to_human(
    patient_id: str,
    reason: str,
    urgency: str,
) -> str:
    """Escalate to a care provider. urgency: low | medium | high. Returns escalation ID."""
    return await _escalate_to_human(patient_id, reason, urgency)


@mcp.tool()
async def switch_embedding_provider(provider: str) -> str:
    """Hot-swap the active embedding provider. provider: 'ollama' | 'openai'.

    Updates the in-memory provider immediately. New store_memory and recall_context
    calls will use the new provider and its collection. Call migrate_all_memories
    first to ensure existing memories are available in the new collection.
    """
    if provider not in ("ollama", "openai"):
        raise ValueError(f"Onbekende provider: '{provider}'. Kies 'ollama' of 'openai'.")
    os.environ["EMBEDDING_PROVIDER"] = provider
    _holder.provider_name = provider
    _holder.instance = get_embedding_provider_by_name(provider)
    _log.info("Embedding provider gewisseld naar '%s'", provider)
    return provider


@mcp.tool()
async def migrate_all_memories(source_provider: str, target_provider: str) -> dict:
    """Migrate all memories from source collection to target collection.

    Re-embeds each memory with the target provider. Idempotent — safe to run twice.
    Returns {"migrated": int, "errors": int}.
    """
    return await _migrate_embeddings(source_provider, target_provider)


if __name__ == "__main__":
    port = int(os.getenv("MCP_PORT", "8001"))
    mcp.run(transport="sse", host="0.0.0.0", port=port)
```

- [ ] **Step 5: Run all mcp-server tests**

```bash
docker compose run --no-deps --rm mcp-server pytest -v 2>&1 | tail -30
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/tools/migration.py mcp-server/tests/test_migration.py mcp-server/main.py
git commit -m "feat: migration tool + switch_embedding_provider MCP tool, dual-collection hot-swap"
```

---

## Task 7: Backend migration endpoint + MCPClient methods

**Files:**
- Modify: `backend/services/mcp_client.py`
- Modify: `backend/routers/settings.py`

- [ ] **Step 1: Read mcp_client.py to understand existing method pattern**

```bash
cat backend/services/mcp_client.py
```

Note the exact pattern used for `escalate_to_human` — the migration methods follow the same pattern.

- [ ] **Step 2: Add migrate and switch methods to MCPClient**

In `backend/services/mcp_client.py`, add two methods following the same pattern as `escalate_to_human`:

```python
async def migrate_all_memories(self, source_provider: str, target_provider: str) -> dict:
    """Trigger embedding migration from source to target collection."""
    result = await self._call_tool(
        "migrate_all_memories",
        {"source_provider": source_provider, "target_provider": target_provider},
    )
    return result

async def switch_embedding_provider(self, provider: str) -> str:
    """Hot-swap the active embedding provider in the MCP server."""
    result = await self._call_tool(
        "switch_embedding_provider",
        {"provider": provider},
    )
    return result
```

(Replace `_call_tool` with whatever the actual internal method name is in the existing MCPClient.)

- [ ] **Step 3: Add migration endpoint to settings router**

In `backend/routers/settings.py`, add at the end:

```python
import os
from pydantic import BaseModel


class MigrateEmbeddingsRequest(BaseModel):
    target_provider: str  # "ollama" | "openai"


@router.post("/migrate-embeddings")
async def migrate_embeddings(
    body: MigrateEmbeddingsRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Migrate all ChromaDB memories to a new embedding provider.

    Steps:
    1. Read current active provider from DB settings.
    2. Call MCP server to migrate memories from current → target collection.
    3. Call MCP server to switch active provider.
    4. Persist new embedding_provider in DB settings.
    """
    from services.mcp_client import MCPClient

    if body.target_provider not in ("ollama", "openai"):
        raise HTTPException(status_code=400, detail="target_provider must be 'ollama' or 'openai'")

    # Read current provider from DB (fallback to env if not set)
    current_setting = db.query(Setting).filter(Setting.key == "embedding_provider").first()
    source_provider = current_setting.value if current_setting else os.getenv("EMBEDDING_PROVIDER", "ollama")

    mcp_url = os.getenv("MCP_URL", "http://mcp-server:8001")
    mcp = MCPClient(base_url=mcp_url)

    # Step 1: migrate memories
    migration_result = await mcp.migrate_all_memories(source_provider, body.target_provider)

    # Step 2: hot-swap provider in MCP server
    await mcp.switch_embedding_provider(body.target_provider)

    # Step 3: persist in DB
    if current_setting:
        current_setting.value = body.target_provider
    else:
        db.add(Setting(key="embedding_provider", value=body.target_provider))
    db.commit()

    return {
        "source_provider": source_provider,
        "target_provider": body.target_provider,
        **migration_result,
    }
```

- [ ] **Step 4: Run backend tests**

```bash
docker compose run --no-deps --rm backend pytest -v 2>&1 | tail -30
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/mcp_client.py backend/routers/settings.py
git commit -m "feat: POST /settings/migrate-embeddings — orchestrates MCP migration + provider switch"
```

---

## Task 8: Docker Compose env vars

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add env vars to backend service**

In the `backend` service `environment:` block, add:

```yaml
      # Portkey / OpenAI
      - PORTKEY_API_KEY=${PORTKEY_API_KEY:-}
      - PORTKEY_MODEL=${PORTKEY_MODEL:-gpt-4.1}
      - PORTKEY_CONFIG=${PORTKEY_CONFIG:-}
      # Escalation guardrail
      - ESCALATION_PROVIDER=${ESCALATION_PROVIDER:-ollama}
      - ESCALATION_API_KEY=${ESCALATION_API_KEY:-}
      - ESCALATION_BASE_URL=${ESCALATION_BASE_URL:-https://api.deepseek.com/v1}
      - ESCALATION_MODEL=${ESCALATION_MODEL:-deepseek-chat}
```

- [ ] **Step 2: Add env vars to mcp-server service**

In the `mcp-server` service `environment:` block, add:

```yaml
      # Embedding provider
      - EMBEDDING_PROVIDER=${EMBEDDING_PROVIDER:-ollama}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - OPENAI_EMBEDDING_MODEL=${OPENAI_EMBEDDING_MODEL:-text-embedding-3-small}
```

- [ ] **Step 3: Add vars to .env.example (or your .env)**

```bash
# Portkey
PORTKEY_API_KEY=pk-...
PORTKEY_MODEL=gpt-4.1
PORTKEY_CONFIG=

# Escalation guardrail (DeepSeek)
ESCALATION_PROVIDER=openai_compat
ESCALATION_API_KEY=sk-...
ESCALATION_BASE_URL=https://api.deepseek.com/v1
ESCALATION_MODEL=deepseek-chat

# Embeddings
EMBEDDING_PROVIDER=ollama
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

- [ ] **Step 4: Verify stack starts**

```bash
docker compose up backend mcp-server --no-deps -d 2>&1 | tail -20
docker compose logs backend --tail 10
docker compose logs mcp-server --tail 10
```
Expected: both services start, no missing env var errors.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add Portkey, DeepSeek, and OpenAI embedding env vars to docker-compose"
```

---

## Task 9: Frontend settings — embedding provider toggle + migration button

**Files:**
- Modify: `frontend/Anna-remembers/components/settings/settings-screen.tsx`

- [ ] **Step 1: Add embedding provider state**

In `settings-screen.tsx`, inside the component (alongside `ttsProvider` state), add:

```tsx
const [embeddingProvider, setEmbeddingProvider] = useState<string>("ollama");
const [migrating, setMigrating] = useState(false);
const [migrationResult, setMigrationResult] = useState<{ migrated: number; errors: number } | null>(null);
```

- [ ] **Step 2: Load embedding_provider in the existing useEffect**

In the `useEffect` that calls `getSettings()`, add:

```tsx
setEmbeddingProvider(data.embedding_provider ?? "ollama");
```

- [ ] **Step 3: Add migration handler**

Add this function inside the component:

```tsx
const handleEmbeddingProviderChange = async (newProvider: string) => {
  if (newProvider === embeddingProvider) return;
  setMigrating(true);
  setMigrationResult(null);
  try {
    const res = await fetch("/api/settings/migrate-embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_provider: newProvider }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setEmbeddingProvider(newProvider);
    setMigrationResult({ migrated: data.migrated, errors: data.errors });
  } catch (err) {
    console.error("Migratie mislukt:", err);
    setMigrationResult({ migrated: 0, errors: -1 });
  } finally {
    setMigrating(false);
  }
};
```

- [ ] **Step 4: Add UI section**

Add a new section in the JSX, following the existing TTS Provider section pattern:

```tsx
{/* Embedding Provider */}
<div className="space-y-3">
  <h3 className="text-sm font-medium text-gray-700">Embedding Provider</h3>
  <p className="text-xs text-gray-500">
    Wisselen migreert alle herinneringen naar de nieuwe collectie. Dit kan even duren.
  </p>
  <select
    value={embeddingProvider}
    onChange={(e) => handleEmbeddingProviderChange(e.target.value)}
    disabled={migrating}
    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
  >
    <option value="ollama">Lokaal — bge-m3 (Ollama)</option>
    <option value="openai">OpenAI — text-embedding-3-small</option>
  </select>

  {migrating && (
    <p className="text-xs text-blue-600">Migratie bezig... even geduld.</p>
  )}
  {migrationResult && migrationResult.errors >= 0 && (
    <p className="text-xs text-green-600">
      Migratie klaar: {migrationResult.migrated} herinneringen overgezet
      {migrationResult.errors > 0 ? `, ${migrationResult.errors} fouten` : ""}.
    </p>
  )}
  {migrationResult && migrationResult.errors === -1 && (
    <p className="text-xs text-red-600">Migratie mislukt. Controleer de logs.</p>
  )}
</div>
```

- [ ] **Step 5: Test in browser**

```bash
docker compose up frontend -d
```

Open `http://localhost:3001/settings`. Verify:
- Embedding Provider dropdown renders with correct initial value.
- Selecting a different option shows "Migratie bezig..." while the call is in-flight.
- After completion, shows migration result.
- The dropdown does not change until migration completes successfully.

- [ ] **Step 6: Commit**

```bash
git add frontend/Anna-remembers/components/settings/settings-screen.tsx
git commit -m "feat: embedding provider toggle + migration button in settings page"
```

---

## Task 10: Update STAPPEN.md

**Files:**
- Modify: `portfolio/STAPPEN.md`

- [ ] **Step 1: Append new stap to STAPPEN.md**

Add a new stap entry at the bottom of `portfolio/STAPPEN.md` documenting:
- Portkey LLM provider toevoegd aan `llm.py`
- DeepSeek guardrail branch in `_escalation.py`
- OpenAI EmbeddingProvider + dual ChromaDB collections
- Migratie-tool als MCP tool
- Frontend provider toggle

Include the commit hashes from the commits above.

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Portkey als LLM gateway | Task 2 |
| DeepSeek v4 als guardrail (openai_compat) | Task 3 |
| OpenAI embeddings als provider | Task 4 |
| Dual ChromaDB collections, bge-m3 data behouden | Task 5 |
| Migratie van bge-m3 → OpenAI bij switch | Task 6 |
| Teruggaan naar bge-m3 werkt met oude data | Task 5 (aparte collections, data blijft) |
| Frontend toggle in settings | Task 9 |
| Docker env vars | Task 8 |

**Placeholder scan:** geen TBD of TODO in de plan — alle code is volledig.

**Type consistency:** `provider: str` param toegevoegd aan `store_memory` en `recall_context` in Task 5, en consistent gebruikt in Task 6 (main.py) waar `_holder.provider_name` doorgegeven wordt.
