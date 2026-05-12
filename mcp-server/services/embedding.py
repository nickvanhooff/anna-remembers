import os
from abc import ABC, abstractmethod

import httpx


class EmbeddingProvider(ABC):
    """Abstracte basis voor alle embedding providers.

    Nieuwe provider toevoegen = nieuwe subklasse + registreren in get_embedding_provider().
    """

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Zet tekst om naar een float-vector.

        Args:
            text: de te embedden tekst
        Returns:
            lijst van floats (dimensies afhankelijk van model)
        """
        ...


class EmbeddingUnavailableError(Exception):
    """Gooit embedding.py als de embedding provider onbereikbaar is."""


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Embedding provider via Ollama /api/embed (bge-m3 standaard)."""

    def __init__(self, model: str, base_url: str) -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")

    async def embed(self, text: str) -> list[float]:
        """Vraag een vector op bij Ollama.

        Raises:
            EmbeddingUnavailableError: als Ollama niet bereikbaar is
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
    """Factory — leest gewenste provider uit omgeving.

    EMBEDDING_MODEL en OLLAMA_BASE_URL worden uit env gelezen.
    """
    return OllamaEmbeddingProvider(
        model=os.getenv("EMBEDDING_MODEL", "bge-m3"),
        base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
    )
