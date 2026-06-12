import logging
import os
from contextlib import asynccontextmanager

from fastmcp import FastMCP

from services.embedding import EmbeddingProvider, get_embedding_provider
from tools.escalation import escalate_to_human as _escalate_to_human
from tools.memory import recall_context as _recall_context
from tools.memory import store_memory as _store_memory
from tools.migration import migrate_embeddings as _migrate_embeddings
from tools.migration import get_embedding_provider_by_name

_log = logging.getLogger(__name__)


class _EmbedHolder:
    """Mutable wrapper so MCP tools can hot-swap the active embedding provider."""

    def __init__(self) -> None:
        self.provider_name: str = os.getenv("EMBEDDING_PROVIDER", "ollama")
        self.instance: EmbeddingProvider = get_embedding_provider()


_holder = _EmbedHolder()


@asynccontextmanager
async def lifespan(app: FastMCP):
    import asyncio

    async def _warmup() -> None:
        try:
            await _holder.instance.embed("warmup")
            _log.info("Embedding provider '%s' warm en geladen", _holder.provider_name)
        except Exception as e:
            _log.warning("Warmup mislukt: %s", e)

    # Start warmup in background so the server accepts connections immediately.
    asyncio.create_task(_warmup())
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
    if provider not in ("ollama", "openai", "portkey"):
        raise ValueError(f"Onbekende provider: '{provider}'. Kies 'ollama', 'openai' of 'portkey'.")
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
