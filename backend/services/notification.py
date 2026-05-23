"""Escalatienotificaties via Twilio SMS."""

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


def _build_sms(patient_name: str, urgency: str, reason: str) -> str:
    """Bouw de SMS-tekst op basis van urgentieniveau."""
    if urgency == "high":
        prefix = "[Anna Remembers] URGENT"
    else:
        prefix = "[Anna Remembers] Aandacht vereist"
    return f"{prefix}\nPatiënt: {patient_name}\nUrgentie: {urgency.capitalize()}\nReden: {reason}"


def send_sms_notification(escalation_id: uuid.UUID) -> None:
    """Verstuur een SMS voor de opgegeven escalatie en werk notification_status bij.

    Draait als FastAPI BackgroundTask — gebruikt een eigen DB-sessie.
    Stil overgeslagen als Twilio niet geconfigureerd is.
    """
    if not all([_ACCOUNT_SID, _AUTH_TOKEN, _FROM, _TO]):
        logger.info(
            "Twilio niet geconfigureerd — SMS overgeslagen voor escalatie %s", escalation_id
        )
        return

    db = SessionLocal()
    try:
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
        client.messages.create(body=sms_body, from_=_FROM, to=_TO)

        escalation.notification_status = "sent"
        db.commit()
        logger.info("SMS verstuurd voor escalatie %s naar %s", escalation_id, _TO)

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
