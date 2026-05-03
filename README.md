# Anna Remembers

AI health assistant for heart failure patients. Conducts weekly check-ins, remembers conversations across sessions, detects symptom patterns over time, and escalates to a caregiver when needed.

**Student:** Nick van Hooff — Fontys ICT, Software Engineering, Semester 4

## Architecture

```
Next.js 15 (UI only)
    ↓ HTTP
FastAPI (Python) — orchestrates all AI logic
    ↓ MCP protocol (port 8001)
MCP Server (fastmcp) — memory, trends, escalation tools
    ↓
ChromaDB (RAG)    PostgreSQL 16 (structured data)
```

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) |
| Backend | FastAPI (Python) |
| MCP Server | fastmcp (separate process, port 8001) |
| Relational DB | PostgreSQL 16 |
| Vector DB | ChromaDB |
| LLM | Provider-agnostic (configured via env) |
| Infrastructure | Docker Compose |

## Running locally

```bash
docker compose up
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- MCP Server: http://localhost:8001

## Key architectural rules

- Next.js never calls AI or database directly — all through FastAPI
- FastAPI is the only MCP client — Next.js never talks to the MCP server
- RAG lives in the MCP server (`tools/memory.py`), not in FastAPI
- Every stored memory has a `source` tag: `patient_stated` or `ai_inferred`
