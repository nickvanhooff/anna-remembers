# FFmpeg Audio Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laat de backend elk audioformaat (MP3, M4A, OGG, WebM, FLAC, AAC) omzetten naar 22050 Hz mono WAV via ffmpeg voordat het opgeslagen wordt als stemreferentie voor XTTS.

**Architecture:** Een nieuwe `services/audio_converter.py` bevat alle ffmpeg-logica en is los testbaar. De bestaande `routers/voice_samples.py` roept de converter aan vóór het opslaan — de router hoeft niets te weten over ffmpeg. De Dockerfile krijgt één extra `apt-get`-regel voor het ffmpeg-pakket. De frontend krijgt een ruimere `accept`-lijst zodat gebruikers elk audioformaat kunnen kiezen.

**Tech Stack:** Python `subprocess`, `tempfile`, `pathlib`; ffmpeg (systeempakket); FastAPI `UploadFile` (al aanwezig); Next.js file input

---

## File Map

| File | Wijziging |
|---|---|
| `backend/Dockerfile` | MODIFY — `apt-get install -y ffmpeg` toevoegen |
| `backend/services/audio_converter.py` | NEW — `convert_to_wav(data, filename) -> bytes` |
| `backend/tests/test_audio_converter.py` | NEW — 3 unit tests voor de converter |
| `backend/routers/voice_samples.py` | MODIFY — roep converter aan, sla altijd op als `.wav` |
| `backend/tests/test_voice_samples.py` | MODIFY — upload tests bijwerken voor multi-format |
| `frontend/Anna-remembers/components/settings/settings-screen.tsx` | MODIFY — `accept` uitbreiden, knoplabel aanpassen |

---

## Task 1: ffmpeg in de Docker container

**Files:**
- Modify: `backend/Dockerfile`

- [x] **Stap 1: Voeg ffmpeg toe aan de Dockerfile**

Vervang de volledige inhoud van `backend/Dockerfile`:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"]
```

- [ ] **Stap 2: Verifieer dat ffmpeg beschikbaar is na rebuild**

```bash
docker compose up backend --build -d
docker compose exec backend ffmpeg -version
```

Verwacht: eerste regel begint met `ffmpeg version ...`

- [ ] **Stap 3: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat: install ffmpeg in backend Docker image"
```

---

## Task 2: Audio converter service

**Files:**
- Create: `backend/services/audio_converter.py`
- Create: `backend/tests/test_audio_converter.py`

- [x] **Stap 1: Schrijf de falende tests**

```python
# backend/tests/test_audio_converter.py
"""Unit tests voor services/audio_converter.py."""
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from services.audio_converter import ALLOWED_EXTENSIONS, convert_to_wav


class TestConvertToWav:
    def test_mp3_calls_ffmpeg_and_returns_wav_bytes(self):
        fake_wav = b"RIFF\x24\x00\x00\x00WAVEfmt "

        def fake_ffmpeg(cmd, **kwargs):
            # ffmpeg schrijft normaal naar het laatste argument (output path)
            output_path = Path(cmd[-1])
            output_path.write_bytes(fake_wav)
            return MagicMock(returncode=0, stderr=b"")

        with patch("services.audio_converter.subprocess.run", side_effect=fake_ffmpeg):
            result = convert_to_wav(b"fake-mp3-data", "opname.mp3")

        assert result == fake_wav

    def test_ffmpeg_args_contain_correct_sample_rate_and_channels(self):
        fake_wav = b"RIFF\x00\x00\x00\x00WAVEfmt "

        def fake_ffmpeg(cmd, **kwargs):
            Path(cmd[-1]).write_bytes(fake_wav)
            return MagicMock(returncode=0, stderr=b"")

        with patch("services.audio_converter.subprocess.run", side_effect=fake_ffmpeg) as mock_run:
            convert_to_wav(b"data", "stem.m4a")

        cmd = mock_run.call_args[0][0]
        assert "-ar" in cmd
        assert "22050" in cmd
        assert "-ac" in cmd
        assert "1" in cmd
        assert "-c:a" in cmd
        assert "pcm_s16le" in cmd

    def test_raises_value_error_for_unsupported_extension(self):
        with pytest.raises(ValueError, match="niet ondersteund"):
            convert_to_wav(b"data", "document.pdf")

    def test_raises_runtime_error_when_ffmpeg_fails(self):
        with patch("services.audio_converter.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1, stderr=b"Invalid data found when processing input"
            )
            with pytest.raises(RuntimeError, match="ffmpeg conversie mislukt"):
                convert_to_wav(b"corrupt", "broken.mp3")

    def test_allowed_extensions_contains_common_formats(self):
        assert ".wav" in ALLOWED_EXTENSIONS
        assert ".mp3" in ALLOWED_EXTENSIONS
        assert ".m4a" in ALLOWED_EXTENSIONS
        assert ".webm" in ALLOWED_EXTENSIONS
        assert ".ogg" in ALLOWED_EXTENSIONS
```

- [ ] **Stap 2: Draai de falende tests**

```bash
cd backend && python -m pytest tests/test_audio_converter.py -v
```

Verwacht: `ImportError` — `services.audio_converter` bestaat nog niet.

- [x] **Stap 3: Schrijf de implementatie**

```python
# backend/services/audio_converter.py
"""Converteert audiobestanden naar WAV geschikt voor XTTS v2 voice cloning.

XTTS v2 verwacht voor speaker reference audio:
  - 22050 Hz sample rate (intern gebruikt voor feature extraction)
  - mono (1 kanaal)
  - 16-bit PCM (pcm_s16le)
De syntheseoutput van XTTS is 24000 Hz — dat is iets anders dan de referentie-input.
"""
import subprocess
import tempfile
from pathlib import Path

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac", ".aac"}

# XTTS v2 verwerkt speaker reference audio intern op 22050 Hz.
_XTTS_SAMPLE_RATE = "22050"


def convert_to_wav(data: bytes, original_filename: str) -> bytes:
    """Converteer audiodata naar XTTS-compatibele WAV (22050 Hz mono pcm_s16le).

    Raises:
        ValueError: als het bestandstype niet in ALLOWED_EXTENSIONS zit.
        RuntimeError: als ffmpeg de conversie niet kan uitvoeren.
    """
    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Bestandstype '{ext}' niet ondersteund. "
            f"Toegestaan: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        input_path = tmp / f"input{ext}"
        output_path = tmp / "output.wav"

        input_path.write_bytes(data)

        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(input_path),
                "-ar", _XTTS_SAMPLE_RATE,  # 22050 Hz — XTTS v2 speaker reference rate
                "-ac", "1",                # mono
                "-c:a", "pcm_s16le",       # 16-bit PCM WAV
                str(output_path),
            ],
            capture_output=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"ffmpeg conversie mislukt: {result.stderr.decode(errors='replace')[:300]}"
            )

        return output_path.read_bytes()
```

- [x] **Stap 4: Draai de tests — verwacht PASS**

```bash
cd backend && python -m pytest tests/test_audio_converter.py -v
```

Verwacht:
```
PASSED tests/test_audio_converter.py::TestConvertToWav::test_mp3_calls_ffmpeg_and_returns_wav_bytes
PASSED tests/test_audio_converter.py::TestConvertToWav::test_ffmpeg_args_contain_correct_sample_rate_and_channels
PASSED tests/test_audio_converter.py::TestConvertToWav::test_raises_value_error_for_unsupported_extension
PASSED tests/test_audio_converter.py::TestConvertToWav::test_raises_runtime_error_when_ffmpeg_fails
PASSED tests/test_audio_converter.py::TestConvertToWav::test_allowed_extensions_contains_common_formats
```

- [ ] **Stap 5: Commit**

```bash
git add backend/services/audio_converter.py backend/tests/test_audio_converter.py
git commit -m "feat: add ffmpeg audio converter service"
```

---

## Task 3: Router aanpassen — multi-format upload

**Files:**
- Modify: `backend/routers/voice_samples.py`
- Modify: `backend/tests/test_voice_samples.py`

- [x] **Stap 1: Schrijf de twee nieuwe tests in `test_voice_samples.py`**

Vervang de bestaande `test_upload_saves_wav_and_calls_reload` en `test_upload_rejects_non_wav` door de onderstaande vier tests. De rest van de klasse blijft ongewijzigd.

```python
# Vervang in class TestVoiceSamplesRouter:

    def test_upload_mp3_converts_and_saves_as_wav(self, tmp_path: Path):
        fake_wav = b"RIFF\x24\x00\x00\x00WAVEfmt "
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch("routers.voice_samples._reload_xtts", new_callable=AsyncMock),
            patch("routers.voice_samples.convert_to_wav", return_value=fake_wav) as mock_convert,
        ):
            client = TestClient(app)
            resp = client.post(
                "/tts/voice-samples",
                files={"file": ("opname.mp3", b"fake-mp3", "audio/mpeg")},
            )
            assert resp.status_code == 200
            assert resp.json()["filename"] == "opname.wav"
            assert (tmp_path / "opname.wav").read_bytes() == fake_wav
            mock_convert.assert_called_once_with(b"fake-mp3", "opname.mp3")

    def test_upload_wav_also_runs_through_converter(self, tmp_path: Path):
        fake_wav = b"RIFF\x00\x00\x00\x00WAVEfmt "
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch("routers.voice_samples._reload_xtts", new_callable=AsyncMock),
            patch("routers.voice_samples.convert_to_wav", return_value=fake_wav),
        ):
            client = TestClient(app)
            resp = client.post(
                "/tts/voice-samples",
                files={"file": ("stem.wav", b"raw-wav", "audio/wav")},
            )
            assert resp.status_code == 200
            assert resp.json()["filename"] == "stem.wav"

    def test_upload_unsupported_format_returns_400(self, tmp_path: Path):
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch(
                "routers.voice_samples.convert_to_wav",
                side_effect=ValueError("Bestandstype '.pdf' niet ondersteund"),
            ),
        ):
            client = TestClient(app)
            resp = client.post(
                "/tts/voice-samples",
                files={"file": ("doc.pdf", b"fake", "application/pdf")},
            )
            assert resp.status_code == 400
            assert "niet ondersteund" in resp.json()["detail"]

    def test_upload_corrupt_audio_returns_422(self, tmp_path: Path):
        with (
            patch("routers.voice_samples.VOICE_DIR", str(tmp_path)),
            patch(
                "routers.voice_samples.convert_to_wav",
                side_effect=RuntimeError("ffmpeg conversie mislukt: Invalid data"),
            ),
        ):
            client = TestClient(app)
            resp = client.post(
                "/tts/voice-samples",
                files={"file": ("corrupt.mp3", b"garbage", "audio/mpeg")},
            )
            assert resp.status_code == 422
            assert "ffmpeg" in resp.json()["detail"]
```

- [ ] **Stap 2: Draai de tests — verwacht FAIL**

```bash
cd backend && python -m pytest tests/test_voice_samples.py -v
```

Verwacht: `ImportError` of `AssertionError` — `convert_to_wav` is nog niet geïmporteerd in de router.

- [x] **Stap 3: Pas `backend/routers/voice_samples.py` aan**

Vervang de volledige inhoud:

```python
"""Voice sample management — upload audio voor XTTS voice cloning."""
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, UploadFile

from services.audio_converter import convert_to_wav

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
            pass


@router.get("")
async def list_samples() -> dict:
    """Geeft alle WAV-bestandsnamen in de voice directory."""
    voice_dir = Path(VOICE_DIR)
    if not voice_dir.exists():
        return {"samples": []}
    return {"samples": sorted(p.name for p in voice_dir.glob("*.wav"))}


@router.post("")
async def upload_sample(file: UploadFile) -> dict:
    """Upload een audiobestand, converteer naar WAV en sla op als stemreferentie."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Geen bestandsnaam")

    stem = Path(file.filename).stem

    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Bestand te groot (max 10 MB)")

    try:
        wav_bytes = convert_to_wav(content, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    filename = f"{stem}.wav"
    voice_dir = Path(VOICE_DIR)
    voice_dir.mkdir(parents=True, exist_ok=True)
    (voice_dir / filename).write_bytes(wav_bytes)

    await _reload_xtts()
    return {"filename": filename, "size": len(wav_bytes)}


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

- [x] **Stap 4: Draai alle voice sample tests — verwacht PASS**

```bash
cd backend && python -m pytest tests/test_voice_samples.py tests/test_audio_converter.py -v
```

Verwacht: alle tests groen. De twee tests die je in stap 1 verwijderd hebt (`test_upload_saves_wav_and_calls_reload` en `test_upload_rejects_non_wav`) zijn vervangen door de vier nieuwe — totaal 9 tests in `test_voice_samples.py` + 5 in `test_audio_converter.py`.

- [ ] **Stap 5: Commit**

```bash
git add backend/routers/voice_samples.py backend/tests/test_voice_samples.py
git commit -m "feat: convert uploaded audio to WAV via ffmpeg before saving"
```

---

## Task 4: Frontend — bredere accept + knoplabel

**Files:**
- Modify: `frontend/Anna-remembers/components/settings/settings-screen.tsx`

Er is één plek in de Stemsamples card die aangepast moet worden: het `<input>` element en de knoptekst.

- [x] **Stap 1: Pas de file input en knoptekst aan**

Zoek in `settings-screen.tsx` het stuk:

```tsx
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
```

Vervang door:

```tsx
              <input
                ref={fileRef}
                type="file"
                accept=".wav,.mp3,.m4a,.ogg,.webm,.flac,.aac,audio/*"
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
                {uploading ? "Converteren..." : "Audio uploaden"}
              </Button>
```

- [ ] **Stap 2: TypeScript check**

```bash
cd frontend/Anna-remembers && npx tsc --noEmit
```

Verwacht: geen fouten.

- [ ] **Stap 3: Commit**

```bash
git add frontend/Anna-remembers/components/settings/settings-screen.tsx
git commit -m "feat: accept all audio formats in voice sample upload UI"
```

---

## Scope check (self-review)

- ✅ ffmpeg geïnstalleerd in Docker image via `apt-get`
- ✅ `convert_to_wav` converteert naar 22050 Hz mono PCM WAV
- ✅ Ondersteunde formaten: `.wav`, `.mp3`, `.m4a`, `.ogg`, `.webm`, `.flac`, `.aac`
- ✅ Niet-ondersteund formaat → 400
- ✅ Corrupt audiobestand (ffmpeg fout) → 422
- ✅ Bestand altijd opgeslagen als `{stem}.wav` — ook als origineel al `.wav` was (hercodering garandeert juist formaat)
- ✅ 5 unit tests voor de converter (subprocess gemocked)
- ✅ 4 router tests dekken: MP3 conversie, WAV conversie, ongeldig formaat, corrupt bestand
- ✅ Bestaande list/delete/path-traversal tests onaangetast
- ✅ Frontend `accept` uitgebreid, knoplabel van "WAV uploaden" naar "Audio uploaden"
