"""Settings router — read and update application settings."""

import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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


class MigrateEmbeddingsRequest(BaseModel):
    target_provider: str  # "ollama" | "openai"


@router.post("/migrate-embeddings")
async def migrate_embeddings(
    body: MigrateEmbeddingsRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Migrate all ChromaDB memories to a new embedding provider.

    Steps:
    1. Read current active provider from DB settings.
    2. Call MCP server to migrate memories from current → target collection.
    3. Call MCP server to switch active provider.
    4. Persist new embedding_provider in DB settings.
    """
    from services.mcp_client import MCPClient

    if body.target_provider not in ("ollama", "openai", "portkey"):
        raise HTTPException(status_code=400, detail="target_provider must be 'ollama', 'openai' or 'portkey'")

    # Read current provider from DB (fallback to env if not set)
    current_setting = db.query(Setting).filter(Setting.key == "embedding_provider").first()
    source_provider = current_setting.value if current_setting else os.getenv("EMBEDDING_PROVIDER", "ollama")

    mcp_url = os.getenv("MCP_URL", "http://mcp-server:8001")
    mcp = MCPClient(base_url=mcp_url)

    # Step 1: migrate memories
    migration_result = await mcp.migrate_all_memories(source_provider, body.target_provider)

    # Step 2: hot-swap provider in MCP server
    await mcp.switch_embedding_provider(body.target_provider)

    # Step 3: persist in DB
    if current_setting:
        current_setting.value = body.target_provider
    else:
        db.add(Setting(key="embedding_provider", value=body.target_provider))
    db.commit()

    return {
        "source_provider": source_provider,
        "target_provider": body.target_provider,
        **migration_result,
    }
