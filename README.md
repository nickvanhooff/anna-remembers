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
- Escalation detection is layered: Layer 0 (deterministic keywords, synchronous) + Layer 1 (local Ollama classifier, `BackgroundTask`)

---

## Stack

| Layer | Technology | Port |
|---|---|---|
| Frontend | Next.js 15 (App Router) + shadcn/ui | 3000 |
| Backend | FastAPI (Python) | 8000 |
| MCP Server | fastmcp (separate process) | 8001 |
| Vector DB | ChromaDB | 8002 |
| Relational DB | PostgreSQL 16 | 5432 |
| LLM + Embeddings | Ollama (gemma4:e2b + bge-m3) or cloud provider (Groq / Anthropic / OpenRouter) | 11434 / cloud |
| Observability | Langfuse (tracing per LLM generation + RAG span) | cloud |
| Infrastructure | Docker Compose | — |

---

## Running locally

### Prerequisites

- Docker Desktop with GPU passthrough enabled (NVIDIA)
- A `.env` file in the project root (see below)

### Environment variables

Create `.env` in the project root (use `.env.example` as starting point):

```env
POSTGRES_DB=anna_remembers
POSTGRES_USER=anna
POSTGRES_PASSWORD=secret

# LLM provider: ollama | groq | anthropic | openrouter
LLM_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# For local Ollama (GPU recommended — gemma4:e2b fits in 6 GiB VRAM)
OLLAMA_MODEL=gemma4:e2b
EMBEDDING_MODEL=bge-m3

# Layer 1 escalation classifier (small local Ollama model)
# qwen2.5:3b is the validated choice — 0.5b proved too small for Dutch reasoning.
ESCALATION_MODEL=qwen2.5:3b
ESCALATION_COOLDOWN_MINUTES=0   # set >0 to suppress duplicate Layer 1 escalations per patient

# Optional: Anthropic or OpenRouter
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
OPENROUTER_API_KEY=
OPENROUTER_MODEL=

# Observability (optional)
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com

# Summary generation interval (messages per patient before regenerating)
SUMMARY_INTERVAL=3
```

### Start all services

```bash
docker compose up --build
```

On first run, `ollama-init` pulls the `bge-m3` embedding model automatically. If using Ollama as the LLM provider, pull the chat model and the Layer 1 escalation classifier once manually:

```bash
docker exec -it anna_remembers-ollama-1 ollama pull gemma4:e2b
docker exec -it anna_remembers-ollama-1 ollama pull qwen2.5:3b
```

For cloud providers (Groq, Anthropic, OpenRouter), set `LLM_PROVIDER` and the matching API key in `.env` — no local chat model needed. The Layer 1 escalation classifier always runs locally via Ollama (`ESCALATION_MODEL`).

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

### Seeding demo data

The seeder populates Postgres + ChromaDB with three simulated patients (stable / gradual decline / acute), 10 chat sessions each, two escalations, and 30 RAG memories indexed via real bge-m3 embeddings.

```bash
# Fresh demo state (truncates patients/sessions/messages/escalations + clears Chroma collection)
docker exec -it anna_remembers-backend-1 python seed.py --reset

# Append without wiping existing data
docker exec -it anna_remembers-backend-1 python seed.py

# Skip ChromaDB memories (Postgres only — faster, but RAG won't have history)
docker exec -it anna_remembers-backend-1 python seed.py --no-rag
```

The seeder is idempotent: `store_memory` uses deterministic SHA256 IDs (`patient_id:content`), so repeated runs upsert without creating duplicates.

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
│   ├── routers/
│   │   ├── patients.py
│   │   ├── escalations.py
│   │   └── chat/           # Chat package (refactored from single file)
│   │       ├── _routes.py      # FastAPI handlers
│   │       ├── _prompts.py     # System + summary prompt builders
│   │       ├── _summary.py     # Periodic medical_summary BackgroundTask
│   │       └── _escalation.py  # Layer 0 keywords + Layer 1 Ollama classifier
│   ├── models/             # SQLAlchemy ORM models
│   ├── schemas/            # Pydantic request/response schemas
│   ├── services/           # llm.py, database.py, mcp_client.py
│   ├── seed.py             # Demo data seeder (Postgres + ChromaDB)
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
| Chat with Anna | `/chat` | Live (FastAPI + RAG + medical summary) |
| Symptom trends | `/trends` | Mock (awaiting `get_symptom_trends` MCP tool) |
| Escalation management | `/escalations` | Live (Layer 0 + Layer 1 detection)

---

## Escalation detection

A patient message is checked twice for emergencies, in two layers:

| Layer | When | How | Latency |
|---|---|---|---|
| **Layer 0** | Synchronous, before LLM | Hardcoded Dutch keyword sets (`pijn op de borst`, `bewusteloos`, `brandwond`, …) split into `high` and `medium` | ~0 ms |
| **Layer 1** | Async `BackgroundTask` after the response is sent | Local Ollama classifier (`qwen2.5:3b`) returns `{escalate, urgency, reason}` JSON. Per-patient semaphore + optional cooldown prevent duplicates | ~3–5 s |

Layer 0 fires before the chat response so urgent cases trigger immediately. Layer 1 catches nuanced cases that keyword matching misses (e.g. "ik werd vannacht wakker omdat ik geen lucht kreeg"). Both paths call `escalate_to_human` via MCP. Every Layer 1 call is traced in Langfuse with input, output and model metadata.

The classifier model is configurable via `ESCALATION_MODEL`. `qwen2.5:0.5b` was tested first and rejected — too small to reason in Dutch without hallucinating reasons. `qwen2.5:3b` is the current production choice. See `portfolio/decision-logs/DL4_escalatie_detectie.md`.

---

## Portfolio

Decision logs and evidence are in `portfolio/`. The build log (`STAPPEN.md`) documents every step taken, including decisions and commit references.
