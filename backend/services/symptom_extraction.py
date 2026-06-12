"""Symptom extraction service.

Extracts structured symptom observations from a chat transcript using the
configured LLM provider. Stores one observation row per session (UPSERT).
"""

import json
import logging
import re
import uuid
from datetime import datetime, timezone

from langfuse import get_client as get_langfuse, propagate_attributes

from models.symptom_observation import SymptomObservation
from services.database import SessionLocal
from services.llm import get_llm_provider

logger = logging.getLogger(__name__)

_EXTRACT_SYSTEM = (
    "Je bent een medisch documentatiesysteem voor hartfalenpatiënten. "
    "Analyseer het onderstaande gesprek en extraheer symptoomobservaties.\n"
    "\n"
    "Schaal voor dyspnea / edema / fatigue / medication:\n"
    "  0 = geen symptoom (expliciet gemeld, bijv. 'geen last van', 'gaat goed')\n"
    "  1 = licht (bijv. 'beetje benauwd', 'lichte zwelling')\n"
    "  2 = matig (bijv. 'vrij benauwd', 'duidelijke oedeem')\n"
    "  3 = ernstig (bijv. 'heel ernstig benauwd', 'zware vermoeidheid')\n"
    "  null = niet besproken in dit gesprek (gebruik dit als het onderwerp niet ter sprake kwam)\n"
    "\n"
    "BELANGRIJK: null en 0 zijn NIET hetzelfde.\n"
    "  null = het onderwerp is niet besproken\n"
    "  0    = de patiënt heeft expliciet gemeld geen klachten te hebben\n"
    "\n"
    "weight_kg: het exacte gewicht in kg als getal (float), of null als niet gemeld.\n"
    "\n"
    "Voor elk veld dat je invult (niet null), schrijf je een 'reasoning'-sleutel "
    "met een korte citerende toelichting (max 80 tekens, Nederlands) over wat de patiënt zei.\n"
    "\n"
    "Geef ALLEEN een JSON-object terug, geen uitleg buiten het object.\n"
    "\n"
    "Schema:\n"
    '{\n'
    '  "dyspnea":    0|1|2|3|null,\n'
    '  "edema":      0|1|2|3|null,\n'
    '  "fatigue":    0|1|2|3|null,\n'
    '  "medication": 0|1|2|3|null,\n'
    '  "weight_kg":  float|null,\n'
    '  "reasoning": {\n'
    '    "dyspnea":    "...",\n'
    '    "weight_kg":  "..."\n'
    '  }\n'
    '}\n'
    "\n"
    "Voorbeelden:\n"
    '"ik ben erg benauwd na het traplopen" → dyspnea: 2, reasoning: {"dyspnea": "erg benauwd na traplopen"}\n'
    '"mijn gewicht is 79.5 kg" → weight_kg: 79.5, reasoning: {"weight_kg": "79.5 kg gemeld"}\n'
    '"ik heb mijn medicijnen genomen" → medication: 0, reasoning: {"medication": "medicatie genomen zoals voorgeschreven"}\n'
    '"hoe gaat het met Anna" → alle velden null, reasoning: {}'
)


def _parse_json(raw: str) -> dict | None:
    """Parse JSON from LLM output; tolerate surrounding text or markdown fences."""
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
    """Coerce a JSON value to a valid 0–3 score or None."""
    if value is None:
        return None
    try:
        v = int(value)  # type: ignore[arg-type]
        return v if 0 <= v <= 3 else None
    except (TypeError, ValueError):
        return None


async def extract_and_store_symptoms(
    session_id: str,
    patient_id: str,
    transcript: str,
) -> None:
    """Extract symptom scores from a transcript and persist one row per session.

    Designed to run as a BackgroundTask — never raises, logs errors instead.
    """
    try:
        langfuse = get_langfuse()
        llm = get_llm_provider()

        with propagate_attributes(
            user_id=patient_id,
            session_id=session_id,
            trace_name="symptom-extraction",
        ):
            raw = await llm.chat(
                messages=[{"role": "user", "content": f"Gesprek:\n\n{transcript}"}],
                system=_EXTRACT_SYSTEM,
            )

        result = _parse_json(raw)
        if not result:
            logger.warning(
                "symptom_extraction: kon geen JSON parsen voor session=%s, raw=%r",
                session_id, raw[:200],
            )
            return

        # Build reasoning dict — only include keys that have a non-null score or weight
        raw_reasoning: dict = result.get("reasoning") or {}
        reasoning: dict[str, str] = {
            k: str(v) for k, v in raw_reasoning.items() if v
        }

        # ISO week of the current moment (extraction time)
        now = datetime.now(timezone.utc)
        iso = now.isocalendar()

        observation = SymptomObservation(
            id=uuid.uuid4(),
            patient_id=uuid.UUID(patient_id),
            session_id=uuid.UUID(session_id),
            week_number=iso.week,
            year=iso.year,
            dyspnea=_safe_score(result.get("dyspnea")),
            edema=_safe_score(result.get("edema")),
            fatigue=_safe_score(result.get("fatigue")),
            medication=_safe_score(result.get("medication")),
            weight_kg=float(result["weight_kg"]) if result.get("weight_kg") is not None else None,
            reasoning=reasoning,
            extracted_by="llm",
        )

        db = SessionLocal()
        try:
            # UPSERT: merge on session_id unique constraint
            db.merge(observation)
            db.commit()
            logger.info(
                "symptom_extraction: opgeslagen voor session=%s week=%d-%d",
                session_id, iso.year, iso.week,
            )
        finally:
            db.close()

        langfuse.flush()

    except Exception:
        logger.exception("symptom_extraction: mislukt voor session=%s", session_id)
