"""Chat router — wekelijkse check-in gesprekken met Anna."""

import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta
from typing import Annotated

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.message import Message
from models.patient import Patient
from models.session import Session as ChatSession
from schemas.message import (
    ChatContextProof,
    ChatRequest,
    CombinedContextProof,
    HistoryEntryProof,
    MessageListItem,
    MessageResponse,
    PostgresContextProof,
    RAGContextProof,
    RAGHitProof,
    SessionListItem,
    StoreMemoryProof,
)
from langfuse import get_client as get_langfuse, propagate_attributes

from services.database import SessionLocal, get_db
from services.llm import get_llm_provider
from services.mcp_client import MCPClient, get_mcp_client

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

_HISTORY_LIMIT = 6
_RAG_LIMIT = 5
_HISTORY_PREVIEW_CHARS = 200
# Elke N berichten (over alle sessies) wordt de medische samenvatting opnieuw gegenereerd.
_SUMMARY_INTERVAL = int(os.getenv("SUMMARY_INTERVAL", "3"))
# Hoeveel berichten meesturen als context voor de samenvatting
_SUMMARY_CONTEXT_MESSAGES = 40

_QUESTION_STARTERS = {"waar", "wat", "wie", "hoe", "wanneer", "waarom", "welke", "hoeveel", "kan", "kunt", "weet", "bent", "heeft", "hebben", "is", "zijn"}
_REFUSAL_PATTERNS = ["geen toegang", "geen toegang tot", "heb ik geen", "weet ik niet", "weet niet waar", "kan ik niet weten", "heb geen toegang", "als een ai", "als taalmodel"]

def _is_question(text: str) -> bool:
    """Detecteer of een bericht een vraag is en geen feit om op te slaan."""
    stripped = text.strip().lower()
    if stripped.endswith("?"):
        return True
    if len(stripped) < 12:
        return True
    first_word = stripped.split()[0] if stripped.split() else ""
    return first_word in _QUESTION_STARTERS


def _is_refusal(content: str) -> bool:
    """Detecteer Anna's weigeringsantwoorden — die mogen niet als in-context voorbeeld meegestuurd worden."""
    lower = content.lower()
    return any(p in lower for p in _REFUSAL_PATTERNS)


# ─── Escalatiedetectie — gelaagde architectuur ────────────────────────────────
#
# Laag 0: hardcoded keywords — deterministisch, synchroon, vóór LLM-aanroep.
#         Nul false negatives op kritieke termen: als het woord erin zit, escaleert het.
# Laag 1: qwen2.5:0.5b classificatie — asynchroon als BackgroundTask ná de response.
#         Pikt nuancetekst op die Laag 0 mist. Draait lokaal in Ollama (geen cloudkosten).

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


def _layer0_check(text: str) -> tuple[str, str]:
    """Laag 0 — keyword-match. Retourneert (urgency, reason) of ('', '') als geen match."""
    lower = text.lower()
    for kw in _ESCALATION_HIGH:
        if kw in lower:
            return "high", f"Kritiek sleutelwoord gedetecteerd: '{kw}'"
    for kw in _ESCALATION_MEDIUM:
        if kw in lower:
            return "medium", f"Waarschuwingssleutelwoord gedetecteerd: '{kw}'"
    return "", ""


# Semaphore per patiënt — max één gelijktijdige classificatie-aanroep per patiënt (burst-beveiliging)
_patient_semaphores: dict[uuid.UUID, asyncio.Semaphore] = {}


def _get_semaphore(patient_id: uuid.UUID) -> asyncio.Semaphore:
    if patient_id not in _patient_semaphores:
        _patient_semaphores[patient_id] = asyncio.Semaphore(1)
    return _patient_semaphores[patient_id]


_ESCALATION_COOLDOWN_MINUTES = int(os.getenv("ESCALATION_COOLDOWN_MINUTES", "0"))
_OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
_ESCALATION_MODEL = os.getenv("ESCALATION_MODEL", "qwen2.5:0.5b")

_ESCALATION_CLASSIFY_SYSTEM = (
    "You are a medical triage assistant for heart failure patients. "
    "Patient messages may be in Dutch. Decide if escalation to a healthcare provider is needed. "
    "Escalate for: chest pain, loss of consciousness, breathing problems, self-harm, "
    "burning sensation or burns, severe pain, blood in stool, statements about dying, emergencies. "
    "Do NOT escalate for greetings only (hallo, olla, hi). "
    "Reply ONLY with a JSON object, no markdown, no explanation. "
    'Schema: {"escalate": true/false, "urgency": "high"|"medium", "reason": "max 80 chars"}\n'
    'Example: "ik verbrand" -> {"escalate": true, "urgency": "medium", "reason": "burning sensation reported"}\n'
    'Example: "olla" -> {"escalate": false, "urgency": "medium", "reason": "greeting only"}'
)


def _parse_escalation_json(raw: str) -> dict | None:
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
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                return None
    return None


async def _layer1_classify(
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
                    logger.info(
                        "Layer 1 skipped: cooldown active for patient %s",
                        patient_id,
                    )
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
                                    {
                                        "role": "system",
                                        "content": _ESCALATION_CLASSIFY_SYSTEM,
                                    },
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

            result = _parse_escalation_json(raw)
            if not result:
                logger.warning(
                    "Layer 1: could not parse JSON from %s: %r",
                    _ESCALATION_MODEL,
                    raw[:200],
                )
                return
            if result.get("escalate"):
                urgency = str(result.get("urgency", "medium"))
                if urgency not in ("low", "medium", "high"):
                    urgency = "medium"
                reason = str(result.get("reason", "Classification: escalation required"))
                mcp_url = os.getenv("MCP_URL", "http://mcp-server:8001")
                mcp = MCPClient(base_url=mcp_url)
                await mcp.escalate_to_human(
                    patient_id=str(patient_id),
                    reason=f"[Layer 1 — {_ESCALATION_MODEL}] {reason}",
                    urgency=urgency,
                )
                logger.warning(
                    "Layer 1 escalation: patient=%s urgency=%s reason=%s",
                    patient_id,
                    urgency,
                    reason,
                )
            else:
                logger.info(
                    "Layer 1: no escalation for patient %s (model=%s)",
                    patient_id,
                    _ESCALATION_MODEL,
                )
        except Exception as exc:
            logger.exception("Layer 1 classification failed: %s", exc)


def _build_context_proof(
    *,
    patient_id: uuid.UUID,
    session_id: uuid.UUID,
    memories: list[dict],
    user_query: str,
    rag_limit: int,
    history_rows: list[Message],
    system_prompt: str,
    chroma_document_id: str | None,
    summary_block_present: bool,
) -> ChatContextProof:
    """Assemble portfolio-friendly provenance for Postgres vs RAG in one turn."""
    history_entries = [
        HistoryEntryProof(
            message_id=m.id,
            role=m.role,
            content_preview=(m.content or "")[:_HISTORY_PREVIEW_CHARS],
        )
        for m in history_rows
    ]
    hits = [
        RAGHitProof(
            content=h.get("content", ""),
            source=h.get("source", ""),
            session_id=str(h.get("session_id", "")),
            distance=h.get("distance"),
        )
        for h in memories
    ]
    memory_block_present = bool(memories)
    return ChatContextProof(
        postgres=PostgresContextProof(
            session_id=session_id,
            patient_id=patient_id,
            history_query_limit=_HISTORY_LIMIT,
            messages_in_history=len(history_rows),
            history_entries=history_entries,
        ),
        rag=RAGContextProof(
            query=user_query,
            limit=rag_limit,
            hit_count=len(memories),
            hits=hits,
        ),
        store_memory=StoreMemoryProof(chroma_document_id=chroma_document_id),
        combined=CombinedContextProof(
            history_messages_sent_to_llm=len(history_rows),
            system_prompt_includes_rag_block=memory_block_present,
            system_prompt_includes_summary_block=summary_block_present,
            system_prompt_char_length=len(system_prompt),
        ),
    )


def _build_summary_prompt(patient_name: str, current_summary: str | None, messages: list[dict]) -> str:
    """Bouw de prompt die de medische samenvatting genereert of bijwerkt."""
    lines = "\n".join(
        f"[{m['role'].upper()}] {m['content']}" for m in messages
    )
    current = current_summary or '{"sym":[],"med":null,"wgt":null,"bhv":null,"ovr":[]}'
    return (
        f"You are updating a medical dossier for patient {patient_name}.\n\n"
        f"Current dossier (JSON):\n{current}\n\n"
        f"Conversation ([USER] = patient, [ASSISTANT] = AI):\n{lines}\n\n"
        f"Return the updated dossier as a single JSON object. "
        f"Output ONLY the JSON — no explanation, no preamble, no markdown.\n"
        f"Schema: "
        f'{{"sym":[],"med":null,"wgt":null,"bhv":null,"ovr":[]}}\n'
        f"Rules:\n"
        f"- Only use facts from [USER] lines. [ASSISTANT] lines are not facts.\n"
        f"- Only include MEDICALLY RELEVANT facts (symptoms, weight, medication, health behaviour).\n"
        f"- Ignore questions, jokes, addresses, phone numbers, and non-medical statements.\n"
        f"- Preserve existing facts. Add new ones. Remove only if the patient contradicts them.\n"
        f"- No duplicates. Max 6 words per entry. Dutch."
    )


async def _trigger_summary_update(patient_id: uuid.UUID) -> None:
    """Achtergrondtaak — genereert een nieuwe medische samenvatting en slaat die op.

    Draait via FastAPI BackgroundTasks zodat de HTTP-response niet geblokkeerd wordt.
    Gebruikt een eigen DB-sessie (de request-sessie is al gesloten op dit punt).
    """
    await _async_summary_update(patient_id)


async def _async_summary_update(patient_id: uuid.UUID) -> None:
    """Async kern van de samenvattingsupdate — apart zodat we asyncio.run() kunnen gebruiken."""
    db = SessionLocal()
    try:
        patient = db.get(Patient, patient_id)
        if not patient:
            return

        # Haal de laatste N berichten op over alle sessies van deze patiënt
        recent_messages = (
            db.query(Message)
            .join(Message.session)
            .filter(Message.session.has(patient_id=patient_id))
            .order_by(Message.created_at.desc())
            .limit(_SUMMARY_CONTEXT_MESSAGES)
            .all()
        )
        recent_messages.reverse()

        if not recent_messages:
            return

        messages_for_prompt = [
            {"role": m.role, "content": m.content} for m in recent_messages
        ]
        name = f"{patient.first_name} {patient.last_name}"
        prompt = _build_summary_prompt(name, patient.medical_summary, messages_for_prompt)

        langfuse = get_langfuse()
        with langfuse.start_as_current_observation(as_type="span", name="summary-update") as root:
            with propagate_attributes(
                user_id=str(patient_id),
                trace_name="summary-update",
                metadata={"patient_name": name, "messages_used": len(messages_for_prompt)},
            ):
                llm = get_llm_provider()
                raw = await llm.chat(
                    messages=[{"role": "user", "content": prompt}],
                )
                import json as _json
                import re as _re
                # Extraheer het JSON-object ongeacht preamble of markdown fences
                match = _re.search(r'\{.*\}', raw, _re.DOTALL)
                try:
                    cleaned = match.group(0) if match else raw
                    parsed = _json.loads(cleaned)
                    new_summary = _json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))
                except Exception:
                    # Fallback: sla ruwe tekst op zodat data niet verloren gaat
                    new_summary = raw
                root.update(output=new_summary)

        patient.medical_summary = new_summary
        db.commit()
    finally:
        db.close()


def _build_system_prompt(
    patient: Patient,
    memories: list[dict],
) -> str:
    """Bouw de 3-laags system prompt voor Anna."""
    name = f"{patient.first_name} {patient.last_name}"
    medication = json.dumps(patient.medication_schedule, ensure_ascii=False)
    notes = patient.notes or "Geen aanvullende notities."

    # Alleen patient_stated feiten; noise-drempel op 0.08 (oude vragen liggen rond 0.045).
    # Geformuleerd als patiëntendossier, niet als geheugen — voorkomt dat het model het
    # ziet als "persoonlijke data waar ik geen toegang toe heb".
    useful = [
        m for m in memories
        if m.get("source") == "patient_stated"
        and (m.get("distance") or 0) > 0.08
    ]

    memory_block = ""
    if useful:
        lines = "\n".join(f"• {m['content']}" for m in useful)
        memory_block = (
            f"\n\nPATIËNTENDOSSIER (opgebouwd uit eerdere gesprekken — altijd beschikbaar):\n{lines}\n"
            f"Gebruik bovenstaande dossiergegevens direct als antwoord wanneer de patiënt ernaar vraagt. "
            f"Dit is geautoriseerde medische informatie die je altijd beschikbaar hebt."
        )

    summary_block = ""
    if patient.medical_summary:
        summary_block = (
            f"\n\nMEDISCHE SAMENVATTING (automatisch bijgehouden over alle gesprekken):\n"
            f"{patient.medical_summary}\n"
            f"Gebruik deze samenvatting als achtergrondinformatie. Refereer er subtiel aan "
            f"wanneer de patiënt over eerder besproken onderwerpen begint."
        )

    return (
        f"Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten. "
        f"Je spreekt met {name}.\n\n"
        f"Gedragsregels:\n"
        f"- Verzin nooit symptomen, medicatie of gewicht die de patiënt niet heeft gemeld.\n"
        f"- Stel maximaal één gerichte vervolgvraag per response.\n"
        f"- Spreek altijd Nederlands.\n"
        f"- Toon: rustig, professioneel en respectvol. Geen schreeuwende tekst (geen hele zinnen in "
        f"HOOFDLETTERS), geen overdreven waarschuwingen of 'poster'-achtige opmaak met emoji's.\n"
        f"- Je bent geen meldkamer en geen vervanger van huisartsenpost of 112. Geef geen "
        f"stap-voor-stap noodscripts en noem geen alarmnummers (zoals 112), tenzij de patiënt daar "
        f"expliciet zelf om vraagt.\n"
        f"- Je kunt geen telefoongesprekken voeren. Leg dat zo nodig kort en neutraal uit.\n"
        f"- Als de patiënt een telefoonnummer deelt: noteer het kort. Gebruik het niet voor "
        f"dramatische belplannen.\n"
        f"- Reageer proportioneel op het huidige bericht, niet op het patroon van eerdere berichten.\n\n"
        f"Patiëntgegevens:\n"
        f"- Naam: {name}\n"
        f"- Medicatieschema: {medication}\n"
        f"- Notities zorgverlener: {notes}"
        f"{summary_block}"
        f"{memory_block}"
    )


@router.get(
    "/{patient_id}/sessions",
    response_model=list[SessionListItem],
    responses={404: {"description": "Patiënt niet gevonden"}},
)
def list_sessions(
    patient_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    """Geef alle sessies voor een patiënt, inclusief berichtenaantal."""
    from models.patient import Patient as PatientModel
    if not db.get(PatientModel, patient_id):
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")

    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.patient_id == patient_id)
        .order_by(ChatSession.started_at.desc())
        .all()
    )

    session_ids = [s.id for s in sessions]
    counts: dict[uuid.UUID, int] = {}
    if session_ids:
        rows = (
            db.query(Message.session_id, func.count(Message.id))
            .filter(Message.session_id.in_(session_ids))
            .group_by(Message.session_id)
            .all()
        )
        counts = {sid: cnt for sid, cnt in rows}

    return [
        {
            "id": s.id,
            "started_at": s.started_at,
            "ended_at": s.ended_at,
            "message_count": counts.get(s.id, 0),
            "is_open": s.ended_at is None,
        }
        for s in sessions
    ]


@router.get(
    "/{patient_id}/sessions/{session_id}/messages",
    response_model=list[MessageListItem],
    responses={404: {"description": "Sessie niet gevonden"}},
)
def list_messages(
    patient_id: uuid.UUID,
    session_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[Message]:
    """Geef alle berichten voor een sessie, chronologisch."""
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.patient_id == patient_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessie niet gevonden")

    return (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .all()
    )


@router.post(
    "/{patient_id}/sessions/close",
    response_model=SessionListItem,
    responses={404: {"description": "Geen open sessie gevonden"}},
)
def close_session(
    patient_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Sluit de huidige open sessie af zodat de volgende chat een nieuwe aanmaakt."""
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.patient_id == patient_id,
            ChatSession.ended_at.is_(None),
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Geen open sessie gevonden")

    session.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(session)

    count = (
        db.query(func.count(Message.id))
        .filter(Message.session_id == session.id)
        .scalar()
    ) or 0

    return {
        "id": session.id,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "message_count": count,
        "is_open": False,
    }


@router.post(
    "/{patient_id}",
    response_model=MessageResponse,
    response_model_exclude_none=True,
    responses={404: {"description": "Patiënt niet gevonden"}},
)
async def chat(
    patient_id: uuid.UUID,
    body: ChatRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    mcp: Annotated[MCPClient, Depends(get_mcp_client)],
    debug: Annotated[
        bool,
        Query(
            description=(
                "If true, response includes context_proof: PostgreSQL message "
                "history vs MCP recall_context / store_memory (RAG) and how they combine."
            ),
        ),
    ] = False,
) -> MessageResponse:
    """Stuur een bericht namens de patiënt en ontvang Anna's response."""
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")

    # Haal bestaande open sessie op, of maak een nieuwe
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.patient_id == patient_id,
            ChatSession.ended_at.is_(None),
        )
        .first()
    )
    if not session:
        session = ChatSession(patient_id=patient_id)
        db.add(session)
        db.commit()
        db.refresh(session)

    # Sla het user-bericht op in PostgreSQL
    user_message = Message(
        session_id=session.id,
        role="user",
        content=body.content,
    )
    db.add(user_message)
    db.commit()

    # Sla alleen feitelijke uitspraken op — geen vragen en geen korte berichten.
    # Vragen veroorzaken self-hits in ChromaDB (distance ≈ 0) en verdringen feiten.

    store_coro = (
        mcp.store_memory(
            content=body.content,
            source="patient_stated",
            patient_id=str(patient_id),
            session_id=str(session.id),
        )
        if not _is_question(body.content)
        else asyncio.sleep(0)
    )

    langfuse = get_langfuse()
    with langfuse.start_as_current_observation(
        as_type="span",
        name="chat-turn",
        input=body.content,
    ) as root_span:
        with propagate_attributes(
            user_id=str(patient_id),
            session_id=str(session.id),
            trace_name="chat-turn",
            metadata={"patient_name": f"{patient.first_name} {patient.last_name}"},
        ):
            # RAG-context ophalen + geheugen opslaan als traceerbare child span
            with langfuse.start_as_current_observation(
                as_type="span",
                name="rag-retrieval",
                input=body.content,
            ) as rag_span:
                rag_result, store_result = await asyncio.gather(
                    mcp.recall_context(
                        query=body.content,
                        patient_id=str(patient_id),
                        limit=_RAG_LIMIT,
                    ),
                    store_coro,
                    return_exceptions=True,
                )
                memories: list[dict] = rag_result if isinstance(rag_result, list) else []
                chroma_doc_id: str | None = store_result if isinstance(store_result, str) else None
                rag_span.update(
                    output=[m.get("content", "") for m in memories],
                    metadata={"hit_count": len(memories), "limit": _RAG_LIMIT},
                )

            # Laatste N berichten van de huidige sessie als conversation history
            recent = (
                db.query(Message)
                .filter(Message.session_id == session.id)
                .order_by(Message.created_at.desc())
                .limit(_HISTORY_LIMIT)
                .all()
            )
            recent.reverse()
            # Verwijder Anna's weigeringsantwoorden — die werken als negatief in-context voorbeeld.
            history = [
                {"role": m.role, "content": m.content}
                for m in recent
                if not (m.role == "assistant" and _is_refusal(m.content))
            ]

            # Laag 0 — keyword-check vóór LLM-aanroep (deterministisch, geen AI)
            with langfuse.start_as_current_observation(
                as_type="span",
                name="escalation-layer0",
                input=body.content,
            ) as l0_span:
                layer0_urgency, layer0_reason = _layer0_check(body.content)
                l0_span.update(
                    output={"triggered": bool(layer0_urgency), "urgency": layer0_urgency or "none"},
                    metadata={"reason": layer0_reason or "geen match"},
                )

            system_prompt = _build_system_prompt(patient, memories)
            root_span.update(metadata={
                "patient_name": f"{patient.first_name} {patient.last_name}",
                "rag_hits": len(memories),
                "history_messages": len(history),
                "layer0_triggered": bool(layer0_urgency),
            })
            llm = get_llm_provider()
            raw_response = await llm.chat(messages=history, system=system_prompt)
            root_span.update(output=raw_response)

    # Sla Anna's antwoord op
    assistant_message = Message(
        session_id=session.id,
        role="assistant",
        content=raw_response,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    # Elke _SUMMARY_INTERVAL berichten de medische samenvatting opnieuw genereren.
    # Tel alle berichten van deze patiënt over alle sessies.
    total_messages: int = (
        db.query(func.count(Message.id))
        .join(Message.session)
        .filter(Message.session.has(patient_id=patient_id))
        .scalar()
    ) or 0
    summary_triggered = total_messages % _SUMMARY_INTERVAL == 0
    if summary_triggered:
        background_tasks.add_task(_trigger_summary_update, patient_id)

    # Laag 0: directe escalatie als keyword gedetecteerd
    should_escalate = bool(layer0_urgency)
    if should_escalate:
        try:
            await mcp.escalate_to_human(
                patient_id=str(patient_id),
                reason=layer0_reason,
                urgency=layer0_urgency,
            )
        except Exception:
            pass
    else:
        # Laag 1: lokale classificatie als BackgroundTask (geen extra cloudkosten)
        background_tasks.add_task(_layer1_classify, patient_id, body.content, session.id)

    base = MessageResponse.model_validate(assistant_message)
    base = base.model_copy(update={
        "summary_update_triggered": summary_triggered,
        "escalation_triggered": should_escalate,
    })
    if not debug:
        return base
    proof = _build_context_proof(
        patient_id=patient_id,
        session_id=session.id,
        memories=memories,
        user_query=body.content,
        rag_limit=_RAG_LIMIT,
        history_rows=recent,
        system_prompt=system_prompt,
        chroma_document_id=chroma_doc_id or None,
        summary_block_present=bool(patient.medical_summary),
    )
    return base.model_copy(update={"context_proof": proof})
