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
        self._client = httpx.AsyncClient(timeout=120.0)

    async def embed(self, text: str) -> list[float]:
        """Request a vector from Ollama.

        Raises:
            EmbeddingUnavailableError: if Ollama is unreachable
        """
        try:
            response = await self._client.post(
                f"{self.base_url}/api/embed",
                json={"model": self.model, "input": text, "keep_alive": -1},
            )
            response.raise_for_status()
            return response.json()["embeddings"][0]
        except httpx.RequestError as e:
            raise EmbeddingUnavailableError(
                f"Ollama onbereikbaar bij embed-aanroep: {e}"
            ) from e


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """Embedding provider via OpenAI text-embedding API."""

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    async def embed(self, text: str) -> list[float]:
        """Request a vector from the OpenAI embeddings endpoint.

        Args:
            text: text to embed
        Returns:
            list of floats produced by the model
        """
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.embeddings.create(input=text, model=self.model)
        return response.data[0].embedding


class PortkeyEmbeddingProvider(EmbeddingProvider):
    """Embedding provider via Portkey AI gateway (portkey_ai SDK).

    Portkey routes the embedding request to the configured virtual key target
    (OpenAI text-embedding-3-large, etc.) using the Portkey API key.
    """

    def __init__(self, api_key: str, model: str, config: str | None = None) -> None:
        self.api_key = api_key
        self.model = model
        self.config = config

    async def embed(self, text: str) -> list[float]:
        from portkey_ai import AsyncPortkey

        client = AsyncPortkey(api_key=self.api_key, config=self.config)
        response = await client.embeddings.create(input=text, model=self.model)
        return response.data[0].embedding


def get_embedding_provider() -> EmbeddingProvider:
    """Factory — reads EMBEDDING_PROVIDER from environment.

    EMBEDDING_PROVIDER=ollama    →  OllamaEmbeddingProvider with bge-m3 (default)
    EMBEDDING_PROVIDER=openai    →  OpenAIEmbeddingProvider with text-embedding-3-small
    EMBEDDING_PROVIDER=portkey   →  PortkeyEmbeddingProvider via Portkey gateway
    """
    provider = os.getenv("EMBEDDING_PROVIDER", "ollama")

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is niet ingesteld voor OpenAI embeddings.")
        return OpenAIEmbeddingProvider(
            api_key=api_key,
            model=os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
        )

    if provider == "portkey":
        api_key = os.getenv("PORTKEY_API_KEY", "")
        if not api_key:
            raise ValueError("PORTKEY_API_KEY is niet ingesteld voor Portkey embeddings.")
        # Embeddings hebben een eigen Portkey-config nodig: de standaard LLM-config
        # forceert vaak een chat-model (bijv. gpt-5.4) dat niet kan embedden.
        # Maak in het Portkey-dashboard een aparte config die naar een
        # embedding-deployment routeert en zet de slug in PORTKEY_EMBEDDING_CONFIG.
        embed_config = os.getenv("PORTKEY_EMBEDDING_CONFIG") or os.getenv("PORTKEY_CONFIG") or None
        return PortkeyEmbeddingProvider(
            api_key=api_key,
            model=os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-large"),
            config=embed_config,
        )

    return OllamaEmbeddingProvider(
        model=os.getenv("EMBEDDING_MODEL", "bge-m3"),
        base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
    )
