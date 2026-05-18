"""MCP client — connects FastAPI to the MCP server over SSE.

FastAPI never calls ChromaDB or the embedder directly.
All AI memory logic lives in the MCP server on port 8001.
"""
import json
import os

from fastmcp import Client


def _first_text(result) -> str:
    """Extract the first TextContent.text from fastmcp call_tool result.

    fastmcp has had multiple return shapes across versions:
    - list[TextContent]
    - CallToolResult(content=[TextContent, ...])
    """
    content = getattr(result, "content", result)
    if not content:
        return ""
    first = content[0]
    return getattr(first, "text", str(first))


def _unwrap_tool_result(result):
    """Return the tool result value across fastmcp versions.

    fastmcp 3.x may return CallToolResult(structured_content={'result': ...}).
    Older versions returned a list of TextContent where .text held the result.
    """
    structured = getattr(result, "structured_content", None)
    if isinstance(structured, dict) and "result" in structured:
        return structured["result"]
    return _first_text(result)


class MCPClient:
    """Wrapper around fastmcp.Client exposing MCP tools as Python methods."""

    def __init__(self, base_url: str) -> None:
        self._url = f"{base_url}/sse"

    async def recall_context(
        self,
        query: str,
        patient_id: str,
        limit: int = 5,
    ) -> list[dict]:
        """Semantic RAG search over a patient's prior statements."""
        async with Client(self._url) as client:
            result = await client.call_tool(
                "recall_context",
                {"query": query, "patient_id": patient_id, "limit": limit},
            )
        value = _unwrap_tool_result(result)
        if isinstance(value, str):
            return json.loads(value)
        return value

    async def store_memory(
        self,
        content: str,
        source: str,
        patient_id: str,
        session_id: str,
    ) -> str:
        """Store a statement as a vector in ChromaDB via the MCP server.

        source: "patient_stated" | "ai_inferred"
        Returns the doc_id (UUID) of the stored document.
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
        value = _unwrap_tool_result(result)
        if isinstance(value, str):
            return value
        return str(value)

    async def get_symptom_trends(
        self,
        patient_id: str,
        weeks: int = 4,
    ) -> dict:
        """Stub — get_symptom_trends comes in a future issue."""
        return {}

    async def escalate_to_human(
        self,
        patient_id: str,
        reason: str,
        urgency: str,
    ) -> str:
        """Call the escalate_to_human MCP tool.

        urgency: "low" | "medium" | "high"
        Returns the escalation ID (UUID string).
        """
        async with Client(self._url) as client:
            result = await client.call_tool(
                "escalate_to_human",
                {"patient_id": patient_id, "reason": reason, "urgency": urgency},
            )
        return _unwrap_tool_result(result)


def get_mcp_client() -> MCPClient:
    """FastAPI Depends() factory — reads MCP_URL from the environment."""
    base_url = os.getenv("MCP_URL", "http://mcp-server:8001")
    return MCPClient(base_url=base_url)
