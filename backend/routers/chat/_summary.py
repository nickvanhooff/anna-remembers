"""Background task for maintaining the medical summary per patient."""

import json
import os
import re
import uuid

from langfuse import get_client as get_langfuse, propagate_attributes

from models.message import Message
from models.patient import Patient
from models.setting import Setting
from services.database import SessionLocal
from services.llm import get_llm_provider, PortkeyProvider

from ._prompts import build_summary_prompt

_SUMMARY_CONTEXT_MESSAGES = 40
_SUMMARY_INTERVAL = int(os.getenv("SUMMARY_INTERVAL", "3"))


def _get_summary_llm_provider(model: str | None):
    """Return LLM provider for summary updates.

    Uses PortkeyProvider with the DB-configured model when available.
    Falls back to the main get_llm_provider() if no model is set.
    """
    if model:
        api_key = os.getenv("PORTKEY_API_KEY", "")
        config = os.getenv("SUMMARY_PORTKEY_CONFIG") or os.getenv("PORTKEY_CONFIG") or None
        return PortkeyProvider(api_key=api_key, model=model, config=config)
    return get_llm_provider()


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

        # Read summary model from DB settings
        model_setting = db.query(Setting).filter(Setting.key == "summary_llm_model").first()
        summary_model = model_setting.value if model_setting else None

        messages_for_prompt = [{"role": m.role, "content": m.content} for m in recent_messages]
        name = f"{patient.first_name} {patient.last_name}"
        prompt = build_summary_prompt(name, patient.medical_summary, messages_for_prompt)

        langfuse = get_langfuse()
        with langfuse.start_as_current_observation(as_type="span", name="summary-update") as root:
            root.update(input=prompt)
            with propagate_attributes(
                user_id=str(patient_id),
                trace_name="summary-update",
                metadata={"patient_name": name, "messages_used": len(messages_for_prompt)},
            ):
                llm = _get_summary_llm_provider(summary_model)
                root.update(metadata={
                    "patient_name": name,
                    "messages_used": len(messages_for_prompt),
                    "llm_provider": "portkey" if summary_model else os.getenv("LLM_PROVIDER", "ollama"),
                    "llm_model": getattr(llm, "model", "unknown"),
                })
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
