# SMS-ontvanger instellen via settings pagina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het telefoonnummer dat escalatie-SMS-berichten ontvangt instelbaar maken via de settings pagina, persistent opgeslagen in de `settings` DB-tabel.

**Architecture:** Nieuwe Alembic-migratie voegt `twilio_to` toe aan de `settings` tabel (seed = lege string). `notification.py` leest `twilio_to` uit de DB en valt terug op de `NOTIFICATION_PHONE` env var als de DB-waarde leeg is. De settings-pagina krijgt een tekstveld met een expliciete "Opslaan" knop (geen optimistic update — telefoonnummers vereisen bewuste bevestiging).

**Tech Stack:** Python/FastAPI/SQLAlchemy/Alembic (backend), Next.js 15/TypeScript/shadcn (frontend), bestaande `GET /settings` + `PUT /settings/{key}` endpoints

---

## File Map

| File | Wijziging |
|---|---|
| `backend/alembic/versions/0006_add_twilio_to_setting.py` | NEW — migratie die `twilio_to` seed met lege string |
| `backend/services/notification.py` | MODIFY — leest `twilio_to` uit DB, fallback op `_TO` env var |
| `backend/tests/test_notification.py` | MODIFY — nieuwe test voor DB-to-override + bestaande tests aanpassen |
| `frontend/Anna-remembers/types/index.ts` | MODIFY — `twilio_to: string` toevoegen aan `Settings` interface |
| `frontend/Anna-remembers/components/settings/settings-screen.tsx` | MODIFY — tekstveld + "Opslaan" knop toevoegen |

---

## Task 1: Alembic-migratie voor `twilio_to` setting

**Files:**
- Create: `backend/alembic/versions/0006_add_twilio_to_setting.py`

- [ ] **Stap 1: Maak de migratie aan**

```python
# backend/alembic/versions/0006_add_twilio_to_setting.py
"""add twilio_to setting

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-24
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("INSERT INTO settings (key, value) VALUES ('twilio_to', '')")


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key = 'twilio_to'")
```

- [ ] **Stap 2: Draai de migratie**

```bash
docker compose exec backend alembic upgrade head
```

Verwacht output: `Running upgrade 0005 -> 0006, add twilio_to setting`

- [ ] **Stap 3: Verifieer**

```bash
docker compose exec postgres psql -U anna -d anna_remembers -c "SELECT * FROM settings;"
```

Verwacht: rij `twilio_to | ` (lege waarde) zichtbaar naast de andere settings.

- [ ] **Stap 4: Commit**

```bash
git add backend/alembic/versions/0006_add_twilio_to_setting.py
git commit -m "feat: add twilio_to setting via Alembic migration 0006"
```

---

## Task 2: `notification.py` leest `twilio_to` uit DB

**Files:**
- Modify: `backend/services/notification.py`
- Modify: `backend/tests/test_notification.py`

### Logica

`send_sms_notification` leest na de `twilio_sms_enabled` check ook `twilio_to` uit de DB. Als de DB-waarde niet leeg is, wordt die gebruikt als ontvangernummer. Anders valt het terug op `_TO` (de `NOTIFICATION_PHONE` env var).

### Tests eerst (TDD)

- [ ] **Stap 1: Schrijf de nieuwe test in `test_notification.py`**

Voeg toe aan de bestaande `TestSendSmsNotification` klasse (na de bestaande tests):

```python
def test_uses_db_twilio_to_when_set(self):
    """Als twilio_to in DB non-leeg is, wordt dat nummer gebruikt i.p.v. _TO env var."""
    from models.setting import Setting

    escalation_id = uuid.uuid4()

    mock_patient = MagicMock()
    mock_patient.first_name = "Jan"
    mock_patient.last_name = "de Vries"

    mock_escalation = MagicMock()
    mock_escalation.urgency = "high"
    mock_escalation.reason = "Ernstige benauwdheid"
    mock_escalation.patient = mock_patient

    mock_sms_enabled = MagicMock(spec=Setting)
    mock_sms_enabled.value = "true"

    mock_twilio_to = MagicMock(spec=Setting)
    mock_twilio_to.value = "+31699999999"

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.side_effect = [
        mock_sms_enabled,   # twilio_sms_enabled
        mock_twilio_to,     # twilio_to
    ]
    mock_db.query.return_value.options.return_value.filter.return_value.first.return_value = mock_escalation

    mock_twilio_client = MagicMock()

    with patch("services.notification._ACCOUNT_SID", "ACtest"):
        with patch("services.notification._AUTH_TOKEN", "token"):
            with patch("services.notification._FROM", "+15550000000"):
                with patch("services.notification._TO", "+31600000000"):  # env var (mag niet gebruikt worden)
                    with patch("services.notification.SessionLocal", return_value=mock_db):
                        with patch("services.notification.Client", return_value=mock_twilio_client):
                            send_sms_notification(escalation_id)

    call_kwargs = mock_twilio_client.messages.create.call_args.kwargs
    assert call_kwargs["to"] == "+31699999999"  # DB-waarde gebruikt, niet env var


def test_falls_back_to_env_when_db_twilio_to_empty(self):
    """Als twilio_to in DB leeg is, wordt _TO env var gebruikt."""
    from models.setting import Setting

    escalation_id = uuid.uuid4()

    mock_patient = MagicMock()
    mock_patient.first_name = "Jan"
    mock_patient.last_name = "de Vries"

    mock_escalation = MagicMock()
    mock_escalation.urgency = "high"
    mock_escalation.reason = "Ernstige benauwdheid"
    mock_escalation.patient = mock_patient

    mock_sms_enabled = MagicMock(spec=Setting)
    mock_sms_enabled.value = "true"

    mock_twilio_to = MagicMock(spec=Setting)
    mock_twilio_to.value = ""  # lege DB-waarde

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.side_effect = [
        mock_sms_enabled,
        mock_twilio_to,
    ]
    mock_db.query.return_value.options.return_value.filter.return_value.first.return_value = mock_escalation

    mock_twilio_client = MagicMock()

    with patch("services.notification._ACCOUNT_SID", "ACtest"):
        with patch("services.notification._AUTH_TOKEN", "token"):
            with patch("services.notification._FROM", "+15550000000"):
                with patch("services.notification._TO", "+31600000000"):  # env var (moet gebruikt worden)
                    with patch("services.notification.SessionLocal", return_value=mock_db):
                        with patch("services.notification.Client", return_value=mock_twilio_client):
                            send_sms_notification(escalation_id)

    call_kwargs = mock_twilio_client.messages.create.call_args.kwargs
    assert call_kwargs["to"] == "+31600000000"  # env var gebruikt
```

- [ ] **Stap 2: Draai de nieuwe tests — verwacht FAIL**

```bash
docker compose exec backend pytest tests/test_notification.py::TestSendSmsNotification::test_uses_db_twilio_to_when_set tests/test_notification.py::TestSendSmsNotification::test_falls_back_to_env_when_db_twilio_to_empty -v
```

Verwacht: 2 FAILED (de logica bestaat nog niet)

- [ ] **Stap 3: Pas `notification.py` aan**

Voeg na de `twilio_sms_enabled` check (regel ~64) de volgende logica toe, en vervang de `to=_TO` in de `client.messages.create()` aanroep:

```python
        # Bepaal ontvangernummer: DB-waarde heeft prioriteit over env var
        to_setting = db.query(Setting).filter(Setting.key == "twilio_to").first()
        effective_to = (to_setting.value if to_setting and to_setting.value else None) or _TO
```

En vervang in `client.messages.create(...)`:
```python
        # VOOR:
        client.messages.create(body=sms_body, from_=_FROM, to=_TO)
        # NA:
        client.messages.create(body=sms_body, from_=_FROM, to=effective_to)
```

En vervang in de log-regel:
```python
        # VOOR:
        logger.info("SMS verstuurd voor escalatie %s naar %s", escalation_id, _TO)
        # NA:
        logger.info("SMS verstuurd voor escalatie %s naar %s", escalation_id, effective_to)
```

De volledige `send_sms_notification` functie ziet er na de aanpassing zo uit:

```python
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
```

- [ ] **Stap 4: Bestaande tests aanpassen**

De bestaande tests in `TestSendSmsNotification` (`test_sends_sms_and_updates_status_to_sent` en `test_sets_failed_on_twilio_error`) mocken nu twee queries via `side_effect`. Er komt een derde query bij (`twilio_to`). Pas de `side_effect` lijsten aan:

In `test_sends_sms_and_updates_status_to_sent`:
```python
        mock_twilio_to = MagicMock(spec=Setting)
        mock_twilio_to.value = ""  # leeg → fallback naar _TO env var

        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_setting,       # twilio_sms_enabled
            mock_twilio_to,     # twilio_to (nieuw)
        ]
```

In `test_sets_failed_on_twilio_error`:
```python
        mock_twilio_to = MagicMock(spec=Setting)
        mock_twilio_to.value = ""

        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_setting,       # twilio_sms_enabled
            mock_twilio_to,     # twilio_to (nieuw)
        ]
```

- [ ] **Stap 5: Draai alle notification tests**

```bash
docker compose exec backend pytest tests/test_notification.py -v
```

Verwacht: alle tests PASS (was 9, nu 11)

- [ ] **Stap 6: Commit**

```bash
git add backend/services/notification.py backend/tests/test_notification.py
git commit -m "feat: read twilio_to recipient from DB with env var fallback"
```

---

## Task 3: Frontend — `Settings` type en settings-screen

**Files:**
- Modify: `frontend/Anna-remembers/types/index.ts`
- Modify: `frontend/Anna-remembers/components/settings/settings-screen.tsx`

### Types

- [ ] **Stap 1: Voeg `twilio_to` toe aan `Settings` interface in `types/index.ts`**

```typescript
export interface Settings {
  twilio_sms_enabled: "true" | "false"
  tts_provider: "piper" | "xtts"
  twilio_to: string
}
```

### Settings screen

De settings-screen krijgt een tekstveld voor het telefoonnummer in de bestaande "Notificaties" card, onder de Twilio SMS toggle. Er is een expliciete "Opslaan" knop (geen optimistic update bij tekstvelden — de gebruiker typt en bevestigt bewust).

- [ ] **Stap 2: Pas `settings-screen.tsx` aan**

Voeg toe aan de imports (bovenaan, in de bestaande import-blokken):
```tsx
import { Input } from "@/components/ui/input"
```

Voeg toe aan de state-declaraties (na `const [uploading, setUploading] = useState(false)`):
```tsx
  const [twilioTo, setTwilioTo] = useState("")
  const [twilioToSaving, setTwilioToSaving] = useState(false)
```

Pas de bestaande `useEffect` aan zodat `twilio_to` geladen wordt:
```tsx
  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s)
        setTwilioTo(s.twilio_to ?? "")
      })
      .catch(() => setError("Instellingen konden niet worden geladen"))
    listVoiceSamples()
      .then(setSamples)
      .catch(() => setError("Stemsamples konden niet worden geladen"))
  }, [])
```

Voeg de save-handler toe (na de bestaande `handleDelete` functie):
```tsx
  async function saveTwilioTo() {
    setTwilioToSaving(true)
    setError(null)
    try {
      await updateSetting("twilio_to", twilioTo)
    } catch {
      setError("Telefoonnummer kon niet worden opgeslagen")
    } finally {
      setTwilioToSaving(false)
    }
  }
```

Voeg het tekstveld toe in de "Notificaties" card, direct onder de Twilio SMS toggle rij (na de `</div>` van de switch-rij):
```tsx
            <div className="flex items-end gap-2 pt-2">
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">SMS-ontvanger</p>
                <Input
                  type="tel"
                  placeholder="+31612345678"
                  value={twilioTo}
                  onChange={(e) => setTwilioTo(e.target.value)}
                  disabled={twilioToSaving}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Internationaal formaat, bijv. +31612345678
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={saveTwilioTo}
                disabled={twilioToSaving}
              >
                {twilioToSaving ? "Opslaan..." : "Opslaan"}
              </Button>
            </div>
```

- [ ] **Stap 3: Controleer of `Input` shadcn component beschikbaar is**

```bash
ls frontend/Anna-remembers/components/ui/input.tsx
```

Als het bestand niet bestaat, installeer het:
```bash
cd frontend/Anna-remembers && npx shadcn@latest add input
```

- [ ] **Stap 4: TypeScript check**

```bash
cd frontend/Anna-remembers && npx tsc --noEmit
```

Verwacht: geen nieuwe fouten (pre-existing avatar.tsx Three.js errors zijn irrelevant).

- [ ] **Stap 5: Commit**

```bash
git add frontend/Anna-remembers/types/index.ts frontend/Anna-remembers/components/settings/settings-screen.tsx
git commit -m "feat: add SMS recipient text field to settings screen"
```

---

## Scope check (self-review)

- ✅ `twilio_to` persistent opgeslagen in DB via migratie 0006
- ✅ `notification.py` gebruikt DB-waarde als die niet leeg is, anders env var
- ✅ Bestaande `NOTIFICATION_PHONE` env var werkt nog steeds als fallback
- ✅ 2 nieuwe tests (DB-override + lege-DB fallback), bestaande tests blijven groen
- ✅ Frontend toont huidig nummer (geladen via `getSettings()`)
- ✅ Expliciete "Opslaan" knop — geen onbedoelde wijzigingen bij typen
- ✅ Geen validatie van telefoonnummerformaat (buiten scope per issue)
- ✅ `Settings` type uitgebreid met `twilio_to: string`
