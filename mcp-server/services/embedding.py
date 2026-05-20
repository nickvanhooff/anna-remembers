import os
from abc import ABC, abstractmethod

import httpx


class EmbeddingProvider(ABC):
    """Abstract base for all embedding providers.

    Adding a provider = new subclass + register in get_embedding_provider().
    """

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Convert text to a float vector.

        Args:
            text: text to embed
        Returns:
            list of floats (dimensions depend on model)
        """
        ...


class EmbeddingUnavailableError(Exception):
    """Raised when the embedding provider is unreachable."""


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Embedding provider via Ollama /api/embed (bge-m3 by default)."""

    def __init__(self, model: str, base_url: str) -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")

    async def embed(self, text: str) -> list[float]:
        """Request a vector from Ollama.

        Raises:
            EmbeddingUnavailableError: if Ollama is unreachable
        """
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
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
    """Factory — reads desired provider from environment.

    EMBEDDING_MODEL and OLLAMA_BASE_URL are read from env.
    """
    return OllamaEmbeddingProvider(
        model=os.getenv("EMBEDDING_MODEL", "bge-m3"),
        base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
    )
