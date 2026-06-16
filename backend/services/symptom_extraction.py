"""Symptom extraction service.

Extracts structured symptom observations from a chat transcript using the
configured LLM provider. Uses provider-specific JSON-mode calls (same pattern
as routers/chat/_escalation.py) to guarantee valid JSON output.
Stores one observation row per session (UPSERT).
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone

import httpx
from langfuse import get_client as get_langfuse, propagate_attributes

from models.symptom_observation import SymptomObservation
from services.database import SessionLocal

logger = logging.getLogger(__name__)

_LLM_PROVIDER      = os.getenv("LLM_PROVIDER", "ollama")
_OLLAMA_BASE_URL   = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
_OLLAMA_MODEL      = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
_PORTKEY_API_KEY   = os.getenv("PORTKEY_API_KEY", "")
_PORTKEY_MODEL     = os.getenv("PORTKEY_MODEL", "gpt-5.4")
_PORTKEY_CONFIG    = os.getenv("PORTKEY_CONFIG") or None
_GROQ_API_KEY      = os.getenv("GROQ_API_KEY", "")
_GROQ_MODEL        = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
_OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
_OPENROUTER_MODEL  = os.getenv("OPENROUTER_MODEL", "anthropic/claude-haiku-4-5")

_EXTRACT_SYSTEM = (
    "YOU ARE A JSON EXTRACTION SYSTEM. YOU ONLY OUTPUT VALID JSON. NO OTHER TEXT.\n"
    "\n"
    "Task: extract symptom scores from a Dutch patient-assistant conversation.\n"
    "\n"
    "Scores for dyspnea / edema / fatigue / medication:\n"
    "  0 = no symptom (patient explicitly said so)\n"
    "  1 = mild\n"
    "  2 = moderate\n"
    "  3 = severe\n"
    "  null = topic not mentioned in this conversation\n"
    "\n"
    "null != 0: null means not discussed, 0 means explicitly reported as absent.\n"
    "weight_kg: exact float value if mentioned, else null.\n"
    "\n"
    "For each non-null field include a short Dutch reasoning (max 80 chars) citing ONLY what the PATIENT (user role) said — NEVER cite the assistant's text.\n"
    "\n"
    "REQUIRED OUTPUT — return ONLY this exact JSON structure with these exact field names:\n"
    "{\n"
    '  "dyspnea": <0|1|2|3|null>,\n'
    '  "edema": <0|1|2|3|null>,\n'
    '  "fatigue": <0|1|2|3|null>,\n'
    '  "medication": <0|1|2|3|null>,\n'
    '  "weight_kg": <float|null>,\n'
    '  "reasoning": {\n'
    '    "dyspnea": "<citation if not null>",\n'
    '    "edema": "<citation if not null>"\n'
    "  }\n"
    "}\n"
    "\n"
    "EXAMPLES:\n"
    'Conversation: "user: ik ben erg benauwd na het traplopen"\n'
    'Output: {"dyspnea":2,"edema":null,"fatigue":null,"medication":null,"weight_kg":null,"reasoning":{"dyspnea":"erg benauwd na traplopen"}}\n'
    "\n"
    'Conversation: "user: mijn gewicht is 79.5 kg en ik voel me goed"\n'
    'Output: {"dyspnea":null,"edema":null,"fatigue":null,"medication":null,"weight_kg":79.5,"reasoning":{"weight_kg":"79.5 kg gemeld"}}\n'
    "\n"
    'Conversation: "user: ik heb mijn pillen genomen, geen klachten"\n'
    'Output: {"dyspnea":0,"edema":0,"fatigue":0,"medication":0,"weight_kg":null,"reasoning":{"medication":"pillen genomen, geen klachten"}}\n'
    "\n"
    'Conversation: "user: hoe gaat het met jou"\n'
    'Output: {"dyspnea":null,"edema":null,"fatigue":null,"medication":null,"weight_kg":null,"reasoning":{}}'
)


def _user_message(transcript: str) -> str:
    return (
        f"Extract symptom scores from the PATIENT (user) messages below.\n"
        f"Reasoning must ONLY cite what the patient said — never the assistant.\n\n"
        f"{transcript}\n\n"
        f"Reply with ONLY the JSON object, no other text."
    )


# ─── Provider-specific calls with JSON mode ───────────────────────────────────

async def _extract_ollama(transcript: str) -> str:
    """Ollama: uses format=json to guarantee JSON output."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{_OLLAMA_BASE_URL}/api/chat",
            json={
                "model": _OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": _EXTRACT_SYSTEM},
                    {"role": "user", "content": _user_message(transcript)},
                ],
                "stream": False,
                "format": "json",
                "options": {"num_predict": 256},
            },
        )
        response.raise_for_status()
        return response.json()["message"]["content"]


async def _extract_portkey(transcript: str) -> str:
    """Portkey gateway: uses response_format=json_object."""
    from portkey_ai import AsyncPortkey

    client = AsyncPortkey(api_key=_PORTKEY_API_KEY, config=_PORTKEY_CONFIG)
    response = await client.chat.completions.create(
        model=_PORTKEY_MODEL,
        messages=[
            {"role": "system", "content": _EXTRACT_SYSTEM},
            {"role": "user", "content": _user_message(transcript)},
        ],
        max_completion_tokens=256,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content or "{}"


async def _extract_openai_compat(
    transcript: str,
    base_url: str,
    api_key: str,
    model: str,
) -> str:
    """Any OpenAI-compatible API (Groq, OpenRouter): uses response_format=json_object."""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _EXTRACT_SYSTEM},
            {"role": "user", "content": _user_message(transcript)},
        ],
        max_tokens=256,
        response_format={"type": "json_object"},
        timeout=60.0,
    )
    return response.choices[0].message.content or "{}"


async def _call_provider(transcript: str) -> str:
    """Dispatch to the correct provider based on LLM_PROVIDER env var."""
    if _LLM_PROVIDER == "portkey":
        return await _extract_portkey(transcript)
    if _LLM_PROVIDER == "groq":
        return await _extract_openai_compat(
            transcript,
            base_url="https://api.groq.com/openai/v1",
            api_key=_GROQ_API_KEY,
            model=_GROQ_MODEL,
        )
    if _LLM_PROVIDER == "openrouter":
        return await _extract_openai_compat(
            transcript,
            base_url="https://openrouter.ai/api/v1",
            api_key=_OPENROUTER_API_KEY,
            model=_OPENROUTER_MODEL,
        )
    # Default: ollama
    return await _extract_ollama(transcript)


# ─── JSON helpers ─────────────────────────────────────────────────────────────

def _parse_json(raw: str) -> dict | None:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                return None
    return None


def _safe_score(value: object) -> int | None:
    if value is None:
        return None
    try:
        v = int(value)  # type: ignore[arg-type]
        return v if 0 <= v <= 3 else None
    except (TypeError, ValueError):
        return None


def _merge_reasoning(existing: dict, new: dict[str, str]) -> dict[str, str]:
    """Keep prior reasoning keys when the new extraction omits them."""
    merged = {k: str(v) for k, v in (existing or {}).items() if v}
    for key, value in new.items():
        if value:
            merged[key] = value
    return merged


def _merge_score(new: int | None, existing: int | None) -> int | None:
    """Null in a new extraction means 'not mentioned' — preserve existing value."""
    return new if new is not None else existing


def _merge_weight(new: float | None, existing: float | None) -> float | None:
    return new if new is not None else existing


# ─── Main entry point ─────────────────────────────────────────────────────────

async def extract_and_store_symptoms(
    session_id: str,
    patient_id: str,
    transcript: str,
) -> None:
    """Extract symptom scores from a full session transcript and persist one row.

    Triggered when a session is closed (POST /sessions/close). Designed to run
    as a BackgroundTask — never raises, logs errors instead.
    """
    try:
        langfuse = get_langfuse()

        with propagate_attributes(
            user_id=patient_id,
            session_id=session_id,
            trace_name="symptom-extraction",
        ):
            with langfuse.start_as_current_observation(
                as_type="generation",
                name="symptom-extract-llm",
                model=_OLLAMA_MODEL if _LLM_PROVIDER == "ollama" else _PORTKEY_MODEL,
                input=transcript,
            ) as span:
                raw = await _call_provider(transcript)
                span.update(output=raw)

        result = _parse_json(raw)
        if not result:
            logger.warning(
                "symptom_extraction: kon geen JSON parsen voor session=%s, raw=%r",
                session_id, raw[:200],
            )
            return

        # Validate field names — reject if the model invented its own schema
        expected_keys = {"dyspnea", "edema", "fatigue", "medication", "weight_kg", "reasoning"}
        if not expected_keys.intersection(result.keys()):
            logger.warning(
                "symptom_extraction: onverwacht JSON-schema voor session=%s, keys=%s",
                session_id, list(result.keys()),
            )
            return

        raw_reasoning: dict = result.get("reasoning") or {}
        reasoning: dict[str, str] = {k: str(v) for k, v in raw_reasoning.items() if v}

        now = datetime.now(timezone.utc)
        iso = now.isocalendar()

        dyspnea    = _safe_score(result.get("dyspnea"))
        edema      = _safe_score(result.get("edema"))
        fatigue    = _safe_score(result.get("fatigue"))
        medication = _safe_score(result.get("medication"))
        weight_kg  = float(result["weight_kg"]) if result.get("weight_kg") is not None else None

        db = SessionLocal()
        try:
            existing = (
                db.query(SymptomObservation)
                .filter(SymptomObservation.session_id == uuid.UUID(session_id))
                .first()
            )
            if existing:
                existing.dyspnea    = _merge_score(dyspnea, existing.dyspnea)
                existing.edema      = _merge_score(edema, existing.edema)
                existing.fatigue    = _merge_score(fatigue, existing.fatigue)
                existing.medication = _merge_score(medication, existing.medication)
                existing.weight_kg    = _merge_weight(weight_kg, existing.weight_kg)
                existing.reasoning    = _merge_reasoning(existing.reasoning, reasoning)
                existing.week_number = iso.week
                existing.year        = iso.year
            else:
                db.add(SymptomObservation(
                    id=uuid.uuid4(),
                    patient_id=uuid.UUID(patient_id),
                    session_id=uuid.UUID(session_id),
                    week_number=iso.week,
                    year=iso.year,
                    dyspnea=dyspnea,
                    edema=edema,
                    fatigue=fatigue,
                    medication=medication,
                    weight_kg=weight_kg,
                    reasoning=reasoning,
                    extracted_by="llm",
                ))
            db.commit()
            logger.info(
                "symptom_extraction: opgeslagen voor session=%s week=%d-W%02d",
                session_id, iso.year, iso.week,
            )
        finally:
            db.close()

        langfuse.flush()

    except Exception:
        logger.exception("symptom_extraction: mislukt voor session=%s", session_id)
