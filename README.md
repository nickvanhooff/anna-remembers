# Anna Remembers

AI health assistant for heart failure patients. Conducts weekly check-ins, remembers conversations across sessions, detects symptom patterns over time, and escalates to a caregiver when needed.

**Student:** Nick van Hooff — Fontys ICT, Software Engineering, Semester 4

---

## Architecture

```
Next.js 15 (UI only, port 3000)
    ↓ HTTP (REST)
FastAPI (Python, port 8000) — orchestrates all AI logic
    ↓ MCP protocol (port 8001)
MCP Server (fastmcp) — memory, trends, escalation tools
    ├── ChromaDB (port 8002) — vector store for RAG memory
    └── PostgreSQL 16 (port 5432) — structured patient data
         ↑
    Ollama (port 11434) — local LLM + embeddings (RTX 4050)
```

**Rules:**
- Next.js never calls AI or the database directly — all through FastAPI
- FastAPI is the only MCP client — Next.js never talks to the MCP server
- RAG lives in the MCP server (`tools/memory.py`), not in FastAPI
- Every stored memory has a `source` tag: `patient_stated` or `ai_inferred`

---

## Stack

| Layer | Technology | Port |
|---|---|---|
| Frontend | Next.js 15 (App Router) + shadcn/ui | 3000 |
| Backend | FastAPI (Python) | 8000 |
| MCP Server | fastmcp (separate process) | 8001 |
| Vector DB | ChromaDB | 8002 |
| Relational DB | PostgreSQL 16 | 5432 |
| LLM + Embeddings | Ollama — gemma4:e4b + bge-m3 | 11434 |
| Infrastructure | Docker Compose | — |

---

## Running locally

### Prerequisites

- Docker Desktop with GPU passthrough enabled (NVIDIA)
- A `.env` file in the project root (see below)

### Environment variables

Create `.env` in the project root:

```env
POSTGRES_DB=anna_remembers
POSTGRES_USER=anna
POSTGRES_PASSWORD=secret

LLM_PROVIDER=ollama
OLLAMA_MODEL=gemma4:e4b
EMBEDDING_MODEL=bge-m3
```

### Start all services

```bash
docker compose up --build
```

On first run, `ollama-init` pulls the `bge-m3` embedding model automatically. The LLM model (`gemma4:e4b`) must be pulled once manually:

```bash
docker exec -it anna_remembers-ollama-1 ollama pull gemma4:e4b
```

### Services

| Service | URL |
|---|---|
| Frontend dashboard | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| MCP Server | http://localhost:8001 |
| ChromaDB | http://localhost:8002 |

### Reset database

If you change the database schema during development:

```bash
docker compose down -v   # removes volumes (all data lost)
docker compose up --build
```

---

## Project structure

```
anna_remembers/
├── frontend/               # Next.js 15 dashboard
│   └── Anna-remembers/
│       ├── app/            # App Router pages + layouts
│       ├── components/     # Feature-based components
│       │   ├── dashboard/  # Sidebar, shell, status badge
│       │   ├── patients/   # Patient management screen
│       │   ├── chat/       # Chat screen
│       │   ├── trends/     # Symptom trends screen
│       │   └── escalations/# Escalation management screen
│       ├── lib/            # api.ts, mock-data.ts, utils.ts
│       └── types/          # TypeScript interfaces
│
├── backend/                # FastAPI
│   ├── routers/            # patients.py, chat.py
│   ├── models/             # SQLAlchemy ORM models
│   ├── schemas/            # Pydantic request/response schemas
│   ├── services/           # llm.py, database.py, mcp_client.py
│   └── alembic/            # Database migrations
│
├── mcp-server/             # fastmcp (runs as separate process)
│   └── tools/
│       ├── memory.py       # store_memory, recall_context (RAG)
│       ├── trends.py       # get_symptom_trends (PostgreSQL)
│       └── escalation.py   # escalate_to_human
│
├── portfolio/              # Build log + decision logs + evidence
│   ├── STAPPEN.md          # Step-by-step build log
│   ├── decision-logs/      # DL1–DL6
│   └── evidence/
│
└── docker-compose.yml
```

---

## MCP tools

| Tool | Description |
|---|---|
| `store_memory(content, source, patient_id, session_id)` | Stores a memory in ChromaDB. `source` is `patient_stated` or `ai_inferred` |
| `recall_context(query, patient_id, limit)` | Semantic RAG search over patient history |
| `get_symptom_trends(patient_id, weeks)` | Retrieves aggregated symptom data from PostgreSQL |
| `escalate_to_human(patient_id, reason, urgency)` | Sends notification via email or Slack based on urgency |

---

## Dashboard screens

| Screen | Route | Status |
|---|---|---|
| Patient management | `/patients` | Live (FastAPI) |
| Chat with Anna | `/chat` | Mock |
| Symptom trends | `/trends` | Mock |
| Escalation management | `/escalations` | Mock |

---

## Portfolio

Decision logs and evidence are in `portfolio/`. The build log (`STAPPEN.md`) documents every step taken, including decisions and commit references.
