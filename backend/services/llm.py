import os
from abc import ABC, abstractmethod

import httpx
from langfuse import get_client


class LLMProvider(ABC):
    """Abstract base for all LLM providers.

    Adding a provider = new subclass and register in get_llm_provider().
    The rest of the codebase stays unchanged.
    """

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
    ) -> str:
        """Send a message list to the LLM and return the response.

        Args:
            messages: list of {"role": "user"|"assistant", "content": "..."}
            system:   optional system prompt
        Returns:
            The model's text response
        """
        ...


class AnthropicProvider(LLMProvider):
    """LLM provider via Anthropic API (Claude Haiku by default)."""

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

        langfuse = get_client()
        with langfuse.start_as_current_observation(
            as_type="generation",
            name="llm-generation",
            model=self.model,
            input=messages,
        ) as gen:
            response = await client.messages.create(**kwargs)
            result = response.content[0].text
            gen.update(
                output=result,
                usage_details={
                    "input": response.usage.input_tokens,
                    "output": response.usage.output_tokens,
                },
            )
        return result


class OpenRouterProvider(LLMProvider):
    """LLM provider via OpenRouter (OpenAI-compatible API, many models)."""

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

        langfuse = get_client()
        with langfuse.start_as_current_observation(
            as_type="generation",
            name="llm-generation",
            model=self.model,
            input=all_messages,
        ) as gen:
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
                data = response.json()
            result = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            gen.update(
                output=result,
                usage_details={
                    "input": usage.get("prompt_tokens", 0),
                    "output": usage.get("completion_tokens", 0),
                },
            )
        return result


class GroqProvider(LLMProvider):
    """LLM provider via Groq (OpenAI-compatible API, very fast LPU inference)."""

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

        langfuse = get_client()
        with langfuse.start_as_current_observation(
            as_type="generation",
            name="llm-generation",
            model=self.model,
            input=all_messages,
        ) as gen:
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
                data = response.json()
            result = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            gen.update(
                output=result,
                usage_details={
                    "input": usage.get("prompt_tokens", 0),
                    "output": usage.get("completion_tokens", 0),
                },
            )
        return result


class OllamaProvider(LLMProvider):
    """LLM provider running locally via Ollama (HTTP API)."""

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

        langfuse = get_client()
        with langfuse.start_as_current_observation(
            as_type="generation",
            name="llm-generation",
            model=self.model,
            input=messages,
        ) as gen:
            # 600s timeout — gemma4:e4b runs partly on CPU, inference can take 2-5 min
            async with httpx.AsyncClient(timeout=600.0) as client:
                response = await client.post(f"{self.base_url}/api/chat", json=payload)
                response.raise_for_status()
                data = response.json()
            result = data["message"]["content"]
            gen.update(
                output=result,
                usage_details={
                    "input": data.get("prompt_eval_count", 0),
                    "output": data.get("eval_count", 0),
                },
            )
        return result


class PortkeyProvider(LLMProvider):
    """LLM provider via Portkey AI gateway (portkey_ai SDK, same pattern as r-huijts/portkeytester).

    Portkey routes to the configured virtual key target (OpenAI, Anthropic, etc.)
    based on the config set in the Portkey dashboard.
    """

    def __init__(self, api_key: str, model: str, config: str | None = None) -> None:
        self.api_key = api_key
        self.model = model
        self.config = config  # optional Portkey config ID or virtual key slug

    async def chat(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
    ) -> str:
        from portkey_ai import AsyncPortkey

        client = AsyncPortkey(api_key=self.api_key, config=self.config)

        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        langfuse = get_client()
        with langfuse.start_as_current_observation(
            as_type="generation",
            name="llm-generation",
            model=self.model,
            input=all_messages,
        ) as gen:
            response = await client.chat.completions.create(
                model=self.model,
                messages=all_messages,
                max_completion_tokens=1024,
            )
            result = response.choices[0].message.content or ""
            gen.update(
                output=result,
                usage_details={
                    "input": response.usage.prompt_tokens,
                    "output": response.usage.completion_tokens,
                },
            )
        return result


def get_llm_provider(
    provider: str | None = None,
    model: str | None = None,
) -> LLMProvider:
    """Factory — reads the desired provider from the environment, with optional DB overrides.

    LLM_PROVIDER=ollama       →  OllamaProvider (default)
    LLM_PROVIDER=anthropic    →  AnthropicProvider (Claude Haiku)
    LLM_PROVIDER=openrouter   →  OpenRouterProvider (OpenAI-compatible, many models)
    LLM_PROVIDER=groq         →  GroqProvider (fast LPU inference, free tier)
    LLM_PROVIDER=portkey      →  PortkeyProvider (Portkey AI gateway → OpenAI, etc.)

    Args:
        provider: override the LLM_PROVIDER env var (e.g. from DB settings)
        model:    override the default model for the chosen provider
    """
    resolved = provider or os.getenv("LLM_PROVIDER", "ollama")

    if resolved == "ollama":
        return OllamaProvider(
            model=model or os.getenv("OLLAMA_MODEL", "gemma4:e2b"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
        )

    if resolved == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is niet ingesteld in de omgeving.")
        return AnthropicProvider(
            model=model or os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
            api_key=api_key,
        )

    if resolved == "openrouter":
        api_key = os.getenv("OPENROUTER_API_KEY", "")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY is niet ingesteld in de omgeving.")
        return OpenRouterProvider(
            model=model or os.getenv("OPENROUTER_MODEL", "anthropic/claude-haiku-4-5"),
            api_key=api_key,
        )

    if resolved == "groq":
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            raise ValueError("GROQ_API_KEY is niet ingesteld in de omgeving.")
        return GroqProvider(
            model=model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            api_key=api_key,
        )

    if resolved == "portkey":
        api_key = os.getenv("PORTKEY_API_KEY", "")
        if not api_key:
            raise ValueError("PORTKEY_API_KEY is niet ingesteld in de omgeving.")
        return PortkeyProvider(
            api_key=api_key,
            model=model or os.getenv("PORTKEY_MODEL", "gpt-5.4"),
            config=os.getenv("PORTKEY_CONFIG", None),
        )

    raise ValueError(f"Onbekende LLM provider: '{resolved}'. Kies uit: ollama, anthropic, openrouter, groq, portkey")
