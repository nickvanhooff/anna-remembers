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
    """EmbeddingProvider cannot be instantiated directly."""
    with pytest.raises(TypeError):
        EmbeddingProvider()


@pytest.mark.asyncio
@respx.mock
async def test_ollama_embed_returns_1024_vector():
    """Happy path: Ollama returns 1024 floats."""
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
    """If Ollama is unreachable, embed() raises EmbeddingUnavailableError."""
    import httpx
    respx.post("http://localhost:11434/api/embed").mock(
        side_effect=httpx.ConnectError("connection refused")
    )
    provider = OllamaEmbeddingProvider(model="bge-m3", base_url="http://localhost:11434")
    with pytest.raises(EmbeddingUnavailableError, match="Ollama onbereikbaar"):
        await provider.embed("test")


def test_get_embedding_provider_returns_ollama(monkeypatch):
    """Factory returns OllamaEmbeddingProvider with values from env."""
    monkeypatch.setenv("EMBEDDING_MODEL", "bge-m3")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama:11434")
    provider = get_embedding_provider()
    assert isinstance(provider, OllamaEmbeddingProvider)
    assert provider.model == "bge-m3"
