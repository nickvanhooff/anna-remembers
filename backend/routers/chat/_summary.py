"""Background task for maintaining the medical summary per patient."""

import json
import os
import re
import uuid

from langfuse import get_client as get_langfuse, propagate_attributes

from models.message import Message
from models.patient import Patient
from services.database import SessionLocal
from services.llm import get_llm_provider

from ._prompts import build_summary_prompt

_SUMMARY_CONTEXT_MESSAGES = 40
_SUMMARY_INTERVAL = int(os.getenv("SUMMARY_INTERVAL", "3"))


async def trigger_summary_update(patient_id: uuid.UUID) -> None:
    """Background task — generates a new medical summary and stores it.

    Runs via FastAPI BackgroundTasks. Uses its own DB session.
    """
    db = SessionLocal()
    try:
        patient = db.get(Patient, patient_id)
        if not patient:
            return

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

        messages_for_prompt = [{"role": m.role, "content": m.content} for m in recent_messages]
        name = f"{patient.first_name} {patient.last_name}"
        prompt = build_summary_prompt(name, patient.medical_summary, messages_for_prompt)

        langfuse = get_langfuse()
        with langfuse.start_as_current_observation(as_type="span", name="summary-update") as root:
            with propagate_attributes(
                user_id=str(patient_id),
                trace_name="summary-update",
                metadata={"patient_name": name, "messages_used": len(messages_for_prompt)},
            ):
                llm = get_llm_provider()
                raw = await llm.chat(messages=[{"role": "user", "content": prompt}])
                match = re.search(r'\{.*\}', raw, re.DOTALL)
                try:
                    cleaned = match.group(0) if match else raw
                    parsed = json.loads(cleaned)
                    new_summary = json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))
                except Exception:
                    new_summary = raw
                root.update(output=new_summary)

        patient.medical_summary = new_summary
        db.commit()
    finally:
        db.close()
