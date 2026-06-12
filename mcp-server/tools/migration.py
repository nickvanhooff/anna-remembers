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
