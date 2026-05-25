"""HTTP client for Piper and XTTS TTS containers."""
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
    """Send text to the TTS service and return WAV bytes.

    provider must be 'piper' or 'xtts'. Unknown values fall back to xtts.
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
