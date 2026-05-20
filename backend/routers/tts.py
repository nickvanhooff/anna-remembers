"""TTS router — proxies text-to-speech requests to the Piper container."""
from fastapi import APIRouter
from fastapi.responses import Response

from backend.schemas.tts import TTSRequest
from backend.services.tts import synthesize

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("", response_class=Response)
async def text_to_speech(req: TTSRequest) -> Response:
    """Synthesize Dutch speech from text via Piper. Returns audio/wav bytes."""
    audio = await synthesize(req.text)
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )
