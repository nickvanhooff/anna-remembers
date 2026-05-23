# Escalatie SMS-notificatie via Twilio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stuur automatisch een SMS via Twilio wanneer een escalatie wordt aangemaakt, met onderscheid in berichttoon tussen "aandacht" (low/medium) en "urgent" (high). De `notification_status` in de DB wordt bijgewerkt naar `"sent"` of `"failed"`.

**Architecture:** De `POST /escalations/` router slaat de escalatie op en retourneert direct een response. Daarna wordt een FastAPI `BackgroundTask` getriggerd die de Twilio SMS verstuurt en de `notification_status` bijwerkt in een eigen DB-sessie. Dit is hetzelfde patroon als `trigger_summary_update` in `backend/routers/chat/_summary.py`.

**Tech Stack:** Python, FastAPI BackgroundTasks, Twilio Python SDK (`twilio`), SQLAlchemy, pytest + unittest.mock

---

## Bestandsoverzicht

| Bestand | Actie | Verantwoordelijkheid |
|---|---|---|
| `backend/services/notification.py` | Aanmaken | SMS bouwen en versturen via Twilio, DB-status bijwerken |
| `backend/routers/escalations.py` | Wijzigen | `BackgroundTasks` injecteren, taak registreren na commit |
| `backend/requirements.txt` | Wijzigen | `twilio` toevoegen |
| `.env.example` | Wijzigen | Twilio-variabelen documenteren |
| `backend/tests/test_notification.py` | Aanmaken | Unit tests voor `_build_sms` en `send_sms_notification` |

---

## Task 1: Twilio dependency toevoegen

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `.env.example`

- [ ] **Stap 1: Voeg twilio toe aan requirements.txt**

Open `backend/requirements.txt` en voeg toe onderaan:
```
twilio>=9.0.0
```

- [ ] **Stap 2: Voeg Twilio-variabelen toe aan .env.example**

Open `.env.example` en voeg toe onderaan:
```env
# --- Twilio SMS (escalatienotificaties) ---
# Account SID en Auth Token via console.twilio.com
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Twilio-nummer dat je in de console hebt geactiveerd
TWILIO_FROM=+15551234567
# Mobiel nummer dat je als "Verified Caller ID" hebt toegevoegd
NOTIFICATION_PHONE=+31612345678
```

- [ ] **Stap 3: Installeer twilio lokaal**

```bash
pip install twilio>=9.0.0
```

Verwacht: `Successfully installed twilio-...`

- [ ] **Stap 4: Commit**

```bash
git add backend/requirements.txt .env.example
git commit -m "chore: add twilio dependency and env vars for SMS notifications"
```

---

## Task 2: Notificatieservice aanmaken

**Files:**
- Create: `backend/services/notification.py`
- Create: `backend/tests/test_notification.py`

- [ ] **Stap 1: Schrijf de falende tests**

Maak `backend/tests/__init__.py` aan (leeg) en maak `backend/tests/test_notification.py` aan:

```python
"""Tests voor backend/services/notification.py"""
import uuid
from unittest.mock import MagicMock, patch

import pytest

from services.notification import _build_sms, send_sms_notification


class TestBuildSms:
    def test_high_urgency_prefix(self):
        result = _build_sms("Jan de Vries", "high", "Ernstige benauwdheid")
        assert result.startswith("[Anna Remembers] URGENT")

    def test_medium_urgency_prefix(self):
        result = _build_sms("Jan de Vries", "medium", "Lichte klachten")
        assert result.startswith("[Anna Remembers] Aandacht vereist")

    def test_low_urgency_prefix(self):
        result = _build_sms("Jan de Vries", "low", "Lichte klachten")
        assert result.startswith("[Anna Remembers] Aandacht vereist")

    def test_contains_patient_name(self):
        result = _build_sms("Maria Jansen", "high", "Test reden")
        assert "Maria Jansen" in result

    def test_contains_reason(self):
        result = _build_sms("Jan de Vries", "high", "Kortademigheid toegenomen")
        assert "Kortademigheid toegenomen" in result


class TestSendSmsNotification:
    def test_skips_when_not_configured(self, caplog):
        """Geen Twilio-config = stil overslaan, geen crash."""
        import logging
        with patch.dict("os.environ", {}, clear=True):
            # Reload env vars door de module opnieuw te patchen
            with patch("services.notification._ACCOUNT_SID", None):
                with patch("services.notification._AUTH_TOKEN", None):
                    with patch("services.notification._FROM", None):
                        with patch("services.notification._TO", None):
                            with caplog.at_level(logging.INFO, logger="services.notification"):
                                send_sms_notification(uuid.uuid4())
        assert "niet geconfigureerd" in caplog.text

    def test_sends_sms_and_updates_status_to_sent(self):
        """Succesvolle SMS → notification_status = 'sent'."""
        escalation_id = uuid.uuid4()

        mock_patient = MagicMock()
        mock_patient.first_name = "Jan"
        mock_patient.last_name = "de Vries"

        mock_escalation = MagicMock()
        mock_escalation.urgency = "high"
        mock_escalation.reason = "Ernstige benauwdheid"
        mock_escalation.patient = mock_patient

        mock_db = MagicMock()
        mock_db.query.return_value.options.return_value.filter.return_value.first.return_value = mock_escalation

        mock_twilio_client = MagicMock()

        with patch("services.notification._ACCOUNT_SID", "ACtest"):
            with patch("services.notification._AUTH_TOKEN", "token"):
                with patch("services.notification._FROM", "+15550000000"):
                    with patch("services.notification._TO", "+31600000000"):
                        with patch("services.notification.SessionLocal", return_value=mock_db):
                            with patch("services.notification.Client", return_value=mock_twilio_client):
                                send_sms_notification(escalation_id)

        mock_twilio_client.messages.create.assert_called_once()
        call_kwargs = mock_twilio_client.messages.create.call_args.kwargs
        assert "URGENT" in call_kwargs["body"]
        assert mock_escalation.notification_status == "sent"
        mock_db.commit.assert_called()

    def test_sets_failed_on_twilio_error(self):
        """Twilio-fout → notification_status = 'failed', geen crash."""
        from twilio.base.exceptions import TwilioRestException

        escalation_id = uuid.uuid4()

        mock_patient = MagicMock()
        mock_patient.first_name = "Jan"
        mock_patient.last_name = "de Vries"

        mock_escalation = MagicMock()
        mock_escalation.urgency = "medium"
        mock_escalation.reason = "Lichte klachten"
        mock_escalation.patient = mock_patient

        mock_db = MagicMock()
        mock_db.query.return_value.options.return_value.filter.return_value.first.return_value = mock_escalation

        mock_twilio_client = MagicMock()
        mock_twilio_client.messages.create.side_effect = TwilioRestException(
            status=400, uri="/Messages", msg="Test error"
        )

        with patch("services.notification._ACCOUNT_SID", "ACtest"):
            with patch("services.notification._AUTH_TOKEN", "token"):
                with patch("services.notification._FROM", "+15550000000"):
                    with patch("services.notification._TO", "+31600000000"):
                        with patch("services.notification.SessionLocal", return_value=mock_db):
                            with patch("services.notification.Client", return_value=mock_twilio_client):
                                send_sms_notification(escalation_id)

        assert mock_escalation.notification_status == "failed"
```

- [ ] **Stap 2: Draai tests — verwacht ImportError (module bestaat nog niet)**

```bash
cd backend && python -m pytest tests/test_notification.py -v 2>&1 | head -20
```

Verwacht: `ModuleNotFoundError: No module named 'services.notification'`

- [ ] **Stap 3: Maak backend/services/notification.py aan**

```python
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
```

- [ ] **Stap 4: Draai tests — verwacht PASS**

```bash
cd backend && python -m pytest tests/test_notification.py -v
```

Verwacht:
```
tests/test_notification.py::TestBuildSms::test_high_urgency_prefix PASSED
tests/test_notification.py::TestBuildSms::test_medium_urgency_prefix PASSED
tests/test_notification.py::TestBuildSms::test_low_urgency_prefix PASSED
tests/test_notification.py::TestBuildSms::test_contains_patient_name PASSED
tests/test_notification.py::TestBuildSms::test_contains_reason PASSED
tests/test_notification.py::TestSendSmsNotification::test_skips_when_not_configured PASSED
tests/test_notification.py::TestSendSmsNotification::test_sends_sms_and_updates_status_to_sent PASSED
tests/test_notification.py::TestSendSmsNotification::test_sets_failed_on_twilio_error PASSED
8 passed
```

- [ ] **Stap 5: Commit**

```bash
git add backend/services/notification.py backend/tests/__init__.py backend/tests/test_notification.py
git commit -m "feat: add Twilio SMS notification service for escalations"
```

---

## Task 3: Router koppelen aan notificatieservice

**Files:**
- Modify: `backend/routers/escalations.py`

De huidige signatuur van `create_escalation` is:
```python
def create_escalation(body: EscalationCreate, db: Session = Depends(get_db)) -> EscalationResponse:
```

- [ ] **Stap 1: Voeg BackgroundTasks toe aan de import en de functiesignatuur**

Vervang de imports bovenaan `backend/routers/escalations.py`:
```python
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from models.escalation import Escalation
from schemas.escalation import EscalationCreate, EscalationResponse, EscalationStatusUpdate
from services.database import get_db
from services.notification import send_sms_notification
```

- [ ] **Stap 2: Voeg BackgroundTasks toe aan create_escalation en registreer de taak**

Vervang de volledige `create_escalation` functie:
```python
@router.post("/", response_model=EscalationResponse, status_code=201)
def create_escalation(
    body: EscalationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> EscalationResponse:
    """Store an escalation. Called by the MCP server tool escalate_to_human."""
    if body.urgency not in _VALID_URGENCY:
        raise HTTPException(status_code=422, detail=f"urgency moet een van {_VALID_URGENCY} zijn")

    escalation = Escalation(
        patient_id=body.patient_id,
        session_id=body.session_id,
        reason=body.reason,
        urgency=body.urgency,
        status="open",
        notification_status="pending",
    )
    db.add(escalation)
    db.commit()
    db.refresh(escalation)
    db.refresh(escalation, ["patient"])

    background_tasks.add_task(send_sms_notification, escalation.id)

    return _to_response(escalation)
```

- [ ] **Stap 3: Controleer of de backend nog opstart**

```bash
cd backend && python -c "from routers.escalations import router; print('OK')"
```

Verwacht: `OK`

- [ ] **Stap 4: Commit**

```bash
git add backend/routers/escalations.py
git commit -m "feat: trigger SMS notification as background task on escalation create"
```

---

## Task 4: Handmatige end-to-end test

**Vereisten:** Twilio-account klaar, `.env` ingevuld met echte waarden, Docker Compose draaiend.

- [ ] **Stap 1: Vul .env in met echte Twilio-waarden**

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM=+1xxxxxxxxxx
NOTIFICATION_PHONE=+316xxxxxxxx
```

- [ ] **Stap 2: Herstart de backend**

```bash
docker compose up backend --build -d
```

- [ ] **Stap 3: Stuur een test-escalatie via de API**

Vervang `<patient_id>` door een bestaand UUID uit de DB (te vinden via `GET /patients/`):

```bash
curl -X POST http://localhost:8000/escalations/ \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "<patient_id>",
    "reason": "Patiënt meldt ernstige benauwdheid en duizeligheid.",
    "urgency": "high"
  }'
```

Verwacht: HTTP 201, response bevat `"notification_status": "pending"` (BackgroundTask nog bezig).

- [ ] **Stap 4: Controleer of SMS is aangekomen**

Wacht ~5 seconden. Check je telefoon — je zou een SMS moeten ontvangen:
```
[Anna Remembers] URGENT
Patiënt: [naam]
Urgentie: High
Reden: Patiënt meldt ernstige benauwdheid en duizeligheid.
```

- [ ] **Stap 5: Controleer notification_status in de DB**

```bash
curl http://localhost:8000/escalations/
```

De meest recente escalatie moet `"notification_status": "sent"` tonen.

- [ ] **Stap 6: Controleer de backend logs op fouten**

```bash
docker compose logs backend --tail=20
```

Verwacht: `INFO ... SMS verstuurd voor escalatie ... naar +316...`
Geen `WARNING` regels.
