import hashlib
import os
from datetime import datetime, timezone

import chromadb

from services.embedding import EmbeddingProvider

_collections: dict[str, chromadb.Collection] = {}

_COLLECTION_NAMES: dict[str, str] = {
    "ollama": "memories_bge_m3",
    "openai": "memories_openai_3small",
    "portkey": "memories_openai_3large",
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
