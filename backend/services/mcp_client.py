"""MCP-client — verbindt FastAPI met de MCP-server op poort 8001.

Implementatie volgt in issue #3 (MCP Server scaffold).
Stubs zijn aanwezig zodat routers al kunnen importeren.
"""


async def store_memory(
    content: str,
    source: str,
    patient_id: str,
    session_id: str,
) -> None:
    """Sla een uitspraak op als vector in ChromaDB via de MCP-server.

    source = "patient_stated" | "ai_inferred"
    """
    # TODO: implementeer MCP-protocol aanroep (issue #3)
    raise NotImplementedError


async def recall_context(
    query: str,
    patient_id: str,
    limit: int = 5,
) -> list[str]:
    """Semantische RAG-search over eerdere uitspraken van een patiënt."""
    # TODO: implementeer MCP-protocol aanroep (issue #3)
    raise NotImplementedError


async def get_symptom_trends(
    patient_id: str,
    weeks: int = 4,
) -> dict:
    """Haal gestructureerde symptoomdata op uit PostgreSQL via de MCP-server."""
    # TODO: implementeer MCP-protocol aanroep (issue #3)
    raise NotImplementedError


async def escalate_to_human(
    patient_id: str,
    reason: str,
    urgency: str,
) -> None:
    """Stuur een escalatiebericht naar een zorgverlener.

    urgency = "low" | "medium" | "high"
    Kanaal wordt bepaald door urgency (email vs. Slack).
    """
    # TODO: implementeer MCP-protocol aanroep (issue #3)
    raise NotImplementedError
