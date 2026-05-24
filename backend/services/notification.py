"""Escalation notifications via Twilio SMS."""

import logging
import os
import uuid

from sqlalchemy.orm import joinedload
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from models.escalation import Escalation
from services.database import SessionLocal

logger = logging.getLogger(__name__)

_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
_FROM = os.getenv("TWILIO_FROM")
_TO = os.getenv("NOTIFICATION_PHONE")


_SMS_MAX_LEN = 160  # GSM-7 single segment limit for Twilio trial


def _build_sms(patient_name: str, urgency: str, reason: str) -> str:
    """Build SMS text, truncated to fit Twilio trial single-segment limit."""
    tag = "URGENT" if urgency == "high" else "Let op"
    # Extract just the patient message from the reason if present
    # Format: "Laag X (...) · Patiëntbericht: «msg» · detail"
    short_reason = reason
    if "Patiëntbericht:" in reason and "»" in reason:
        start = reason.find("«") + 1
        end = reason.find("»")
        if start > 0 and end > start:
            short_reason = reason[start:end]
    # Build compact message
    body = f"[Anna] {tag}\n{patient_name}\n{short_reason}"
    if len(body) > _SMS_MAX_LEN:
        body = body[: _SMS_MAX_LEN - 1] + "…"
    return body


def send_sms_notification(escalation_id: uuid.UUID) -> None:
    """Send an SMS for the given escalation and update notification_status.

    Runs as a FastAPI BackgroundTask — uses its own DB session.
    Silently skipped if Twilio is not configured or disabled.
    """
    if not all([_ACCOUNT_SID, _AUTH_TOKEN, _FROM, _TO]):
        logger.info(
            "Twilio niet geconfigureerd — SMS overgeslagen voor escalatie %s", escalation_id
        )
        return

    db = SessionLocal()
    try:
        from models.setting import Setting

        sms_setting = db.query(Setting).filter(Setting.key == "twilio_sms_enabled").first()
        if sms_setting and sms_setting.value != "true":
            logger.info(
                "Twilio SMS uitgeschakeld — SMS overgeslagen voor escalatie %s", escalation_id
            )
            return

        # Bepaal ontvangernummer: DB-waarde heeft prioriteit over env var
        to_setting = db.query(Setting).filter(Setting.key == "twilio_to").first()
        effective_to = (to_setting.value if to_setting and to_setting.value else None) or _TO

        escalation = (
            db.query(Escalation)
            .options(joinedload(Escalation.patient))
            .filter(Escalation.id == escalation_id)
            .first()
        )
        if not escalation:
            logger.warning("Escalatie %s niet gevonden voor SMS", escalation_id)
            return

        patient_name = f"{escalation.patient.first_name} {escalation.patient.last_name}"
        sms_body = _build_sms(patient_name, escalation.urgency, escalation.reason)

        client = Client(_ACCOUNT_SID, _AUTH_TOKEN)
        client.messages.create(body=sms_body, from_=_FROM, to=effective_to)

        escalation.notification_status = "sent"
        db.commit()
        logger.info("SMS verstuurd voor escalatie %s naar %s", escalation_id, effective_to)

    except TwilioRestException as exc:
        logger.warning("Twilio-fout voor escalatie %s: %s", escalation_id, exc)
        try:
            escalation.notification_status = "failed"
            db.commit()
        except Exception:
            pass
    except Exception as exc:
        logger.warning("Onverwachte fout bij SMS voor escalatie %s: %s", escalation_id, exc)
    finally:
        db.close()
