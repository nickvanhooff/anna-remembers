# Settings-pagina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistente app-instellingen in PostgreSQL met een settings-pagina in het dashboard waarmee Twilio SMS aan/uit gezet kan worden zonder herstart.

**Architecture:** Een `settings` tabel (key-value) in PostgreSQL, beheerd via Alembic-migratie en een nieuw `/settings` FastAPI router. De notificatieservice leest de instelling live uit de DB. Het frontend krijgt een settings-pagina via de bestaande Settings-knop in de sidebar.

**Tech Stack:** Python/FastAPI/SQLAlchemy, Alembic, Next.js 15 App Router, shadcn Switch/Card, TypeScript

---

## Bestandsoverzicht

| Bestand | Actie | Verantwoordelijkheid |
|---|---|---|
| `backend/models/setting.py` | Nieuw | `Setting` SQLAlchemy model |
| `backend/schemas/setting.py` | Nieuw | Pydantic schemas voor GET/PUT |
| `backend/alembic/versions/0004_add_settings_table.py` | Nieuw | Migratie + seed `twilio_sms_enabled=true` |
| `backend/routers/settings.py` | Nieuw | GET `/settings` + PUT `/settings/{key}` |
| `backend/main.py` | Wijziging | Settings router registreren |
| `backend/services/notification.py` | Wijziging | DB-check: sla SMS over als instelling false is |
| `backend/tests/test_settings.py` | Nieuw | Unit tests voor settings router + notification check |
| `frontend/Anna-remembers/types/index.ts` | Wijziging | `Settings` type toevoegen |
| `frontend/Anna-remembers/lib/api.ts` | Wijziging | `getSettings()` + `updateSetting()` |
| `frontend/Anna-remembers/components/settings/settings-screen.tsx` | Nieuw | Client component met Switch toggle |
| `frontend/Anna-remembers/app/(dashboard)/settings/page.tsx` | Nieuw | Server page component |
| `frontend/Anna-remembers/components/dashboard/dashboard-sidebar.tsx` | Wijziging | Settings-knop linken aan `/settings` |

---

## Task 1: Backend model, schema en Alembic-migratie

**Files:**
- Create: `backend/models/setting.py`
- Create: `backend/schemas/setting.py`
- Create: `backend/alembic/versions/0004_add_settings_table.py`

- [ ] **Stap 1: Maak het SQLAlchemy model aan**

Maak `backend/models/setting.py`:

```python
"""Setting model — slaat app-instellingen op als key-value paren."""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(500), nullable=False)
```

- [ ] **Stap 2: Maak de Pydantic schemas aan**

Maak `backend/schemas/setting.py`:

```python
"""Pydantic schemas voor de settings API."""

from pydantic import BaseModel


class SettingUpdate(BaseModel):
    value: str


class SettingResponse(BaseModel):
    key: str
    value: str

    model_config = {"from_attributes": True}
```

- [ ] **Stap 3: Maak de Alembic-migratie aan**

Maak `backend/alembic/versions/0004_add_settings_table.py`:

```python
"""add settings table

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.String(500), nullable=False),
    )
    op.execute("INSERT INTO settings (key, value) VALUES ('twilio_sms_enabled', 'true')")


def downgrade() -> None:
    op.drop_table("settings")
```

- [ ] **Stap 4: Draai de migratie**

```bash
docker compose exec backend alembic upgrade head
```

Verwacht output bevat: `Running upgrade 0003 -> 0004`

- [ ] **Stap 5: Controleer de tabel**

```bash
docker compose exec postgres psql -U anna -d anna_remembers -c "SELECT * FROM settings;"
```

Verwacht:
```
        key         | value
--------------------+-------
 twilio_sms_enabled | true
```

- [ ] **Stap 6: Commit**

```bash
git add backend/models/setting.py backend/schemas/setting.py backend/alembic/versions/0004_add_settings_table.py
git commit -m "feat: add settings table with Alembic migration and seed"
```

---

## Task 2: Settings router + registratie in main.py

**Files:**
- Create: `backend/routers/settings.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_settings.py`

- [ ] **Stap 1: Schrijf falende tests**

Maak `backend/tests/test_settings.py`:

```python
"""Tests voor backend/routers/settings.py"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from models.setting import Setting

client = TestClient(app)


def _mock_db_with_setting(key: str, value: str):
    mock_db = MagicMock()
    mock_setting = Setting(key=key, value=value)
    mock_db.query.return_value.all.return_value = [mock_setting]
    mock_db.query.return_value.filter.return_value.first.return_value = mock_setting
    return mock_db


class TestGetSettings:
    def test_returns_all_settings_as_dict(self):
        mock_db = _mock_db_with_setting("twilio_sms_enabled", "true")
        with patch("routers.settings.get_db", return_value=iter([mock_db])):
            response = client.get("/settings")
        assert response.status_code == 200
        assert response.json() == {"twilio_sms_enabled": "true"}


class TestPutSetting:
    def test_updates_existing_setting(self):
        mock_setting = Setting(key="twilio_sms_enabled", value="true")
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_setting
        with patch("routers.settings.get_db", return_value=iter([mock_db])):
            response = client.put(
                "/settings/twilio_sms_enabled",
                json={"value": "false"},
            )
        assert response.status_code == 200
        assert response.json()["value"] == "false"
        assert mock_setting.value == "false"
        mock_db.commit.assert_called_once()

    def test_returns_404_for_unknown_key(self):
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None
        with patch("routers.settings.get_db", return_value=iter([mock_db])):
            response = client.put("/settings/onbekende_key", json={"value": "x"})
        assert response.status_code == 404
```

- [ ] **Stap 2: Draai tests — verwacht ImportError**

```bash
cd backend && python -m pytest tests/test_settings.py -v 2>&1 | head -20
```

Verwacht: `ModuleNotFoundError: No module named 'routers.settings'`

- [ ] **Stap 3: Maak de router aan**

Maak `backend/routers/settings.py`:

```python
"""Settings router — lees en wijzig app-instellingen."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.setting import Setting
from schemas.setting import SettingResponse, SettingUpdate
from services.database import get_db

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/", response_model=dict[str, str])
def get_settings(db: Session = Depends(get_db)) -> dict[str, str]:
    """Geeft alle instellingen terug als key-value dict."""
    rows = db.query(Setting).all()
    return {row.key: row.value for row in rows}


@router.put("/{key}", response_model=SettingResponse)
def update_setting(
    key: str,
    body: SettingUpdate,
    db: Session = Depends(get_db),
) -> SettingResponse:
    """Wijzig een bestaande instelling. Geeft 404 als de key niet bestaat."""
    setting = db.query(Setting).filter(Setting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Instelling '{key}' niet gevonden")
    setting.value = body.value
    db.commit()
    db.refresh(setting)
    return SettingResponse.model_validate(setting)
```

- [ ] **Stap 4: Registreer de router in main.py**

Vervang de imports en `include_router` regels in `backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import chat, escalations, patients, settings, tts

app = FastAPI(
    title="Anna Remembers API",
    description="Backend API for the Anna Remembers health assistant",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients.router)
app.include_router(chat.router)
app.include_router(escalations.router)
app.include_router(tts.router)
app.include_router(settings.router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check — confirms the backend is reachable."""
    return {"status": "ok"}
```

- [ ] **Stap 5: Draai tests — verwacht PASS**

```bash
cd backend && python -m pytest tests/test_settings.py -v
```

Verwacht: 3 passed

- [ ] **Stap 6: Controleer de endpoints live**

```bash
curl http://localhost:8000/settings
```

Verwacht: `{"twilio_sms_enabled":"true"}`

- [ ] **Stap 7: Commit**

```bash
git add backend/routers/settings.py backend/main.py backend/tests/test_settings.py
git commit -m "feat: add settings router with GET and PUT endpoints"
```

---

## Task 3: Notificatieservice controleert de DB-instelling

**Files:**
- Modify: `backend/services/notification.py`
- Modify: `backend/tests/test_notification.py`

De huidige `send_sms_notification` stuurt altijd een SMS als Twilio geconfigureerd is. Nu moet hij eerst de `twilio_sms_enabled` instelling opvragen.

- [ ] **Stap 1: Voeg een falende test toe aan test_notification.py**

Voeg deze testklasse toe onderaan `backend/tests/test_notification.py`:

```python
class TestSmsDisabledSetting:
    def test_skips_sms_when_setting_is_false(self, caplog):
        """Als twilio_sms_enabled=false, geen SMS ondanks geldige config."""
        import logging
        from models.setting import Setting

        mock_setting = MagicMock(spec=Setting)
        mock_setting.value = "false"

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_setting,  # eerste call: setting query
        ]

        with patch("services.notification._ACCOUNT_SID", "ACtest"):
            with patch("services.notification._AUTH_TOKEN", "token"):
                with patch("services.notification._FROM", "+15550000000"):
                    with patch("services.notification._TO", "+31600000000"):
                        with patch("services.notification.SessionLocal", return_value=mock_db):
                            with caplog.at_level(logging.INFO, logger="services.notification"):
                                send_sms_notification(uuid.uuid4())

        assert "uitgeschakeld" in caplog.text
```

- [ ] **Stap 2: Draai de nieuwe test — verwacht FAIL**

```bash
cd backend && python -m pytest tests/test_notification.py::TestSmsDisabledSetting -v
```

Verwacht: FAILED — "uitgeschakeld" not in log

- [ ] **Stap 3: Pas notification.py aan**

Vervang de volledige `send_sms_notification` functie in `backend/services/notification.py`:

```python
def send_sms_notification(escalation_id: uuid.UUID) -> None:
    """Verstuur een SMS voor de opgegeven escalatie en werk notification_status bij.

    Draait als FastAPI BackgroundTask — gebruikt een eigen DB-sessie.
    Stil overgeslagen als Twilio niet geconfigureerd of uitgeschakeld is.
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

- [ ] **Stap 4: Draai alle notification-tests — verwacht 9 PASSED**

```bash
cd backend && python -m pytest tests/test_notification.py -v
```

Verwacht: 9 passed (de 8 bestaande + 1 nieuwe)

- [ ] **Stap 5: Commit**

```bash
git add backend/services/notification.py backend/tests/test_notification.py
git commit -m "feat: skip SMS when twilio_sms_enabled setting is false"
```

---

## Task 4: Frontend types en API-client

**Files:**
- Modify: `frontend/Anna-remembers/types/index.ts`
- Modify: `frontend/Anna-remembers/lib/api.ts`

- [x] **Stap 1: Voeg het Settings type toe aan types/index.ts**

Voeg toe onderaan `frontend/Anna-remembers/types/index.ts`:

```typescript
export interface Settings {
  twilio_sms_enabled: "true" | "false"
}
```

- [x] **Stap 2: Voeg API-functies toe aan lib/api.ts**

Zoek in `frontend/Anna-remembers/lib/api.ts` naar de laatste exporteerde functie en voeg daarna toe:

```typescript
export async function getSettings(): Promise<Settings> {
  return get<Settings>("/settings")
}

export async function updateSetting(key: keyof Settings, value: string): Promise<void> {
  await put<{ key: string; value: string }>(`/settings/${key}`, { value })
}
```

Zorg dat `Settings` geïmporteerd wordt bovenaan het bestand. Voeg toe bij de imports:

```typescript
import type { Settings } from "@/types"
```

Zorg ook dat er een `put` helper bestaat. Als die nog niet bestaat, voeg dan toe in het helpers-blok van api.ts:

```typescript
async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}
```

- [x] **Stap 3: TypeScript check**

```bash
cd frontend/Anna-remembers && npx tsc --noEmit 2>&1 | head -20
```

Verwacht: geen output (geen fouten) — Pre-existing `three` library type errors zijn geen blocker.

- [x] **Stap 4: Commit**

```bash
git add frontend/Anna-remembers/types/index.ts frontend/Anna-remembers/lib/api.ts
git commit -m "feat: add settings types and API client functions"
```

---

## Task 5: Settings-pagina en sidebar-link

**Files:**
- Create: `frontend/Anna-remembers/components/settings/settings-screen.tsx`
- Create: `frontend/Anna-remembers/app/(dashboard)/settings/page.tsx`
- Modify: `frontend/Anna-remembers/components/dashboard/dashboard-sidebar.tsx`

- [x] **Stap 1: Maak het settings screen component aan**

Maak `frontend/Anna-remembers/components/settings/settings-screen.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { Settings2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSettings, updateSetting } from "@/lib/api"
import type { Settings } from "@/types"

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => setError("Instellingen konden niet worden geladen"))
  }, [])

  async function toggleTwilio(enabled: boolean) {
    if (!settings) return
    const newValue = enabled ? "true" : "false"
    setSettings({ ...settings, twilio_sms_enabled: newValue as "true" | "false" })
    try {
      await updateSetting("twilio_sms_enabled", newValue)
    } catch {
      setSettings(settings)
      setError("Instelling kon niet worden opgeslagen")
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2.5 mb-6">
        <Settings2 className="size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Instellingen</h1>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notificaties</CardTitle>
          <CardDescription>Beheer hoe escalaties worden doorgegeven aan zorgverleners</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Twilio SMS</p>
              <p className="text-xs text-muted-foreground">Stuur automatisch SMS bij escalaties</p>
            </div>
            <Switch
              checked={settings?.twilio_sms_enabled === "true"}
              onCheckedChange={toggleTwilio}
              disabled={settings === null}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [x] **Stap 2: Maak de page component aan**

Maak `frontend/Anna-remembers/app/(dashboard)/settings/page.tsx`:

```tsx
import { SettingsScreen } from "@/components/settings/settings-screen"

export const metadata = { title: "Instellingen — Anna Remembers" }

export default function SettingsPage() {
  return <SettingsScreen />
}
```

- [x] **Stap 3: Link de Settings-knop in de sidebar**

In `frontend/Anna-remembers/components/dashboard/dashboard-sidebar.tsx`, vervang de Settings `SidebarMenuButton` in de `SidebarFooter`:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton asChild tooltip="Instellingen" isActive={pathname === "/settings"}>
    <Link href="/settings">
      <Settings />
      <span>Instellingen</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

Voeg `Link` toe aan de imports als dat nog niet aanwezig is (staat al bovenaan: `import Link from "next/link"`).

- [x] **Stap 4: TypeScript check**

```bash
cd frontend/Anna-remembers && npx tsc --noEmit 2>&1 | head -20
```

Verwacht: geen output — Pre-existing `three` library type errors zijn geen blocker.

- [ ] **Stap 5: Open de pagina in de browser**

Ga naar `http://localhost:3001/settings`

Verwacht:
- Pagina laadt met "Instellingen" header
- Sectie "Notificaties" met toggle voor Twilio SMS
- Toggle staat aan (want seed was `true`)
- Klik toggle → zet uit → backend ontvangt `PUT /settings/twilio_sms_enabled {"value":"false"}`
- Klik opnieuw → zet aan

- [ ] **Stap 6: Commit**

```bash
git add frontend/Anna-remembers/components/settings/settings-screen.tsx frontend/Anna-remembers/app/(dashboard)/settings/page.tsx frontend/Anna-remembers/components/dashboard/dashboard-sidebar.tsx
git commit -m "feat: add settings page with Twilio SMS toggle"
```
