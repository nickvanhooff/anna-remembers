"""Chat router — wekelijkse check-in gesprekken met Anna.

Huidige status: opzet klaar, LLM-aanroep is stub.
Volgende stap (issue #3): MCP-tools aanroepen voor context + geheugen.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.message import Message
from models.patient import Patient
from models.session import Session as ChatSession
from schemas.message import ChatRequest, MessageResponse
from services.database import get_db
from services.llm import get_llm_provider

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/{patient_id}", response_model=MessageResponse)
async def chat(
    patient_id: uuid.UUID,
    body: ChatRequest,
    db: Session = Depends(get_db),
) -> Message:
    """Stuur een bericht namens de patiënt en ontvang Anna's response.

    Flow (volledig — geïmplementeerd in latere issues):
    1. Laad patiëntcontext uit PostgreSQL
    2. Haal relevante herinneringen op via MCP recall_context()     [issue #3]
    3. Haal symptoomtrends op via MCP get_symptom_trends()          [issue #3]
    4. Sla user-bericht op in PostgreSQL + ChromaDB                 [issue #3]
    5. Roep LLM aan met context + herinneringen
    6. Sla Anna's response op
    7. Escaleer indien nodig via MCP escalate_to_human()            [issue #3]
    """
    # Controleer of patiënt bestaat
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patiënt niet gevonden")

    # Maak sessie aan of hergebruik bestaande open sessie
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

    # Sla user-bericht op
    user_message = Message(session_id=session.id, role="user", content=body.content)
    db.add(user_message)
    db.commit()

    # --- LLM aanroep (stub — MCP-context volgt in issue #3) ---
    llm = get_llm_provider()
    system_prompt = (
        f"Je bent Anna, een empathische AI-gezondheidsassistent voor hartfalenpatiënten. "
        f"Je spreekt met {patient.name}. Stel gerichte vervolgvragen over symptomen "
        f"zoals kortademigheid, enkeloedeem en gewicht. Verzin nooit informatie."
    )
    response_text = await llm.chat(
        messages=[{"role": "user", "content": body.content}],
        system=system_prompt,
    )

    # Sla Anna's response op
    assistant_message = Message(
        session_id=session.id, role="assistant", content=response_text
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    return assistant_message
