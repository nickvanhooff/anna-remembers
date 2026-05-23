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
