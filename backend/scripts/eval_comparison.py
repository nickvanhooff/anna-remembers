"""eval_comparison.py — Vergelijkt cloud vs lokaal op vier dimensies.

Meet latency en kwaliteit voor:
  1. Chat       — gpt-5.4 (Portkey) vs qwen2.5:3b (Ollama)
  2. Embeddings — text-embedding-3-large (Portkey) vs bge-m3 (Ollama)
  3. Samenvatting — DeepSeek-V4-Flash (Portkey) vs qwen2.5:3b (Ollama)
  4. Escalatie  — DeepSeek-V4-Flash (Portkey) vs qwen2.5:0.5b (Ollama)

Gebruik (vanuit backend-map, met actieve .env):
    python scripts/eval_comparison.py
"""

import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from langfuse import get_client

from routers.chat._prompts import build_summary_prompt
from services.llm import PortkeyProvider, get_llm_provider

lf = get_client()


# ─── Testdata ─────────────────────────────────────────────────────────────────

CHAT_MESSAGES = [
    "Hallo, ik voel me vandaag niet zo goed.",
    "Mijn enkels zijn een beetje opgezwollen de laatste dagen.",
    "Ik ben 2 kilo zwaarder dan vorige week, is dat erg?",
    "Ik heb moeite met ademen na het traplopen.",
    "Mijn pillen zijn op, hoe moet ik dat oplossen?",
]

# Five summary test cases covering different patient states
SUMMARY_CASES = [
    {
        "conversation": [
            {"role": "user",      "content": "Ik heb de laatste dagen last van opgezwollen enkels."},
            {"role": "assistant", "content": "Dat klinkt vervelend. Wanneer is dit begonnen?"},
            {"role": "user",      "content": "Gisteren al. Ook ben ik 3 kilo zwaarder dan vorige week."},
            {"role": "assistant", "content": "Bedankt dat u dat meldt. Heeft u uw furosemide ingenomen?"},
            {"role": "user",      "content": "Ja, pillen elke dag. Maar ik ben wel kortademig na het traplopen."},
        ],
        "expected_symptoms": ["enkels", "gewicht", "kortademig"],
        "patient_name": "Test Patiënt 1",
    },
    {
        "conversation": [
            {"role": "user",      "content": "Het gaat goed met me. Geen klachten vandaag."},
            {"role": "assistant", "content": "Fijn om te horen! Heeft u uw medicijnen ingenomen?"},
            {"role": "user",      "content": "Ja, furosemide en lisinopril zoals altijd."},
            {"role": "assistant", "content": "Heeft u zich gewogen vandaag?"},
            {"role": "user",      "content": "Ja, zelfde gewicht als gisteren. Alles stabiel."},
        ],
        "expected_symptoms": ["medicijnen", "gewicht"],
        "patient_name": "Test Patiënt 2",
    },
    {
        "conversation": [
            {"role": "user",      "content": "Mijn benen zijn erg dik geworden, ik kan mijn schoenen niet meer aan."},
            {"role": "assistant", "content": "Dat klinkt ernstig. Hoe lang heeft u hier al last van?"},
            {"role": "user",      "content": "Al drie dagen. En ik ben 5 kilo zwaarder dan vorige week."},
            {"role": "assistant", "content": "Heeft u ook moeite met ademen of pijn op de borst?"},
            {"role": "user",      "content": "Ja, 's nachts kan ik bijna niet plat liggen van de benauwdheid."},
        ],
        "expected_symptoms": ["benen", "gewicht", "benauwdheid"],
        "patient_name": "Test Patiënt 3",
    },
    {
        "conversation": [
            {"role": "user",      "content": "Ik heb plotseling pijn op de borst gekregen."},
            {"role": "assistant", "content": "Dat is een ernstige klacht. Heeft u ook uitstraling naar uw arm of kaak?"},
            {"role": "user",      "content": "Ja, naar mijn linkerarm. En ik ben erg duizelig."},
            {"role": "assistant", "content": "Dit zijn alarmsignalen. Bent u alleen thuis?"},
            {"role": "user",      "content": "Ja, mijn partner is er niet. Ik zweet ook heel erg."},
        ],
        "expected_symptoms": ["borst", "duizelig", "zweet"],
        "patient_name": "Test Patiënt 4",
    },
    {
        "conversation": [
            {"role": "user",      "content": "Ik ben vergeten mijn plastablet te nemen gisteren."},
            {"role": "assistant", "content": "Dat kan voorkomen. Hoe voelt u zich nu?"},
            {"role": "user",      "content": "Een beetje opgeblazen. Mijn enkels zijn wat dikker dan normaal."},
            {"role": "assistant", "content": "Heeft u vandaag uw medicatie al ingenomen?"},
            {"role": "user",      "content": "Ja, zojuist. Ik wil ook graag een afspraak met mijn cardioloog."},
        ],
        "expected_symptoms": ["medicatie", "enkels", "cardioloog"],
        "patient_name": "Test Patiënt 5",
    },
]

EMBED_SENTENCES = [
    "pijn op de borst",
    "kortademig na het traplopen",
    "enkels zijn opgezwollen",
    "medicijnen ingenomen vandaag",
    "3 kilo zwaarder dan vorige week",
    "ik voel me niet goed",
    "hartkloppingen en duizeligheid",
]

ESCALATION_CASES = [
    {"message": "ik heb pijn op de borst",                "urgency": "high",   "escalate": True},
    {"message": "ik kan nauwelijks ademen",                "urgency": "high",   "escalate": True},
    {"message": "mijn hart bonkt snel en ik ben duizelig", "urgency": "medium", "escalate": True},
    {"message": "mijn enkels zijn wat dikker dan normaal", "urgency": "low",    "escalate": True},
    {"message": "ik ben 3 kilo zwaarder dan gisteren",     "urgency": "low",    "escalate": True},
    {"message": "ik ben kortademig na het traplopen",      "urgency": "low",    "escalate": True},
    {"message": "ik voel me niet zo lekker vandaag",       "urgency": "low",    "escalate": True},
    {"message": "hallo hoe gaat het",                      "urgency": "low",    "escalate": False},
    {"message": "pillen ingenomen gewicht stabiel",        "urgency": "low",    "escalate": False},
    {"message": "ik ben moe van een lange dag werken",     "urgency": "low",    "escalate": False},
]

CHAT_SYSTEM = (
    "Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten. "
    "Je spreekt met een testpatiënt. Begin je antwoord ALTIJD met [ANIM: standard_waiting]. "
    "Spreek altijd Nederlands. Stel maximaal één vervolgvraag."
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_portkey(model: str) -> PortkeyProvider:
    return PortkeyProvider(
        api_key=os.getenv("PORTKEY_API_KEY", ""),
        model=model,
        config=os.getenv("PORTKEY_CONFIG") or None,
    )


def make_ollama(model: str):
    os.environ["LLM_PROVIDER"] = "ollama"
    os.environ["OLLAMA_MODEL"] = model
    return get_llm_provider()


def _ensure_dataset(name: str, items: list[dict]) -> None:
    """Create dataset if missing; add only items that don't exist yet (idempotent)."""
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


# ─── 1. Chat latency ──────────────────────────────────────────────────────────

def eval_chat() -> None:
    print("\n=== 1. CHAT LATENCY ===")

    _ensure_dataset(
        "chat-cloud-vs-lokaal",
        [{"input": {"message": m}} for m in CHAT_MESSAGES],
    )

    for run_name, llm, provider in [
        ("cloud/gpt-5.4",              make_portkey("gpt-5.4"),            "portkey"),
        ("cloud/DeepSeek-V4-Flash",    make_portkey("DeepSeek-V4-Flash"),  "portkey"),
        ("lokaal/qwen2.5:3b",          make_ollama("qwen2.5:3b"),          "ollama"),
    ]:
        print(f"\n  Run: {run_name}")

        async def chat_task(*, item, _llm=llm, **kwargs):
            msg = item.input["message"]
            messages = [
                {"role": "system", "content": CHAT_SYSTEM},
                {"role": "user",   "content": msg},
            ]
            t0       = time.perf_counter()
            response = await _llm.chat(messages=messages)
            latency  = (time.perf_counter() - t0) * 1000

            # Strip [ANIM:...] tags before measuring response quality
            clean_response = re.sub(r'\[ANIM:[^\]]+\]', '', response).strip()

            response_length  = len(clean_response)
            contains_followup = clean_response.rstrip().endswith("?")

            # Check if response mentions key words from the input message
            input_words = set(re.findall(r'\w{4,}', msg.lower()))
            response_words = set(re.findall(r'\w{4,}', clean_response.lower()))
            mentions_topic = bool(input_words & response_words)

            lf.score_current_trace(name="latency_ms",        value=round(latency, 1))
            lf.score_current_trace(name="response_length",   value=float(response_length))
            lf.score_current_trace(name="contains_followup", value=1.0 if contains_followup else 0.0)
            lf.score_current_trace(name="mentions_topic",    value=1.0 if mentions_topic    else 0.0)

            print(f"    [{latency:>6.0f}ms] len={response_length} followup={contains_followup} topic={mentions_topic}")
            print(f"      input:    {msg[:50]!r}")
            print(f"      response: {clean_response[:60]!r}")
            return response

        lf.get_dataset("chat-cloud-vs-lokaal").run_experiment(
            name=run_name,
            task=chat_task,
            metadata={"model": run_name.split("/", 1)[1], "provider": provider},
        )


# ─── 2. Embedding latency ─────────────────────────────────────────────────────

def eval_embeddings() -> None:
    print("\n=== 2. EMBEDDING LATENCY ===")

    import httpx
    from portkey_ai import AsyncPortkey

    portkey_key = os.getenv("PORTKEY_API_KEY", "")
    ollama_url  = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")

    async def _embed_ollama(text: str) -> tuple[float, int]:
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{ollama_url}/api/embeddings",
                json={"model": "bge-m3", "prompt": text},
            )
            r.raise_for_status()
        return (time.perf_counter() - t0) * 1000, len(r.json()["embedding"])

    async def _embed_portkey(text: str) -> tuple[float, int]:
        t0 = time.perf_counter()
        client = AsyncPortkey(api_key=portkey_key)
        r = await client.embeddings.create(
            model="@azure-openai/text-embedding-3-large",
            input=text,
        )
        return (time.perf_counter() - t0) * 1000, len(r.data[0].embedding)

    _ensure_dataset(
        "embedding-cloud-vs-lokaal",
        [{"input": {"text": s}} for s in EMBED_SENTENCES],
    )

    for run_name, embed_fn, provider, model in [
        ("lokaal/bge-m3",                _embed_ollama,   "ollama",   "bge-m3"),
        ("cloud/text-embedding-3-large", _embed_portkey,  "portkey",  "text-embedding-3-large"),
    ]:
        print(f"\n  Run: {run_name}")

        async def embed_task(*, item, _fn=embed_fn, **kwargs):
            text             = item.input["text"]
            latency, dims    = await _fn(text)

            lf.score_current_trace(name="latency_ms", value=round(latency, 1))
            lf.score_current_trace(name="dimensions", value=float(dims))

            print(f"    [{latency:>6.0f}ms, {dims}d] {text!r}")
            return {"latency_ms": latency, "dimensions": dims}

        lf.get_dataset("embedding-cloud-vs-lokaal").run_experiment(
            name=run_name,
            task=embed_task,
            metadata={"model": model, "provider": provider},
        )


# ─── 3. Samenvatting kwaliteit ────────────────────────────────────────────────

def eval_summary() -> None:
    print("\n=== 3. SAMENVATTING KWALITEIT ===")

    dataset_items = []
    for case in SUMMARY_CASES:
        prompt = build_summary_prompt(case["patient_name"], None, case["conversation"])
        # Build a flat string of everything the patient said, for hallucination checking
        patient_text = " ".join(
            m["content"].lower() for m in case["conversation"] if m["role"] == "user"
        )
        dataset_items.append({
            "input": {"prompt": prompt, "patient_text": patient_text},
            "expected_output": {"must_contain": case["expected_symptoms"]},
        })

    _ensure_dataset("summary-cloud-vs-lokaal", dataset_items)

    for run_name, llm, provider, model_name in [
        ("cloud/DeepSeek-V4-Flash", make_portkey("DeepSeek-V4-Flash"), "portkey", "DeepSeek-V4-Flash"),
        ("lokaal/qwen2.5:3b",       make_ollama("qwen2.5:3b"),          "ollama",  "qwen2.5:3b"),
    ]:
        print(f"\n  Run: {run_name}")

        async def summary_task(*, item, _llm=llm, **kwargs):
            p            = item.input["prompt"]
            expected     = item.expected_output["must_contain"]
            patient_text = item.input.get("patient_text", "")

            t0  = time.perf_counter()
            raw = await _llm.chat(messages=[{"role": "user", "content": p}])
            latency = (time.perf_counter() - t0) * 1000

            m = re.search(r'\{.*\}', raw, re.DOTALL)
            valid_json, found, no_hallucination = False, [], True
            if m:
                try:
                    parsed     = json.loads(m.group(0))
                    valid_json = True
                    sym_text   = " ".join(parsed.get("sym", [])).lower()
                    found      = [s for s in expected if s in sym_text]

                    # Hallucination check: each ovr entry must appear in patient's own words
                    if patient_text:
                        for ovr_entry in parsed.get("ovr", []):
                            ovr_lower = str(ovr_entry).lower()
                            # At least one word (4+ chars) from the entry must appear in patient text
                            entry_words = re.findall(r'\w{4,}', ovr_lower)
                            if entry_words and not any(w in patient_text for w in entry_words):
                                no_hallucination = False
                                break
                    else:
                        # Fallback: flag implausibly long numeric strings
                        no_hallucination = not any(
                            re.search(r'\d{6,}', str(o)) for o in parsed.get("ovr", [])
                        )
                except Exception:
                    pass

            recall = len(found) / len(expected) if expected else 0.0

            lf.score_current_trace(name="latency_ms",      value=round(latency, 1))
            lf.score_current_trace(name="valid_json",       value=1.0 if valid_json       else 0.0)
            lf.score_current_trace(name="symptom_recall",   value=round(recall, 2))
            lf.score_current_trace(name="no_hallucination", value=1.0 if no_hallucination else 0.0)

            print(f"    [{latency:>6.0f}ms] json={valid_json} recall={recall:.2f} "
                  f"hallucination_vrij={no_hallucination} gevonden={found}")
            return raw

        lf.get_dataset("summary-cloud-vs-lokaal").run_experiment(
            name=run_name,
            task=summary_task,
            metadata={"model": model_name, "provider": provider},
        )


# ─── 4. Escalatie kwaliteit ───────────────────────────────────────────────────

def eval_escalation() -> None:
    print("\n=== 4. ESCALATIE KWALITEIT ===")

    import httpx
    from portkey_ai import AsyncPortkey
    from routers.chat._escalation import (
        _CLASSIFY_SYSTEM,
        _ESCALATION_PORTKEY_CONFIG,
        _OLLAMA_BASE_URL,
        _PORTKEY_API_KEY,
        _parse_classify_json,
    )

    async def _classify_portkey(message: str, model: str) -> tuple[dict | None, float]:
        t0 = time.perf_counter()
        client = AsyncPortkey(api_key=_PORTKEY_API_KEY, config=_ESCALATION_PORTKEY_CONFIG)
        r = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _CLASSIFY_SYSTEM},
                {"role": "user",   "content": f"Patient message: {message}"},
            ],
            max_completion_tokens=128,
            response_format={"type": "json_object"},
        )
        return _parse_classify_json(r.choices[0].message.content or "{}"), (time.perf_counter() - t0) * 1000

    async def _classify_ollama(message: str, model: str) -> tuple[dict | None, float]:
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=90.0) as client:
            r = await client.post(
                f"{_OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": _CLASSIFY_SYSTEM},
                        {"role": "user",   "content": f"Patient message: {message}"},
                    ],
                    "stream": False,
                    "format": "json",
                    "options": {"num_predict": 128},
                },
            )
            r.raise_for_status()
        return _parse_classify_json(r.json()["message"]["content"]), (time.perf_counter() - t0) * 1000

    _ensure_dataset(
        "escalatie-cloud-vs-lokaal",
        [{
            "input": {"message": c["message"]},
            "expected_output": {"urgency": c["urgency"], "escalate": c["escalate"]},
        } for c in ESCALATION_CASES],
    )

    for run_name, classify_fn, model, provider in [
        ("cloud/DeepSeek-V4-Flash", _classify_portkey, "DeepSeek-V4-Flash", "portkey"),
        ("lokaal/qwen2.5:3b",       _classify_ollama,  "qwen2.5:3b",        "ollama"),
    ]:
        print(f"\n  Run: {run_name}")
        stats = {"correct_u": 0, "correct_e": 0, "total": 0}

        async def escalation_task(*, item, _fn=classify_fn, _model=model, _stats=stats, **kwargs):
            message  = item.input["message"]
            expected = item.expected_output

            result, latency = await _fn(message, _model)

            urgency_ok  = bool(result and result.get("urgency")        == expected["urgency"])
            escalate_ok = bool(result and bool(result.get("escalate")) == expected["escalate"])
            _stats["total"]     += 1
            _stats["correct_u"] += urgency_ok
            _stats["correct_e"] += escalate_ok

            lf.score_current_trace(name="latency_ms",       value=round(latency, 1))
            lf.score_current_trace(name="urgency_correct",  value=1.0 if urgency_ok  else 0.0)
            lf.score_current_trace(name="escalate_correct", value=1.0 if escalate_ok else 0.0)

            status = "✓" if urgency_ok and escalate_ok else "✗"
            got    = result.get("urgency") if result else "?"
            print(f"    {status} [{latency:>5.0f}ms] verwacht={expected['urgency']:6s} "
                  f"gekregen={got!r:8}  {message!r}")
            return result

        lf.get_dataset("escalatie-cloud-vs-lokaal").run_experiment(
            name=run_name,
            task=escalation_task,
            metadata={"model": model, "provider": provider},
        )

        t = stats["total"]
        if t:
            print(f"\n    Accuraatheid urgency:  {stats['correct_u']}/{t} ({100*stats['correct_u']/t:.0f}%)")
            print(f"    Accuraatheid escalate: {stats['correct_e']}/{t} ({100*stats['correct_e']/t:.0f}%)")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("Anna Remembers — Cloud vs Lokaal vergelijking")
    print("=" * 60)

    eval_chat()
    eval_embeddings()
    eval_summary()
    eval_escalation()

    lf.flush()
    print("\n✓ Alle resultaten gelogd naar Langfuse.")
    print("  Open Langfuse → Datasets om de runs naast elkaar te vergelijken.")


if __name__ == "__main__":
    main()
