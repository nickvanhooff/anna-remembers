import os
from abc import ABC, abstractmethod

import httpx


class LLMProvider(ABC):
    """Abstracte basis voor alle LLM-providers.

    Nieuwe provider toevoegen = nieuwe subklasse maken en registreren
    in get_llm_provider(). De rest van de codebase raakt hierdoor niet.
    """

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
    ) -> str:
        """Stuur een reeks berichten naar de LLM en geef de response terug.

        Args:
            messages: lijst van {"role": "user"|"assistant", "content": "..."}
            system:   optionele system prompt
        Returns:
            De tekstuele response van het model
        """
        ...


class OllamaProvider(LLMProvider):
    """LLM-provider die lokaal draait via Ollama (http API)."""

    def __init__(self, model: str, base_url: str) -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")

    async def chat(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
    ) -> str:
        payload: dict = {"model": self.model, "messages": messages, "stream": False}
        if system:
            payload["system"] = system

        # Timeout van 600s — gemma4:e4b draait deels op CPU, inferentie kan 2-5 min duren
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(f"{self.base_url}/api/chat", json=payload)
            response.raise_for_status()
            return response.json()["message"]["content"]


def get_llm_provider() -> LLMProvider:
    """Factory — leest de gewenste provider uit de omgeving.

    LLM_PROVIDER=ollama  →  OllamaProvider (standaard)
    Toekomstige opties:   anthropic, openai
    """
    provider = os.getenv("LLM_PROVIDER", "ollama")

    if provider == "ollama":
        return OllamaProvider(
            model=os.getenv("OLLAMA_MODEL", "gemma4:e4b"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
        )

    raise ValueError(f"Onbekende LLM provider: '{provider}'. Kies uit: ollama")
