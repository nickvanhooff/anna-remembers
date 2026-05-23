# TTS Provider Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `tts_provider` setting (piper | xtts) that persists in the DB and is switchable via the settings page, so the backend routes TTS requests to the correct service without a restart.

**Architecture:** A new `tts_provider` row in the existing `settings` table drives which URL the TTS router calls. The router reads this setting via DB dependency and passes the provider to the synthesize service. The frontend settings page shows a Select (same pattern as the Twilio toggle).

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, httpx, Next.js 15, shadcn Select

---

## File Map

| File | Change |
|---|---|
| `backend/alembic/versions/0005_add_tts_provider_setting.py` | NEW — seeds `tts_provider=xtts` |
| `backend/services/tts.py` | MODIFY — accepts `provider` param, maps to correct URL |
| `backend/routers/tts.py` | MODIFY — reads `tts_provider` from DB, passes to service |
| `backend/tests/test_tts.py` | NEW — router routes to correct service per setting |
| `frontend/Anna-remembers/types/index.ts` | MODIFY — add `tts_provider` to Settings type |
| `frontend/Anna-remembers/components/settings/settings-screen.tsx` | MODIFY — add Select for provider |

---

## Task 1: Alembic migratie — seed `tts_provider`

**Files:**
- Create: `backend/alembic/versions/0005_add_tts_provider_setting.py`

- [x] **Stap 1: Schrijf de migratie**

```python
# backend/alembic/versions/0005_add_tts_provider_setting.py
"""add tts_provider setting

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-23
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("INSERT INTO settings (key, value) VALUES ('tts_provider', 'xtts')")


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key = 'tts_provider'")
```

- [ ] **Stap 2: Migratie draaien in Docker**

```bash
docker compose exec backend alembic upgrade head
```

Verwacht: `Running upgrade 0004 -> 0005, add tts_provider setting`

Controleer:
```bash
docker compose exec postgres psql -U anna -d anna_remembers -c "SELECT * FROM settings;"
```
Verwacht: twee rijen — `twilio_sms_enabled | true` en `tts_provider | xtts`

- [ ] **Stap 3: Commit**

```bash
git add backend/alembic/versions/0005_add_tts_provider_setting.py
git commit -m "feat: seed tts_provider setting in DB"
```

---

## Task 2: Backend service + router aanpassen

**Files:**
- Modify: `backend/services/tts.py`
- Modify: `backend/routers/tts.py`
- Create: `backend/tests/test_tts.py`

- [x] **Stap 1: Schrijf de falende test**

```python
# backend/tests/test_tts.py
"""Tests voor backend/routers/tts.py — provider-routing."""
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from main import app
from models.setting import Setting
from services.database import get_db


def _db_with_provider(provider: str):
    mock_db = MagicMock()
    mock_setting = Setting(key="tts_provider", value=provider)
    mock_db.query.return_value.filter.return_value.first.return_value = mock_setting
    return mock_db


class TestTTSProviderRouting:
    def test_routes_to_piper_when_setting_is_piper(self):
        app.dependency_overrides[get_db] = lambda: _db_with_provider("piper")
        with patch("routers.tts.synthesize", new_callable=AsyncMock) as mock_synth:
            mock_synth.return_value = b"fake-wav"
            client = TestClient(app)
            try:
                response = client.post("/tts", json={"text": "hallo"})
                assert response.status_code == 200
                mock_synth.assert_called_once_with("hallo", "piper")
            finally:
                app.dependency_overrides.clear()

    def test_routes_to_xtts_when_setting_is_xtts(self):
        app.dependency_overrides[get_db] = lambda: _db_with_provider("xtts")
        with patch("routers.tts.synthesize", new_callable=AsyncMock) as mock_synth:
            mock_synth.return_value = b"fake-wav"
            client = TestClient(app)
            try:
                response = client.post("/tts", json={"text": "hallo"})
                assert response.status_code == 200
                mock_synth.assert_called_once_with("hallo", "xtts")
            finally:
                app.dependency_overrides.clear()

    def test_falls_back_to_xtts_when_setting_missing(self):
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None
        app.dependency_overrides[get_db] = lambda: mock_db
        with patch("routers.tts.synthesize", new_callable=AsyncMock) as mock_synth:
            mock_synth.return_value = b"fake-wav"
            client = TestClient(app)
            try:
                response = client.post("/tts", json={"text": "hallo"})
                assert response.status_code == 200
                mock_synth.assert_called_once_with("hallo", "xtts")
            finally:
                app.dependency_overrides.clear()
```

- [x] **Stap 2: Test draaien — verwacht FAIL**

```bash
cd backend && python -m pytest tests/test_tts.py -v
```

Verwacht: `FAILED — synthesize() takes 1 positional argument but 2 were given` (of vergelijkbaar)

- [x] **Stap 3: Pas `backend/services/tts.py` aan**

Vervang de volledige inhoud van het bestand:

```python
"""HTTP client voor Piper en XTTS TTS-containers."""
import os

import httpx
from fastapi import HTTPException

PIPER_URL = os.getenv("PIPER_URL", "http://piper-http-bridge:5000")
XTTS_URL = os.getenv("XTTS_URL", "http://xtts-bridge:5000")
TIMEOUT_SECONDS = float(os.getenv("TTS_TIMEOUT_SECONDS", "60"))

_PROVIDER_URLS: dict[str, str] = {
    "piper": PIPER_URL,
    "xtts": XTTS_URL,
}


async def synthesize(text: str, provider: str = "xtts") -> bytes:
    """Stuur tekst naar de TTS-service en geef WAV-bytes terug.

    provider moet 'piper' of 'xtts' zijn. Onbekende waarden vallen terug op xtts.
    """
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="text mag niet leeg zijn")

    url = _PROVIDER_URLS.get(provider, XTTS_URL)

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        try:
            response = await client.post(url, params={"text": text})
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail=f"{provider} timeout")
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"{provider} niet bereikbaar: {exc}",
            )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"{provider} gaf status {response.status_code} terug",
        )

    return response.content
```

- [x] **Stap 4: Pas `backend/routers/tts.py` aan**

```python
"""TTS router — proxies text-to-speech requests naar Piper of XTTS."""
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from models.setting import Setting
from schemas.tts import TTSRequest
from services.database import get_db
from services.tts import synthesize

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("", response_class=Response)
async def text_to_speech(
    req: TTSRequest,
    db: Session = Depends(get_db),
) -> Response:
    """Synthetiseer Nederlandse spraak via de geconfigureerde TTS-provider."""
    setting = db.query(Setting).filter(Setting.key == "tts_provider").first()
    provider = setting.value if setting else "xtts"
    audio = await synthesize(req.text, provider)
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )
```

- [x] **Stap 5: Test draaien — verwacht PASS**

```bash
cd backend && python -m pytest tests/test_tts.py -v
```

Verwacht:
```
PASSED tests/test_tts.py::TestTTSProviderRouting::test_routes_to_piper_when_setting_is_piper
PASSED tests/test_tts.py::TestTTSProviderRouting::test_routes_to_xtts_when_setting_is_xtts
PASSED tests/test_tts.py::TestTTSProviderRouting::test_falls_back_to_xtts_when_setting_missing
```

- [ ] **Stap 6: Volledige testsuite controleren**

```bash
cd backend && python -m pytest -v
```

Verwacht: alle bestaande tests nog steeds groen.

- [ ] **Stap 7: Commit**

```bash
git add backend/services/tts.py backend/routers/tts.py backend/tests/test_tts.py
git commit -m "feat: route TTS requests based on tts_provider DB setting"
```

---

## Task 3: Frontend — provider select in instellingenpagina

**Files:**
- Modify: `frontend/Anna-remembers/types/index.ts` (regel 81–82)
- Modify: `frontend/Anna-remembers/components/settings/settings-screen.tsx`

- [x] **Stap 1: Voeg `tts_provider` toe aan het Settings type**

Open `frontend/Anna-remembers/types/index.ts`. Vervang de `Settings` interface (huidig op regel 80–82):

```typescript
export interface Settings {
  twilio_sms_enabled: "true" | "false"
  tts_provider: "piper" | "xtts"
}
```

- [x] **Stap 2: Vervang de volledige inhoud van `settings-screen.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import { Settings2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

  async function changeTtsProvider(provider: "piper" | "xtts") {
    if (!settings) return
    setSettings({ ...settings, tts_provider: provider })
    try {
      await updateSetting("tts_provider", provider)
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

      <div className="flex flex-col gap-4">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stem (TTS)</CardTitle>
            <CardDescription>Kies welke Text-to-Speech service Anna gebruikt</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">TTS Provider</p>
                <p className="text-xs text-muted-foreground">
                  Piper: snel, offline &nbsp;·&nbsp; XTTS: stemkloning, vereist GPU
                </p>
              </div>
              <Select
                value={settings?.tts_provider ?? "xtts"}
                onValueChange={(v) => changeTtsProvider(v as "piper" | "xtts")}
                disabled={settings === null}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xtts">XTTS v2</SelectItem>
                  <SelectItem value="piper">Piper</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [x] **Stap 3: TypeScript check**

```bash
cd frontend/Anna-remembers && npx tsc --noEmit
```

Verwacht: geen fouten.

- [ ] **Stap 4: Backend rebuilden met nieuwe env vars**

Voeg toe aan `.env` (als nog niet aanwezig):
```
PIPER_URL=http://piper-http-bridge:5000
XTTS_URL=http://xtts-bridge:5000
```

Rebuild:
```bash
docker compose up backend --build -d
```

- [ ] **Stap 5: Handmatig testen**

1. Open de instellingenpagina op `http://localhost:3001/settings`
2. Controleer dat de TTS-card zichtbaar is met de Select op "XTTS v2"
3. Wissel naar "Piper" — geen foutmelding
4. Controleer in de DB:
   ```bash
   docker compose exec postgres psql -U anna -d anna_remembers -c "SELECT * FROM settings;"
   ```
   Verwacht: `tts_provider | piper`
5. Stuur een chatbericht en controleer dat audio terugkomt (Piper is sneller dan XTTS)

- [ ] **Stap 6: Commit**

```bash
git add frontend/Anna-remembers/types/index.ts \
        frontend/Anna-remembers/components/settings/settings-screen.tsx
git commit -m "feat: add TTS provider select to settings page"
```

---

## Scope check (self-review)

- ✅ Migration seeds `tts_provider=xtts`
- ✅ Service accepts `provider` param, maps to correct URL
- ✅ Router reads setting from DB, falls back to `xtts`
- ✅ 3 tests cover piper / xtts / missing setting
- ✅ Frontend type extended, select renders with optimistic update
- ✅ `.env` vars for both URLs documented
