import hashlib
import os
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
    """Embedt content en slaat het op in ChromaDB."""
    vector = await embed.embed(content)
    collection = get_collection()
    # Deterministisch ID: zelfde inhoud + zelfde patiënt → zelfde document (geen duplicaten)
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
) -> list[dict]:
    """Zoek semantisch gerelateerde herinneringen voor een patiënt."""
    vector = await embed.embed(query)
    collection = get_collection()
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
