"""MCP-client — verbindt FastAPI met de MCP-server via het SSE-protocol.

FastAPI roept nooit rechtstreeks ChromaDB of de embedder aan.
Alle AI-geheugenlogica zit in de MCP-server op poort 8001.
"""
import json
import os

from fastmcp import Client


class MCPClient:
    """Wrapper om fastmcp.Client die de MCP tools als Python-methodes aanbiedt."""

    def __init__(self, base_url: str) -> None:
        self._url = f"{base_url}/sse"

    async def recall_context(
        self,
        query: str,
        patient_id: str,
        limit: int = 5,
    ) -> list[dict]:
        """Semantische RAG-search over eerdere uitspraken van een patiënt."""
        async with Client(self._url) as client:
            result = await client.call_tool(
                "recall_context",
                {"query": query, "patient_id": patient_id, "limit": limit},
            )
        return json.loads(result[0].text)

    async def store_memory(
        self,
        content: str,
        source: str,
        patient_id: str,
        session_id: str,
    ) -> str:
        """Sla een uitspraak op als vector in ChromaDB via de MCP-server.

        source: "patient_stated" | "ai_inferred"
        Retourneert de doc_id (UUID) van het opgeslagen document.
        """
        async with Client(self._url) as client:
            result = await client.call_tool(
                "store_memory",
                {
                    "content": content,
                    "source": source,
                    "patient_id": patient_id,
                    "session_id": session_id,
                },
            )
        return result[0].text

    async def get_symptom_trends(
        self,
        patient_id: str,
        weeks: int = 4,
    ) -> dict:
        """Stub — get_symptom_trends volgt in een volgend issue."""
        return {}

    async def escalate_to_human(
        self,
        patient_id: str,
        reason: str,
        urgency: str,
    ) -> None:
        """Stub — escalatie volgt in een volgend issue.

        urgency: "low" | "medium" | "high"
        """
        pass


def get_mcp_client() -> MCPClient:
    """FastAPI Depends() factory — leest MCP_URL uit de omgeving."""
    base_url = os.getenv("MCP_URL", "http://mcp-server:8001")
    return MCPClient(base_url=base_url)
