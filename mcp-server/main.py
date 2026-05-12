import os
from fastmcp import FastMCP

from services.embedding import get_embedding_provider
from tools.escalation import escalate_to_human as _escalate_to_human
from tools.memory import recall_context as _recall_context
from tools.memory import store_memory as _store_memory

mcp = FastMCP("anna-remembers-mcp")
_embed = get_embedding_provider()


@mcp.tool()
async def store_memory(
    content: str,
    source: str,
    patient_id: str,
    session_id: str,
) -> str:
    """Sla een geheugenblok op voor een patiënt."""
    return await _store_memory(content, source, patient_id, session_id, _embed)


@mcp.tool()
async def recall_context(
    query: str,
    patient_id: str,
    limit: int,
) -> list[dict]:
    """Haal semantisch gerelateerde herinneringen op voor een patiënt."""
    return await _recall_context(query, patient_id, limit, _embed)


@mcp.tool()
async def escalate_to_human(
    patient_id: str,
    reason: str,
    urgency: str,
) -> None:
    """Escaleer naar een zorgverlener. urgency: low | medium | high."""
    return await _escalate_to_human(patient_id, reason, urgency)


if __name__ == "__main__":
    port = int(os.getenv("MCP_PORT", "8001"))
    mcp.run(transport="sse", host="0.0.0.0", port=port)
