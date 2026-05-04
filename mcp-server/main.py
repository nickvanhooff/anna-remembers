import os
from fastmcp import FastMCP

# Tool-implementaties worden geïmporteerd vanuit tools/ (issue #3).
# Dit bestand is alleen de server-bootstrap.
# from tools.memory import store_memory, recall_context
# from tools.trends import get_symptom_trends
# from tools.escalation import escalate_to_human

mcp = FastMCP("anna-remembers-mcp")

if __name__ == "__main__":
    port = int(os.getenv("MCP_PORT", "8001"))
    mcp.run(transport="sse", host="0.0.0.0", port=port)
