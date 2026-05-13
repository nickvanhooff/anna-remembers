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


class AnthropicProvider(LLMProvider):
    """LLM-provider via de Anthropic API (Claude Haiku standaard)."""

    def __init__(self, model: str, api_key: str) -> None:
        self.model = model
        self.api_key = api_key

    async def chat(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
    ) -> str:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self.api_key)
        kwargs: dict = {
            "model": self.model,
            "max_tokens": 1024,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system

        response = await client.messages.create(**kwargs)
        return response.content[0].text


class OpenRouterProvider(LLMProvider):
    """LLM-provider via OpenRouter (OpenAI-compatibele API, toegang tot veel modellen)."""

    def __init__(self, model: str, api_key: str) -> None:
        self.model = model
        self.api_key = api_key

    async def chat(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
    ) -> str:
        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": self.model, "messages": all_messages},
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]


class GroqProvider(LLMProvider):
    """LLM-provider via Groq (OpenAI-compatibele API, zeer snelle LPU-inferentie)."""

    def __init__(self, model: str, api_key: str) -> None:
        self.model = model
        self.api_key = api_key

    async def chat(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
    ) -> str:
        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": self.model, "messages": all_messages},
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]


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

    LLM_PROVIDER=ollama       →  OllamaProvider (standaard)
    LLM_PROVIDER=anthropic    →  AnthropicProvider (Claude Haiku)
    LLM_PROVIDER=openrouter   →  OpenRouterProvider (OpenAI-compatibel, veel modellen)
    LLM_PROVIDER=groq         →  GroqProvider (snelle LPU-inferentie, gratis tier)
    """
    provider = os.getenv("LLM_PROVIDER", "ollama")

    if provider == "ollama":
        return OllamaProvider(
            model=os.getenv("OLLAMA_MODEL", "gemma4:e2b"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
        )

    if provider == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is niet ingesteld in de omgeving.")
        return AnthropicProvider(
            model=os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
            api_key=api_key,
        )

    if provider == "openrouter":
        api_key = os.getenv("OPENROUTER_API_KEY", "")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY is niet ingesteld in de omgeving.")
        return OpenRouterProvider(
            model=os.getenv("OPENROUTER_MODEL", "anthropic/claude-haiku-4-5"),
            api_key=api_key,
        )

    if provider == "groq":
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            raise ValueError("GROQ_API_KEY is niet ingesteld in de omgeving.")
        return GroqProvider(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            api_key=api_key,
        )

    raise ValueError(f"Onbekende LLM provider: '{provider}'. Kies uit: ollama, anthropic, openrouter, groq")
