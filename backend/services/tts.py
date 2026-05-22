"""HTTP client for the Piper TTS container."""
import os

import httpx
from fastapi import HTTPException

PIPER_URL = os.getenv("PIPER_URL", "http://piper-tts:5000")
# XTTS v2 op GPU doet ~3-10s per zin; Piper is sneller maar deelt dezelfde client.
TIMEOUT_SECONDS = float(os.getenv("TTS_TIMEOUT_SECONDS", "60"))


async def synthesize(text: str) -> bytes:
    """Send text to Piper and return WAV audio bytes.

    Raises HTTPException on upstream errors so the router can pass them through.
    """
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="text mag niet leeg zijn")

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        try:
            response = await client.post(
                PIPER_URL,
                params={"text": text},
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Piper timeout")
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Piper niet bereikbaar: {exc}",
            )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Piper gaf status {response.status_code} terug",
        )

    return response.content
