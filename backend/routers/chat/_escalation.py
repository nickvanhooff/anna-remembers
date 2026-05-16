"""Escalatiedetectie — gelaagde architectuur.

Laag 0: hardcoded keywords — deterministisch, synchroon, vóór LLM-aanroep.
Laag 1: qwen2.5:0.5b classificatie — asynchroon als BackgroundTask ná de response.
"""

import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta

import httpx
from langfuse import get_client as get_langfuse, propagate_attributes

from services.database import SessionLocal
from services.mcp_client import MCPClient

logger = logging.getLogger(__name__)

# ─── Layer 0 — keyword sets ───────────────────────────────────────────────────

_ESCALATION_HIGH: frozenset[str] = frozenset([
    "bewusteloos", "bewustzijnsverlies", "pijn op de borst", "borstkasdruk",
    "coma", "flauw", "ik ga dood", "hartaanval", "zelfmoord", "suïcide",
    "zelfdoding", "hartstilstand", "ademnood", "kan niet ademhalen",
    "gevaar", "stikken",
])

_ESCALATION_MEDIUM: frozenset[str] = frozenset([
    "ernstige pijn", "hevige pijn", "heel erg benauwd", "erg benauwd",
    "voel me heel slecht",
    "ik verbrand", "voel me verbrand", "brandwond", "verbranding",
    "ontlasting is rood", "bloed bij ontlasting",
])


def layer0_check(text: str) -> tuple[str, str]:
    """Laag 0 — keyword-match. Retourneert (urgency, reason) of ('', '') als geen match."""
    lower = text.lower()
    for kw in _ESCALATION_HIGH:
        if kw in lower:
            return "high", f"Kritiek sleutelwoord gedetecteerd: '{kw}'"
    for kw in _ESCALATION_MEDIUM:
        if kw in lower:
            return "medium", f"Waarschuwingssleutelwoord gedetecteerd: '{kw}'"
    return "", ""


# ─── Layer 1 — local Ollama classification ────────────────────────────────────

_patient_semaphores: dict[uuid.UUID, asyncio.Semaphore] = {}


def _get_semaphore(patient_id: uuid.UUID) -> asyncio.Semaphore:
    if patient_id not in _patient_semaphores:
        _patient_semaphores[patient_id] = asyncio.Semaphore(1)
    return _patient_semaphores[patient_id]


_ESCALATION_COOLDOWN_MINUTES = int(os.getenv("ESCALATION_COOLDOWN_MINUTES", "0"))
_OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
_ESCALATION_MODEL = os.getenv("ESCALATION_MODEL", "qwen2.5:0.5b")

_CLASSIFY_SYSTEM = (
    "You are a medical triage assistant for heart failure patients. "
    "Patient messages may be in Dutch. Decide if escalation to a healthcare provider is needed. "
    "Escalate for: chest pain, loss of consciousness, breathing problems, self-harm, "
    "burning sensation or burns, severe pain, blood in stool, statements about dying, emergencies. "
    "Do NOT escalate for greetings only (hallo, olla, hi) or stable check-ins with no symptoms. "
    "Reply ONLY with a JSON object, no markdown, no explanation. "
    'The "reason" field MUST be in Dutch (Nederlands), max 80 characters.\n'
    'Schema: {"escalate": true/false, "urgency": "high"|"medium", "reason": "..."}\n'
    'Example: "ik verbrand" -> {"escalate": true, "urgency": "medium", "reason": "brandend gevoel gemeld"}\n'
    'Example: "olla" -> {"escalate": false, "urgency": "medium", "reason": "alleen begroeting"}'
)

_REASON_MSG_MAX = 300


def format_escalation_reason(*, layer_label: str, patient_message: str, detail: str = "") -> str:
    """Bouw een leesbare escalatiereden met het originele patiëntbericht."""
    msg = " ".join((patient_message or "").split())
    if len(msg) > _REASON_MSG_MAX:
        msg = msg[:_REASON_MSG_MAX - 1] + "…"
    detail = " ".join((detail or "").split())
    if detail:
        return f"{layer_label} · Patiëntbericht: «{msg}» · {detail}"
    return f"{layer_label} · Patiëntbericht: «{msg}»"


def _parse_classify_json(raw: str) -> dict | None:
    """Parse JSON from Ollama classify output; tolerate fences or extra text."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                return None
    return None


async def layer1_classify(
    patient_id: uuid.UUID,
    patient_message: str,
    session_id: uuid.UUID,
) -> None:
    """Laag 1 — lokale Ollama-classificatie als BackgroundTask.

    Draait asynchroon ná de chat-response. Semaphore serialiseert per patiënt.
    Cooldown voorkomt dubbele escalaties binnen ESCALATION_COOLDOWN_MINUTES.
    """
    semaphore = _get_semaphore(patient_id)
    async with semaphore:
        if _ESCALATION_COOLDOWN_MINUTES > 0:
            db = SessionLocal()
            try:
                from models.escalation import Escalation as EscalationModel
                cutoff = datetime.utcnow() - timedelta(minutes=_ESCALATION_COOLDOWN_MINUTES)
                recent_esc = (
                    db.query(EscalationModel)
                    .filter(
                        EscalationModel.patient_id == patient_id,
                        EscalationModel.created_at >= cutoff,
                    )
                    .first()
                )
                if recent_esc:
                    logger.info("Layer 1 skipped: cooldown active for patient %s", patient_id)
                    return
            finally:
                db.close()

        langfuse = get_langfuse()
        try:
            user_prompt = f"Patient message: {patient_message}"
            async with httpx.AsyncClient(timeout=90.0) as client:
                with propagate_attributes(
                    user_id=str(patient_id),
                    session_id=str(session_id),
                    trace_name="escalation-layer1",
                ):
                    with langfuse.start_as_current_observation(
                        as_type="generation",
                        name="escalation-layer1-classify",
                        model=_ESCALATION_MODEL,
                        input=user_prompt,
                    ) as gen_span:
                        response = await client.post(
                            f"{_OLLAMA_BASE_URL}/api/chat",
                            json={
                                "model": _ESCALATION_MODEL,
                                "messages": [
                                    {"role": "system", "content": _CLASSIFY_SYSTEM},
                                    {"role": "user", "content": user_prompt},
                                ],
                                "stream": False,
                                "format": "json",
                                "options": {"num_predict": 128},
                            },
                        )
                        response.raise_for_status()
                        raw = response.json()["message"]["content"]
                        gen_span.update(output=raw)

            result = _parse_classify_json(raw)
            if not result:
                logger.warning("Layer 1: could not parse JSON from %s: %r", _ESCALATION_MODEL, raw[:200])
                return

            if result.get("escalate"):
                urgency = str(result.get("urgency", "medium"))
                if urgency not in ("low", "medium", "high"):
                    urgency = "medium"
                model_reason = str(result.get("reason", "escalatie aanbevolen door classificatie"))
                mcp_url = os.getenv("MCP_URL", "http://mcp-server:8001")
                mcp = MCPClient(base_url=mcp_url)
                await mcp.escalate_to_human(
                    patient_id=str(patient_id),
                    reason=format_escalation_reason(
                        layer_label=f"Laag 1 ({_ESCALATION_MODEL})",
                        patient_message=patient_message,
                        detail=model_reason,
                    ),
                    urgency=urgency,
                )
                logger.warning(
                    "Layer 1 escalation: patient=%s urgency=%s reason=%s",
                    patient_id, urgency, model_reason,
                )
            else:
                logger.info("Layer 1: no escalation for patient %s", patient_id)
        except Exception as exc:
            logger.exception("Layer 1 classification failed: %s", exc)
