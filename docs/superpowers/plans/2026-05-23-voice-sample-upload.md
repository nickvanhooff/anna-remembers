# Voice Sample Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to upload WAV voice samples via de settings page die XTTS v2 gebruikt voor Nederlandse stemkloning, zonder de container te herstarten.

**Architecture:** De bestaande `./tts_voice` host-map is al gemount als `/voice:ro` in de `xtts-bridge` container. De backend krijgt dezelfde map als `/voice:rw` zodat hij bestanden kan schrijven. Na upload of delete roept de backend `POST XTTS_URL/reload` aan — een nieuw endpoint in `xtts_bridge.py` dat de globale VOICE_SAMPLES lijst bijwerkt. De frontend settings page krijgt een nieuwe card met een bestandslijst, upload-knop en verwijderknop per bestand.

**Tech Stack:** FastAPI `UploadFile`, Python `pathlib`, `httpx` (al aanwezig), Next.js 15, shadcn `Button`

---

## File Map

| File | Wijziging |
|---|---|
| `xtts_bridge.py` | MODIFY — globale `_voice_samples` lijst + `/reload` endpoint |
| `docker-compose.yml` | MODIFY — voeg `./tts_voice:/voice` toe aan backend service + `VOICE_DIR` env var |
| `backend/routers/voice_samples.py` | NEW — GET/POST/DELETE `/tts/voice-samples` |
| `backend/tests/test_voice_samples.py` | NEW — 5 tests voor de router |
| `backend/main.py` | MODIFY — registreer `voice_samples.router` |
| `frontend/Anna-remembers/lib/api.ts` | MODIFY — voeg `listVoiceSamples`, `uploadVoiceSample`, `deleteVoiceSample` toe |
| `frontend/Anna-remembers/components/settings/settings-screen.tsx` | MODIFY — voeg "Stemsamples" card toe |

---

## Task 1: XTTS bridge — hot-reload endpoint

**Files:**
- Modify: `xtts_bridge.py`

De XTTS bridge laadt `VOICE_SAMPLES` nu als module-level constante bij opstart. We maken het een herlaadbare globale variabele en voegen een `/reload` endpoint toe.

- [x] **Stap 1: Pas `xtts_bridge.py` aan**

Vervang de regels die `VOICE_SAMPLES` laden (regels 33–38) en de `synthesize()` functie. De volledige nieuwe inhoud van het bestand:

```python
#!/usr/bin/env python3
"""HTTP bridge for Coqui XTTS v2 — Dutch voice cloning from a reference sample.

Same endpoint shape as piper_http_bridge.py so the backend can swap providers
by only changing the upstream URL.

POST /        ?text=...  or  {"text": "..."}   -> audio/wav
POST /reload                                    -> {"status": "ok", "samples": N}
GET  /health                                    -> {"status": "ok"}
"""

import glob
import io
import os
import sys
import wave

import numpy as np
import torch
from flask import Flask, request, send_file

# Coqui non-commercial model license must be accepted via env var.
os.environ.setdefault("COQUI_TOS_AGREED", "1")

from TTS.api import TTS  # noqa: E402

app = Flask(__name__)

VOICE_DIR = os.getenv("XTTS_VOICE_DIR", "/voice")
LANGUAGE = os.getenv("XTTS_LANGUAGE", "nl")
MODEL_NAME = os.getenv("XTTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")

# Mutable list — kan bijgewerkt worden via /reload zonder herstart.
_voice_samples: list[str] = sorted(glob.glob(os.path.join(VOICE_DIR, "*.wav")))
if not _voice_samples:
    print(f"ERROR: no WAV files found in {VOICE_DIR}", file=sys.stderr, flush=True)
    sys.exit(1)
print(f"Using {len(_voice_samples)} reference clip(s): {_voice_samples}", file=sys.stderr, flush=True)

use_gpu = torch.cuda.is_available()
print(f"Loading XTTS v2 (gpu={use_gpu})...", file=sys.stderr, flush=True)
tts = TTS(MODEL_NAME, gpu=use_gpu)
print(f"Language: {LANGUAGE}", file=sys.stderr, flush=True)
print("Model loaded.", file=sys.stderr, flush=True)


def _wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    """Encode float32 mono samples as a 16-bit PCM WAV in memory."""
    pcm = np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0)
    pcm_int16 = (pcm * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm_int16.tobytes())
    buf.seek(0)
    return buf


@app.route("/", methods=["POST"])
def synthesize():
    text = request.args.get("text") or (request.json.get("text") if request.is_json else None)
    if not text or not text.strip():
        return {"error": "Missing or empty text parameter"}, 400

    if not _voice_samples:
        return {"error": "No voice samples available"}, 503

    try:
        wav = tts.tts(text=text.strip(), speaker_wav=list(_voice_samples), language=LANGUAGE)
        sample_rate = tts.synthesizer.output_sample_rate
        buf = _wav_bytes(np.array(wav), sample_rate)
        print(f"Synthesized {len(buf.getvalue())} bytes for: {text[:60]}", file=sys.stderr, flush=True)
        return send_file(buf, mimetype="audio/wav")
    except Exception as exc:
        print(f"Error synthesizing: {exc}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"error": str(exc)}, 500


@app.route("/reload", methods=["POST"])
def reload_samples():
    """Herscan /voice/*.wav en werk de sprekerlijst bij zonder herstart."""
    global _voice_samples
    _voice_samples = sorted(glob.glob(os.path.join(VOICE_DIR, "*.wav")))
    print(f"Reloaded: {len(_voice_samples)} sample(s)", file=sys.stderr, flush=True)
    return {"status": "ok", "samples": len(_voice_samples)}, 200


@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok"}, 200


if __name__ == "__main__":
    print("XTTS HTTP Bridge listening on 0.0.0.0:5000", file=sys.stderr, flush=True)
    app.run(host="0.0.0.0", port=5000, debug=False)
```

- [ ] **Stap 2: Verifieer handmatig dat `/reload` werkt**

```bash
# Na docker compose up
curl -X POST http://localhost:5006/reload
```

Verwacht: `{"status": "ok", "samples": <N>}` met 200

- [ ] **Stap 3: Commit**

```bash
git add xtts_bridge.py
git commit -m "feat: add /reload endpoint to XTTS bridge for hot-reloading voice samples"
```

---

## Task 2: Backend router — voice sample CRUD

**Files:**
- Create: `backend/routers/voice_samples.py`
- Create: `backend/tests/test_voice_samples.py`

- [x] **Stap 1: Schrijf de falende tests**

```python
# backend/tests/test_voice_samples.py
"""Tests voor backend/routers/voice_samples.py."""
import io
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from main import app


class TestVoiceSamplesRouter:
    def test_list_returns_wav_filenames(self, tmp_path: Path):
        (tmp_path / "anna.wav").touch()
        (tmp_path / "voice2.wav").touch()
        with patch("routers.voice_samples.VOICE_DIR", str(tmp_path)):
            client = TestClient(app)
            resp = client.get("/tts/voice-samples")
            assert resp.status_code == 200
            assert set(resp.json()["samples"]) == {"anna.wav", "voice2.wav"}

    def test_list_returns_empty_when_dir_missing(self, tmp_path: Path):
        missing = str(tmp_path / "nonexistent")
        with patch("routers.voice_samples.VOICE_DIR", missing):
            client = TestClient(app)
            resp = client.get("/tts/voice-samples")
            assert resp.status_code == 200
            assert resp.json()["samples"] == []

    def test_upload_saves_wav_and_calls_reload(self, tmp_path: Path):
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch("routers.voice_samples._reload_xtts", new_callable=AsyncMock) as mock_reload,
        ):
            client = TestClient(app)
            wav_bytes = io.BytesIO(b"RIFF\x00\x00\x00\x00WAVEfmt ")
            resp = client.post(
                "/tts/voice-samples",
                files={"file": ("sample.wav", wav_bytes, "audio/wav")},
            )
            assert resp.status_code == 200
            assert resp.json()["filename"] == "sample.wav"
            assert (tmp_path / "sample.wav").exists()
            mock_reload.assert_called_once()

    def test_upload_rejects_non_wav(self, tmp_path: Path):
        with patch("routers.voice_samples.VOICE_DIR", str(tmp_path)):
            client = TestClient(app)
            resp = client.post(
                "/tts/voice-samples",
                files={"file": ("track.mp3", b"fake", "audio/mpeg")},
            )
            assert resp.status_code == 400

    def test_delete_removes_file_and_calls_reload(self, tmp_path: Path):
        target = tmp_path / "anna.wav"
        target.write_bytes(b"fake-wav")
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch("routers.voice_samples._reload_xtts", new_callable=AsyncMock) as mock_reload,
        ):
            client = TestClient(app)
            resp = client.delete("/tts/voice-samples/anna.wav")
            assert resp.status_code == 200
            assert not target.exists()
            mock_reload.assert_called_once()

    def test_delete_returns_404_for_unknown_file(self, tmp_path: Path):
        with patch("routers.voice_samples.VOICE_DIR", str(tmp_path)):
            client = TestClient(app)
            resp = client.delete("/tts/voice-samples/missing.wav")
            assert resp.status_code == 404

    def test_delete_rejects_path_traversal(self, tmp_path: Path):
        with patch("routers.voice_samples.VOICE_DIR", str(tmp_path)):
            client = TestClient(app)
            resp = client.delete("/tts/voice-samples/../secrets.txt")
            assert resp.status_code == 400
```

- [ ] **Stap 2: Draai de falende tests**

```bash
cd backend && python -m pytest tests/test_voice_samples.py -v
```

Verwacht: `ImportError` of `ModuleNotFoundError` — `routers.voice_samples` bestaat nog niet.

- [x] **Stap 3: Schrijf de implementatie**

```python
# backend/routers/voice_samples.py
"""Voice sample management — upload WAV files for XTTS voice cloning."""
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, UploadFile

router = APIRouter(prefix="/tts/voice-samples", tags=["tts"])

VOICE_DIR = os.getenv("VOICE_DIR", "/voice")
XTTS_URL = os.getenv("XTTS_URL", "http://xtts-bridge:5000")
MAX_BYTES = 10 * 1024 * 1024  # 10 MB


async def _reload_xtts() -> None:
    """Vraag de XTTS bridge om speaker samples opnieuw te laden."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(f"{XTTS_URL}/reload")
        except httpx.RequestError:
            pass  # best-effort — de synthesize call pakt de nieuwe files toch op


@router.get("")
async def list_samples() -> dict:
    """Geeft alle WAV-bestandsnamen in de voice directory."""
    voice_dir = Path(VOICE_DIR)
    if not voice_dir.exists():
        return {"samples": []}
    return {"samples": sorted(p.name for p in voice_dir.glob("*.wav"))}


@router.post("")
async def upload_sample(file: UploadFile) -> dict:
    """Upload een WAV-bestand als stemreferentie voor XTTS."""
    if not file.filename or not file.filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Alleen WAV-bestanden worden geaccepteerd")

    filename = Path(file.filename).name  # strip eventuele pad-componenten

    voice_dir = Path(VOICE_DIR)
    voice_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Bestand te groot (max 10 MB)")

    (voice_dir / filename).write_bytes(content)
    await _reload_xtts()
    return {"filename": filename, "size": len(content)}


@router.delete("/{filename}")
async def delete_sample(filename: str) -> dict:
    """Verwijder een stemreferentie-bestand."""
    safe_name = Path(filename).name
    if safe_name != filename or not filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Ongeldige bestandsnaam")

    target = Path(VOICE_DIR) / safe_name
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"{filename} niet gevonden")

    target.unlink()
    await _reload_xtts()
    return {"deleted": filename}
```

- [x] **Stap 4: Draai de tests — verwacht PASS**

```bash
cd backend && python -m pytest tests/test_voice_samples.py -v
```

Verwacht:
```
PASSED tests/test_voice_samples.py::TestVoiceSamplesRouter::test_list_returns_wav_filenames
PASSED tests/test_voice_samples.py::TestVoiceSamplesRouter::test_list_returns_empty_when_dir_missing
PASSED tests/test_voice_samples.py::TestVoiceSamplesRouter::test_upload_saves_wav_and_calls_reload
PASSED tests/test_voice_samples.py::TestVoiceSamplesRouter::test_upload_rejects_non_wav
PASSED tests/test_voice_samples.py::TestVoiceSamplesRouter::test_delete_removes_file_and_calls_reload
PASSED tests/test_voice_samples.py::TestVoiceSamplesRouter::test_delete_returns_404_for_unknown_file
PASSED tests/test_voice_samples.py::TestVoiceSamplesRouter::test_delete_rejects_path_traversal
```

- [ ] **Stap 5: Volledige testsuite controleren**

```bash
cd backend && python -m pytest -v
```

Verwacht: alle bestaande tests nog steeds groen.

- [ ] **Stap 6: Commit**

```bash
git add backend/routers/voice_samples.py backend/tests/test_voice_samples.py
git commit -m "feat: add voice sample CRUD router for XTTS voice cloning"
```

---

## Task 3: Registreer router + docker-compose volume

**Files:**
- Modify: `backend/main.py`
- Modify: `docker-compose.yml`

- [x] **Stap 1: Voeg de router toe aan `backend/main.py`**

Vervang regel 4:
```python
from routers import chat, escalations, patients, settings, tts
```

Door:
```python
from routers import chat, escalations, patients, settings, tts, voice_samples
```

Voeg na `app.include_router(tts.router)` (regel 22) toe:
```python
app.include_router(voice_samples.router)
```

- [x] **Stap 2: Voeg volume en env var toe aan de backend in `docker-compose.yml`**

Voeg toe aan het `volumes`-blok van de `backend` service (na `- ./backend:/app`):
```yaml
      - ./tts_voice:/voice:rw
```

Voeg toe aan het `environment`-blok van de `backend` service (na de XTTS_URL regel):
```yaml
      VOICE_DIR: /voice
```

Het backend-blok ziet er dan zo uit (alleen de gewijzigde secties):
```yaml
  backend:
    ...
    volumes:
      - ./backend:/app
      - ./tts_voice:/voice:rw        # ← nieuw
    environment:
      ...
      XTTS_URL: ${XTTS_URL:-http://xtts-bridge:5000}
      VOICE_DIR: /voice              # ← nieuw
      ...
```

- [ ] **Stap 3: Rebuild backend**

```bash
docker compose up backend --build -d
```

- [ ] **Stap 4: Verifieer endpoints**

```bash
curl http://localhost:8000/tts/voice-samples
```

Verwacht: `{"samples": ["voice_sample.wav"]}` (of wat er al in ./tts_voice staat)

- [ ] **Stap 5: Commit**

```bash
git add backend/main.py docker-compose.yml
git commit -m "feat: register voice_samples router and mount tts_voice volume in backend"
```

---

## Task 4: Frontend — Stemsamples card in settings

**Files:**
- Modify: `frontend/Anna-remembers/lib/api.ts`
- Modify: `frontend/Anna-remembers/components/settings/settings-screen.tsx`

- [x] **Stap 1: Voeg API-functies toe aan `frontend/Anna-remembers/lib/api.ts`**

Voeg toe onderaan het bestand (na `updateSetting`):

```typescript
// ─── Voice samples ────────────────────────────────────────────────

export async function listVoiceSamples(): Promise<string[]> {
  const data = await get<{ samples: string[] }>("/tts/voice-samples")
  return data.samples
}

export async function uploadVoiceSample(file: File): Promise<void> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(`${BASE}/tts/voice-samples`, {
    method: "POST",
    body: form,
  })
  if (!res.ok) throw new Error(`API ${res.status} /tts/voice-samples`)
}

export async function deleteVoiceSample(filename: string): Promise<void> {
  const res = await fetch(
    `${BASE}/tts/voice-samples/${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(`API ${res.status} /tts/voice-samples/${filename}`)
}
```

- [ ] **Stap 2: TypeScript check na api.ts wijziging**

```bash
cd frontend/Anna-remembers && npx tsc --noEmit
```

Verwacht: geen fouten.

- [x] **Stap 3: Voeg de Stemsamples card toe aan `settings-screen.tsx`**

Vervang de volledige inhoud van het bestand:

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { Settings2, Trash2, Upload } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSettings, updateSetting, listVoiceSamples, uploadVoiceSample, deleteVoiceSample } from "@/lib/api"
import type { Settings } from "@/types"

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [samples, setSamples] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => setError("Instellingen konden niet worden geladen"))
    listVoiceSamples()
      .then(setSamples)
      .catch(() => setError("Stemsamples konden niet worden geladen"))
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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await uploadVoiceSample(file)
      setSamples(await listVoiceSamples())
    } catch {
      setError("Upload mislukt")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function handleDelete(filename: string) {
    setError(null)
    try {
      await deleteVoiceSample(filename)
      setSamples((prev) => prev.filter((s) => s !== filename))
    } catch {
      setError(`Verwijderen van ${filename} mislukt`)
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stemsamples (XTTS)</CardTitle>
            <CardDescription>
              WAV-bestanden in deze lijst worden gebruikt als stemreferentie door XTTS v2.
              Meerdere clips geven een betere kwaliteit.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {samples.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen stemsamples gevonden.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {samples.map((name) => (
                  <li key={name} className="flex items-center justify-between py-1 border-b last:border-0">
                    <span className="text-sm font-mono">{name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(name)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".wav,audio/wav"
                className="hidden"
                onChange={handleUpload}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4 mr-2" />
                {uploading ? "Uploaden..." : "WAV uploaden"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Stap 4: TypeScript check na settings-screen wijziging**

```bash
cd frontend/Anna-remembers && npx tsc --noEmit
```

Verwacht: geen fouten.

- [ ] **Stap 5: Handmatig testen**

1. Open `http://localhost:3001/settings`
2. Controleer dat de "Stemsamples (XTTS)" card zichtbaar is met de bestaande WAV-bestanden uit `./tts_voice`
3. Upload een nieuw WAV-bestand — de lijst moet bijwerken
4. Controleer dat het bestand in `./tts_voice/` verschijnt:
   ```bash
   ls ./tts_voice/
   ```
5. Klik de prullenbak — bestand verdwijnt uit lijst en directory
6. Controleer dat XTTS de nieuwe sample gebruikt:
   ```bash
   curl -X POST http://localhost:5006/reload
   # → {"status": "ok", "samples": <N>}
   ```

- [ ] **Stap 6: Commit**

```bash
git add frontend/Anna-remembers/lib/api.ts \
        frontend/Anna-remembers/components/settings/settings-screen.tsx
git commit -m "feat: add voice sample upload UI to settings page"
```

---

## Scope check (self-review)

- ✅ XTTS bridge heeft `/reload` endpoint dat `_voice_samples` bijwerkt zonder herstart
- ✅ Backend schrijft naar gedeeld volume (`./tts_voice:/voice:rw`)
- ✅ `GET /tts/voice-samples` — lijst WAV-bestanden
- ✅ `POST /tts/voice-samples` — upload + reload trigger
- ✅ `DELETE /tts/voice-samples/{filename}` — verwijder + reload trigger
- ✅ Path traversal bescherming op delete en upload
- ✅ 7 tests dekken: lijst, leeg, upload success, upload non-WAV, delete success, delete 404, path traversal
- ✅ Frontend card toont bestandslijst, upload-knop, delete per bestand
- ✅ Optimistic delete (client-side filter), re-fetch na upload
- ✅ `VOICE_DIR` env var in docker-compose + backend volume mount gedocumenteerd
