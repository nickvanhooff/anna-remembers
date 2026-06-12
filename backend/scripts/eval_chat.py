"""eval_chat.py — Vergelijkt chat-modellen: gpt-5.4 vs DeepSeek-V4-Flash vs qwen2.5:3b.

Gebruik (vanuit backend-map, met actieve .env):
    python scripts/eval_chat.py
"""

import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from langfuse import get_client

from services.llm import PortkeyProvider, get_llm_provider

lf = get_client()

CHAT_MESSAGES = [
    "Hallo, ik voel me vandaag niet zo goed.",
    "Mijn enkels zijn een beetje opgezwollen de laatste dagen.",
    "Ik ben 2 kilo zwaarder dan vorige week, is dat erg?",
    "Ik heb moeite met ademen na het traplopen.",
    "Mijn pillen zijn op, hoe moet ik dat oplossen?",
]

CHAT_SYSTEM = (
    "Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten. "
    "Je spreekt met een testpatiënt. Begin je antwoord ALTIJD met [ANIM: standard_waiting]. "
    "Spreek altijd Nederlands. Stel maximaal één vervolgvraag."
)

# DeepSeek on Azure blocks the [ANIM:] tag instruction via its content filter.
# For eval purposes we use an equivalent prompt without it — the tag is stripped
# from all responses anyway before scoring.
CHAT_SYSTEM_NO_ANIM = (
    "Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten. "
    "Je spreekt met een testpatiënt. "
    "Spreek altijd Nederlands. Stel maximaal één vervolgvraag."
)


def make_portkey(model: str, config_env: str = "PORTKEY_CONFIG", config: str | None = "ENV") -> PortkeyProvider:
    resolved_config = os.getenv(config_env) or None if config == "ENV" else config
    return PortkeyProvider(
        api_key=os.getenv("PORTKEY_API_KEY", ""),
        model=model,
        config=resolved_config,
    )


def make_ollama(model: str):
    os.environ["LLM_PROVIDER"] = "ollama"
    os.environ["OLLAMA_MODEL"] = model
    return get_llm_provider()


def _ensure_dataset(name: str, items: list[dict]) -> None:
    lf.create_dataset(name=name)
    existing = lf.get_dataset(name)
    existing_count = len(existing.items) if existing.items else 0
    if existing_count >= len(items):
        return
    for item in items[existing_count:]:
        lf.create_dataset_item(
            dataset_name=name,
            input=item.get("input"),
            expected_output=item.get("expected_output"),
        )


def eval_chat() -> None:
    print("\n=== CHAT MODEL VERGELIJKING ===")

    _ensure_dataset(
        "chat-cloud-vs-lokaal",
        [{"input": {"message": m}} for m in CHAT_MESSAGES],
    )

    for run_name, llm, provider, system_prompt in [
        ("cloud/gpt-5.4",           make_portkey("gpt-5.4"),                        "portkey", CHAT_SYSTEM),
        ("cloud/DeepSeek-V4-Flash", make_portkey("DeepSeek-V4-Flash", config=None), "portkey", CHAT_SYSTEM_NO_ANIM),
        ("lokaal/qwen2.5:3b",       make_ollama("qwen2.5:3b"),                      "ollama",  CHAT_SYSTEM),
    ]:
        print(f"\n  Run: {run_name}")

        async def chat_task(*, item, _llm=llm, _system=system_prompt, **kwargs):
            msg = item.input["message"]
            messages = [
                {"role": "system", "content": _system},
                {"role": "user",   "content": msg},
            ]
            t0       = time.perf_counter()
            response = await _llm.chat(messages=messages)
            latency  = (time.perf_counter() - t0) * 1000

            clean_response = re.sub(r'\[ANIM:[^\]]+\]', '', response).strip()

            response_length   = len(clean_response)
            contains_followup = clean_response.rstrip().endswith("?")
            input_words       = set(re.findall(r'\w{4,}', msg.lower()))
            response_words    = set(re.findall(r'\w{4,}', clean_response.lower()))
            mentions_topic    = bool(input_words & response_words)

            lf.score_current_trace(name="latency_ms",        value=round(latency, 1))
            lf.score_current_trace(name="response_length",   value=float(response_length))
            lf.score_current_trace(name="contains_followup", value=1.0 if contains_followup else 0.0)
            lf.score_current_trace(name="mentions_topic",    value=1.0 if mentions_topic    else 0.0)

            print(f"    [{latency:>6.0f}ms] len={response_length} followup={contains_followup} topic={mentions_topic}")
            print(f"      input:    {msg[:50]!r}")
            print(f"      response: {clean_response[:80]!r}")
            return response

        lf.get_dataset("chat-cloud-vs-lokaal").run_experiment(
            name=run_name,
            task=chat_task,
            metadata={"model": run_name.split("/", 1)[1], "provider": provider},
        )


def main() -> None:
    print("Anna Remembers — Chat model vergelijking")
    print("=" * 60)
    eval_chat()
    lf.flush()
    print("\n✓ Resultaten gelogd naar Langfuse.")
    print("  Open Langfuse → Datasets → chat-cloud-vs-lokaal om de drie runs te vergelijken.")


if __name__ == "__main__":
    main()
