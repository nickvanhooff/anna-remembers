import pytest
from unittest.mock import MagicMock, patch

from services.embedding import EmbeddingProvider
from tools.memory import store_memory


class FakeEmbedder(EmbeddingProvider):
    """Fake embedder that always returns a fixed 1024-dim vector."""

    async def embed(self, text: str) -> list[float]:
        return [0.42] * 1024


@pytest.mark.asyncio
async def test_store_memory_adds_to_chromadb():
    """store_memory embeds content and calls collection.add()."""
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
    """If embedding fails, store_memory propagates the error — no silent failure."""
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


@pytest.mark.asyncio
async def test_recall_context_returns_sorted_memories():
    """recall_context queries ChromaDB and returns content + metadata."""
    mock_collection = MagicMock()
    mock_collection.query.return_value = {
        "documents": [["Ik voel me kortademig.", "Gewicht gestegen met 2 kg."]],
        "metadatas": [
            [
                {
                    "source": "patient_stated",
                    "session_id": "s-1",
                    "timestamp": "2026-05-01T10:00:00+00:00",
                },
                {
                    "source": "patient_stated",
                    "session_id": "s-2",
                    "timestamp": "2026-05-08T10:00:00+00:00",
                },
            ]
        ],
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
