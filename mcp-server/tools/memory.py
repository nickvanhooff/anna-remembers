import hashlib
import os
from datetime import datetime, timezone

import chromadb

from services.embedding import EmbeddingProvider

_collection = None


def get_collection():
    """Lazy-init of the ChromaDB collection (singleton per process)."""
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
    """Embed content and store it in ChromaDB."""
    vector = await embed.embed(content)
    collection = get_collection()
    # Deterministic ID: same content + same patient → same document (no duplicates)
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
    """Search semantically related memories for a patient."""
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
