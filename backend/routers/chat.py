"""Chat router — wekelijkse check-in gesprekken met Anna."""

import asyncio
import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from models.message import Message
from models.patient import Patient
from models.session import Session as ChatSession
from schemas.message import (
    ChatContextProof,
    ChatRequest,
    CombinedContextProof,
    HistoryEntryProof,
    MessageResponse,
    PostgresContextProof,
    RAGContextProof,
    RAGHitProof,
    StoreMemoryProof,
)
from services.database import get_db
from services.llm import get_llm_provider
from services.mcp_client import MCPClient, get_mcp_client

router = APIRouter(prefix="/chat", tags=["chat"])

_HISTORY_LIMIT = 10
_RAG_LIMIT = 5
_HISTORY_PREVIEW_CHARS = 200


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
            system_prompt_char_length=len(system_prompt),
        ),
    )


def _build_system_prompt(
    patient: Patient,
    memories: list[dict],
) -> str:
    """Bouw de 3-laags system prompt voor Anna."""
    name = f"{patient.first_name} {patient.last_name}"
    medication = json.dumps(patient.medication_schedule, ensure_ascii=False)
    notes = patient.notes or "Geen aanvullende notities."

    memory_block = ""
    if memories:
        lines = "\n".join(f"- [{m['source']}] {m['content']}" for m in memories)
        memory_block = f"\n\nRelevante eerdere uitspraken van deze patiënt:\n{lines}"

    return (
        f"Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten. "
        f"Je spreekt met {name}.\n\n"
        f"Gedragsregels:\n"
        f"- Verzin nooit symptomen, medicatie of gewicht die de patiënt niet heeft gemeld.\n"
        f"- Refereer aan eerdere uitspraken als die relevant zijn voor het huidige gesprek.\n"
        f"- Stel maximaal één gerichte vervolgvraag per response.\n"
        f"- Spreek altijd Nederlands.\n\n"
        f"Patiëntgegevens:\n"
        f"- Naam: {name}\n"
        f"- Medicatieschema: {medication}\n"
        f"- Notities zorgverlener: {notes}"
        f"{memory_block}"
    )


@router.post(
    "/{patient_id}",
    response_model=MessageResponse,
    response_model_exclude_none=True,
    responses={404: {"description": "Patiënt niet gevonden"}},
)
async def chat(
    patient_id: uuid.UUID,
    body: ChatRequest,
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

    # RAG-context ophalen + geheugen opslaan — parallel voor minimale latency
    memories, chroma_doc_id = await asyncio.gather(
        mcp.recall_context(
            query=body.content,
            patient_id=str(patient_id),
            limit=_RAG_LIMIT,
        ),
        mcp.store_memory(
            content=body.content,
            source="patient_stated",
            patient_id=str(patient_id),
            session_id=str(session.id),
        ),
    )

    # Laatste 10 berichten van de huidige sessie als conversation history
    recent = (
        db.query(Message)
        .filter(Message.session_id == session.id)
        .order_by(Message.created_at.desc())
        .limit(_HISTORY_LIMIT)
        .all()
    )
    recent.reverse()
    history = [{"role": m.role, "content": m.content} for m in recent]

    # Bouw system prompt en roep LLM aan
    system_prompt = _build_system_prompt(patient, memories)
    llm = get_llm_provider()
    response_text = await llm.chat(messages=history, system=system_prompt)

    # Sla Anna's antwoord op
    assistant_message = Message(
        session_id=session.id,
        role="assistant",
        content=response_text,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    # Escalatie stub — implementatie volgt in een volgend issue
    await mcp.escalate_to_human(
        patient_id=str(patient_id),
        reason="",
        urgency="low",
    )

    base = MessageResponse.model_validate(assistant_message)
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
    )
    return base.model_copy(update={"context_proof": proof})
