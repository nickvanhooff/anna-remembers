"""FastAPI route handlers for the chat endpoint."""

import asyncio
import re
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from langfuse import get_client as get_langfuse
from langfuse import propagate_attributes
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
from services.database import get_db
from services.llm import get_llm_provider
from services.mcp_client import MCPClient, get_mcp_client
from sqlalchemy import func
from sqlalchemy.orm import Session

from ._escalation import format_escalation_reason, layer0_check, layer1_classify
from ._prompts import build_system_prompt
from ._summary import _SUMMARY_INTERVAL, trigger_summary_update

router = APIRouter(prefix="/chat", tags=["chat"])

_HISTORY_LIMIT = 6
_RAG_LIMIT = 5
_HISTORY_PREVIEW_CHARS = 200

_QUESTION_STARTERS = {
    "waar",
    "wat",
    "wie",
    "hoe",
    "wanneer",
    "waarom",
    "welke",
    "hoeveel",
    "kan",
    "kunt",
    "weet",
    "bent",
    "heeft",
    "hebben",
    "is",
    "zijn",
}
_REFUSAL_PATTERNS = [
    "geen toegang",
    "geen toegang tot",
    "heb ik geen",
    "weet ik niet",
    "weet niet waar",
    "kan ik niet weten",
    "heb geen toegang",
    "als een ai",
    "als taalmodel",
]

# Mood-namen = bestandsnamen in frontend/public/ (zonder .glb). Default:
# standard_waiting. De LLM moet uit deze lijst kiezen.
_DEFAULT_MOOD = "standard_waiting"

# Mood/anim-namen = bestandsnamen in frontend/public/ (zonder .glb). Default:
# standard_waiting. De LLM moet uit deze lijst kiezen.
_VALID_MOODS = {
    "standard_waiting",
    "stand_look_around",
    "running_fast",
    "standard_walk_crouching",
    "flexing_arm",
    "gorilla",
    "laying_on_floor",
    "just_chilling",
    "angry",
    "Expressing_joy",
    "model",
    "model (13)",
}

# Accept [MOOD: x], MOOD: x, [ANIM: x], ANIM: x — case-insensitive,
# optional whitespace, optional brackets. Robust against small LLM formatting errors.
# Note: values may contain spaces/parentheses (e.g. "model (13)").
# Also accepts minor variants like `ANIM - x` or `[ANIM x]` (missing colon).
_MOOD_RE = re.compile(
    r"^\s*\[?\s*(?:MOOD|ANIM|ANIMATION)\s*(?::|=|-)?\s*([^\]\r\n]+?)\s*\]?\s*(?:\r?\n)?",
    re.IGNORECASE,
)
_MOOD_LOOKUP = {m.lower(): m for m in _VALID_MOODS}


def _levenshtein(a: str, b: str) -> int:
    """Small Levenshtein distance for fuzzy tag parsing (no external deps)."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)

    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            cur.append(
                min(
                    prev[j] + 1,  # deletion
                    cur[j - 1] + 1,  # insertion
                    prev[j - 1] + cost,  # substitution
                )
            )
        prev = cur
    return prev[-1]


def _canonicalize_mood(raw: str) -> str | None:
    """Map a raw tag value to a canonical mood key.

    Handles:
    - exact values from `_VALID_MOODS`
    - common alias-like values (e.g. "standard_running" → "running_fast")
    - small typos (Levenshtein)

    Returns None if we can't confidently map.
    """
    s = (raw or "").strip().strip("[]").strip()
    if not s:
        return None

    s_l = s.lower()
    exact = _MOOD_LOOKUP.get(s_l)
    if exact:
        return exact

    # Alias / heuristic mapping for common "close enough" values
    alias_contains: list[tuple[str, str]] = [
        ("standard_running", "running_fast"),
        ("running", "running_fast"),
        ("hardloop", "running_fast"),
        ("sprint", "running_fast"),
        ("angr", "angry"),
        ("boos", "angry"),
        ("joy", "Expressing_joy"),
        ("happy", "Expressing_joy"),
        ("wait", "standard_waiting"),
        ("look", "stand_look_around"),
        ("crouch", "standard_walk_crouching"),
        ("flex", "flexing_arm"),
        ("gorilla", "gorilla"),
        ("lay", "laying_on_floor"),
        ("chill", "just_chilling"),
    ]
    for needle, target in alias_contains:
        if needle in s_l and target in _VALID_MOODS:
            return target

    # Fuzzy match (small typos like `ngry` → `angry`)
    best: str | None = None
    best_d = 10**9
    for m in _VALID_MOODS:
        d = _levenshtein(s_l, m.lower())
        if d < best_d:
            best_d = d
            best = m

    if best is None:
        return None

    # Conservative threshold
    if best_d <= 2:
        return best
    if len(best) >= 12 and best_d <= 3 and best_d / len(best) <= 0.25:
        return best

    return None


def _try_extract_bare_mood_prefix(text: str) -> tuple[str, str] | None:
    """Handle broken prefixes like `tandard_walk_crouching]`, `ngry]`, or `ng]`.

    Looks at the first line only. If it contains a closing `]` early:
    - If token resembles a known mood key (exact/alias/typo), strip it and return that mood.
    - Otherwise, if it *looks like* a broken tag (short alpha token), strip it anyway and
      return the default mood so the tag never leaks into the UI.
    """
    stripped = text.lstrip()
    if not stripped:
        return None

    first_line = stripped.splitlines(True)[0]
    end = first_line.find("]")
    if end == -1 or end > 80:
        return None

    token = first_line[:end].lstrip("[ ").strip()
    if not token:
        return None

    canonical = _canonicalize_mood(token)
    if canonical:
        return stripped[end + 1 :].lstrip(), canonical

    # If the model produced a very short broken token like `ng]`, strip it anyway.
    token_l = token.lower()
    if token_l.isalpha() and 2 <= len(token_l) <= 6:
        return stripped[end + 1 :].lstrip(), _DEFAULT_MOOD

    return None


def _try_extract_mood_first_line_key(text: str) -> tuple[str, str] | None:
    """Handle cases where the LLM outputs just the mood key on the first line.

    Example:
      standard_running_\n<rest>
    """
    stripped = text.lstrip()
    if not stripped:
        return None

    first_line = stripped.splitlines(True)[0]
    token = first_line.strip().strip("[]").strip()

    # Only consider single-token lines (avoid matching normal sentences)
    if not token or " " in token or len(token) > 60:
        return None

    canonical = _canonicalize_mood(token)
    if not canonical:
        return None

    return stripped[len(first_line) :].lstrip(), canonical


def _infer_mood_from_user(text: str) -> str | None:
    """Infer a mood/animation from the user's message (UI-only heuristic).

    This is intentionally conservative and only triggers on clear signals.
    """
    t = (text or "").lower().strip()

    # ── Explicit debug / model selection (rare) ───────────────────────────
    if "model (13)" in t or "model 13" in t:
        return "model (13)"
    if t == "model" or " model" in t:
        return "model"
    if "gorilla" in t:
        return "gorilla"

    # ── Clear physical intent ────────────────────────────────────────────
    if "renn" in t or "hardloop" in t or "sprint" in t or "run" in t:
        return "running_fast"

    if (
        "hurk" in t
        or "gehurkt" in t
        or "crouch" in t
        or "squat" in t
        or "kruip" in t
        or "kruipen" in t
        or "door m'n knie" in t
        or "door mijn knie" in t
    ):
        return "standard_walk_crouching"

    # Only trigger "laying_on_floor" on explicit floor/ground language
    if (
        "op de grond" in t
        or "op het grond" in t
        or "op de vloer" in t
        or "op de grond" in t
        or "vloer" in t
        or "neergevallen" in t
        or "ik ben gevallen" in t
    ):
        return "laying_on_floor"

    # "flexing_arm" only when user indicates flexing/strength, not just "arm" pain
    if (
        "flex" in t
        or "biceps" in t
        or "spier" in t
        or "spieren" in t
        or "kracht" in t
        or "krachttraining" in t
        or "spierbal" in t
        or "span mijn arm" in t
        or "arm aanspannen" in t
    ):
        return "flexing_arm"

    # ── Emotions ─────────────────────────────────────────────────────────
    if (
        "heel erg blij" in t
        or "superblij" in t
        or "ik ben blij" in t
        or "gelukkig" in t
        or "fantastisch" in t
        or "geweldig" in t
    ):
        return "Expressing_joy"

    if "boos" in t or "kwaad" in t or "woed" in t:
        return "angry"

    # ── Idle / waiting ───────────────────────────────────────────────────
    if "wacht" in t or "even wachten" in t or "momentje" in t:
        return "standard_waiting"

    if "chill" in t or "relax" in t or "rustig aan" in t or "niks doen" in t:
        return "just_chilling"

    if "rondkijk" in t or "rond kijken" in t or "om me heen" in t or "kijk rond" in t:
        return "stand_look_around"

    return None


def _extract_mood(text: str) -> tuple[str, str, bool]:
    """Strip a leading mood/anim tag and return (clean_text, mood, tag_found).

    Supports:
    - `[ANIM: x]` / `ANIM: x` / `[MOOD x]` etc.
    - Broken bracket-only prefixes like `tandard_walk_crouching]`

    Always returns a valid mood string (defaults to standard_waiting).
    `tag_found` is True if we saw a tag-like prefix (even if unknown).
    """
    if not text:
        return text, _DEFAULT_MOOD, False

    match = _MOOD_RE.match(text)
    if match:
        raw = match.group(1)
        canonical = _canonicalize_mood(raw) or _DEFAULT_MOOD
        return text[match.end() :].lstrip(), canonical, True

    bare = _try_extract_bare_mood_prefix(text)
    if bare:
        clean, mood = bare
        return clean, mood, True

    bare_line = _try_extract_mood_first_line_key(text)
    if bare_line:
        clean, mood = bare_line
        return clean, mood, True

    return text, _DEFAULT_MOOD, False


def _is_question(text: str) -> bool:
    """Detect whether a message is a question and not a fact to store."""
    stripped = text.strip().lower()
    if stripped.endswith("?"):
        return True
    if len(stripped) < 12:
        return True
    first_word = stripped.split()[0] if stripped.split() else ""
    return first_word in _QUESTION_STARTERS


def _is_refusal(content: str) -> bool:
    """Detect Anna's refusal responses."""
    lower = content.lower()
    return any(p in lower for p in _REFUSAL_PATTERNS)


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
            system_prompt_includes_rag_block=bool(memories),
            system_prompt_includes_summary_block=summary_block_present,
            system_prompt_char_length=len(system_prompt),
        ),
    )


# ─── Routes ──────────────────────────────────────────────────────────────────


@router.get(
    "/{patient_id}/sessions",
    response_model=list[SessionListItem],
    responses={404: {"description": "Patiënt niet gevonden"}},
)
def list_sessions(
    patient_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    """Return all sessions for a patient, including message count."""
    if not db.get(Patient, patient_id):
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
    """Return all messages for a session, chronological."""
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_id,
            ChatSession.patient_id == patient_id,
        )
        .first()
    )
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
    """Close the current open session."""
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
            )
        ),
    ] = False,
) -> MessageResponse:
    """Send a message on behalf of the patient and return Anna's response."""
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")

    # Fetch open session or create a new one
    session = (
        db.query(ChatSession)
        .filter(ChatSession.patient_id == patient_id, ChatSession.ended_at.is_(None))
        .first()
    )
    if not session:
        session = ChatSession(patient_id=patient_id)
        db.add(session)
        db.commit()
        db.refresh(session)

    # Store user message
    user_message = Message(session_id=session.id, role="user", content=body.content)
    db.add(user_message)
    db.commit()

    # Store factual statements only — not questions
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
        as_type="span", name="chat-turn", input=body.content
    ) as root_span:
        with propagate_attributes(
            user_id=str(patient_id),
            session_id=str(session.id),
            trace_name="chat-turn",
            metadata={"patient_name": f"{patient.first_name} {patient.last_name}"},
        ):
            with langfuse.start_as_current_observation(
                as_type="span", name="rag-retrieval", input=body.content
            ) as rag_span:
                rag_result, store_result = await asyncio.gather(
                    mcp.recall_context(
                        query=body.content, patient_id=str(patient_id), limit=_RAG_LIMIT
                    ),
                    store_coro,
                    return_exceptions=True,
                )
                memories: list[dict] = (
                    rag_result if isinstance(rag_result, list) else []
                )
                chroma_doc_id: str | None = (
                    store_result if isinstance(store_result, str) else None
                )
                rag_span.update(
                    output=[m.get("content", "") for m in memories],
                    metadata={"hit_count": len(memories)},
                )

            recent = (
                db.query(Message)
                .filter(Message.session_id == session.id)
                .order_by(Message.created_at.desc())
                .limit(_HISTORY_LIMIT)
                .all()
            )
            recent.reverse()
            history = [
                {"role": m.role, "content": m.content}
                for m in recent
                if not (m.role == "assistant" and _is_refusal(m.content))
            ]

            # Layer 0 — keyword check before LLM call
            with langfuse.start_as_current_observation(
                as_type="span", name="escalation-layer0", input=body.content
            ) as l0_span:
                layer0_urgency, layer0_reason = layer0_check(body.content)
                l0_span.update(
                    output={
                        "triggered": bool(layer0_urgency),
                        "urgency": layer0_urgency or "none",
                    },
                    metadata={"reason": layer0_reason or "geen match"},
                )

            system_prompt = build_system_prompt(patient, memories)
            root_span.update(
                metadata={
                    "patient_name": f"{patient.first_name} {patient.last_name}",
                    "rag_hits": len(memories),
                    "history_messages": len(history),
                    "layer0_triggered": bool(layer0_urgency),
                }
            )
            llm = get_llm_provider()
            raw_response = await llm.chat(messages=history, system=system_prompt)
            root_span.update(output=raw_response)

    # Strip leading [ANIM: x] / [MOOD: x] tag — drives the frontend avatar swap.
    clean_response, mood, tag_found = _extract_mood(raw_response)

    # Heuristic: infer a sensible animation from the user's message.
    # If the LLM makes a mistake (wrong/garbled tag), this keeps the UI consistent.
    inferred = _infer_mood_from_user(body.content or "")
    if inferred and inferred != mood:
        mood = inferred

    # Store Anna's reply (zonder mood-prefix — patiënt ziet de tag niet)
    assistant_message = Message(
        session_id=session.id, role="assistant", content=clean_response
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    # Update summary every N messages
    total_messages: int = (
        db.query(func.count(Message.id))
        .join(Message.session)
        .filter(Message.session.has(patient_id=patient_id))
        .scalar()
    ) or 0
    summary_triggered = total_messages % _SUMMARY_INTERVAL == 0
    if summary_triggered:
        background_tasks.add_task(trigger_summary_update, patient_id)

    # Escalation: Layer 0 immediate, else Layer 1 as BackgroundTask
    should_escalate = bool(layer0_urgency)
    if should_escalate:
        try:
            await mcp.escalate_to_human(
                patient_id=str(patient_id),
                reason=format_escalation_reason(
                    layer_label="Laag 0 (keywords)",
                    patient_message=body.content,
                    detail=layer0_reason,
                ),
                urgency=layer0_urgency,
            )
        except Exception:
            pass
    else:
        background_tasks.add_task(layer1_classify, patient_id, body.content, session.id)

    base = MessageResponse.model_validate(assistant_message)
    base = base.model_copy(
        update={
            "mood": mood,
            "summary_update_triggered": summary_triggered,
            "escalation_triggered": should_escalate,
        }
    )
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
