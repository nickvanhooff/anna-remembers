"""Voice sample management — upload audio for XTTS voice cloning."""
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
    """Ask the XTTS bridge to reload speaker samples."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(f"{XTTS_URL}/reload")
        except httpx.RequestError:
            pass


@router.get("")
async def list_samples() -> dict:
    """Return all WAV filenames in the voice directory."""
    voice_dir = Path(VOICE_DIR)
    if not voice_dir.exists():
        return {"samples": []}
    return {"samples": sorted(p.name for p in voice_dir.glob("*.wav"))}


@router.post("")
async def upload_sample(file: UploadFile) -> dict:
    """Upload an audio file, convert to WAV, and save as a voice reference."""
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
    """Delete a voice reference file."""
    safe_name = Path(filename).name
    if safe_name != filename or not filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Ongeldige bestandsnaam")

    target = Path(VOICE_DIR) / safe_name
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"{filename} niet gevonden")

    target.unlink()
    await _reload_xtts()
    return {"deleted": filename}
