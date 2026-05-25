"""Settings router — read and update application settings."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.setting import Setting
from schemas.setting import SettingResponse, SettingUpdate
from services.database import get_db

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/", response_model=dict[str, str])
def get_settings(db: Session = Depends(get_db)) -> dict[str, str]:
    """Return all settings as a key-value dict."""
    rows = db.query(Setting).all()
    return {row.key: row.value for row in rows}


@router.put("/{key}", response_model=SettingResponse)
def update_setting(
    key: str,
    body: SettingUpdate,
    db: Session = Depends(get_db),
) -> SettingResponse:
    """Update an existing setting. Returns 404 if the key does not exist."""
    setting = db.query(Setting).filter(Setting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Instelling '{key}' niet gevonden")
    setting.value = body.value
    db.commit()
    db.refresh(setting)
    return SettingResponse.model_validate(setting)
