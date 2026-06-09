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
         patch("tools.migration.get_embedding_provider_by_name") as mock_factory:

        mock_get_col.side_effect = lambda p: source_collection if p == "ollama" else target_collection
        mock_factory.return_value = mock_target_embed

        from tools.migration import migrate_embeddings
        result = await migrate_embeddings(source_provider="ollama", target_provider="openai")

        assert result["migrated"] == 2
        assert result["errors"] == 0
        assert target_collection.upsert.call_count == 2
