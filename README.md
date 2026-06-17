# Anna Remembers

AI health assistant for heart failure patients. Conducts weekly check-ins, remembers conversations across sessions, detects symptom patterns over time, and escalates to a caregiver when needed.

**Student:** Nick van Hooff — Fontys ICT, Software Engineering, Semester 4

---

## Architecture

```
Next.js 15 (UI only, port 3001)
    ↓ HTTP (REST)
FastAPI (Python, port 8000) — orchestrates all AI logic
    ↓ MCP protocol (port 8001)
MCP Server (fastmcp) — memory, trends, escalation tools
    ├── ChromaDB (port 8002) — vector store for RAG memory
    └── PostgreSQL 16 (port 5432) — structured patient data

LLM routing (provider-agnostic):
    Ollama (port 11434) — local LLM + embeddings (RTX 4050)
    Portkey gateway — routes to Azure OpenAI / OpenAI / other cloud models
    Groq / Anthropic / OpenRouter — direct cloud providers

TTS pipeline:
    Piper TTS (port 5005 / 10200) — fast offline Dutch voice
    XTTS v2 / Coqui (port 5006) — GPU quality voice cloning

SMS escalation: Twilio
```

**Rules:**
- Next.js never calls AI or the database directly — all through FastAPI
- FastAPI is the only MCP client — Next.js never talks to the MCP server
- RAG lives in the MCP server (`tools/memory.py`), not in FastAPI
- Every stored memory has a `source` tag: `patient_stated` or `ai_inferred`
- Escalation detection is layered: Layer 0 (deterministic keywords, synchronous) + Layer 1 (configurable classifier, `BackgroundTask`)

---

## Stack

| Layer | Technology | Port |
|---|---|---|
| Frontend | Next.js 15 (App Router) + shadcn/ui | 3001 |
| Backend | FastAPI (Python) | 8000 |
| MCP Server | fastmcp (separate process) | 8001 |
| Vector DB | ChromaDB | 8002 |
| Relational DB | PostgreSQL 16 | 5432 |
| LLM | Ollama (qwen2.5:3b) or cloud via Portkey / Groq / Anthropic / OpenRouter | 11434 / cloud |
| Embeddings | bge-m3 via Ollama or text-embedding-3-large via Portkey | 11434 / cloud |
| TTS (fast) | Piper TTS nl_NL-ronnie — offline Dutch voice | 5005 / 10200 |
| TTS (quality) | XTTS v2 (Coqui) — GPU voice cloning | 5006 |
| STT | Web Speech API (browser-native, cloud) | — |
| Avatar | Three.js GLB + ARKit visemes + Web Audio API lip sync | — |
| Observability | Langfuse (LLM generation + RAG span tracing) | 3000 |
| Notifications | Twilio SMS (escalation alerts) | cloud |
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

# LLM provider: ollama | groq | anthropic | openrouter | portkey
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_BASE_URL=http://ollama:11434

# Groq (fast free tier — recommended for demo)
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=

# Portkey gateway (routes to Azure OpenAI or other configured targets)
PORTKEY_API_KEY=
PORTKEY_MODEL=@azure-openai/gpt-5.4
PORTKEY_CONFIG=

# Embeddings provider: ollama | portkey
EMBEDDING_PROVIDER=ollama
OPENAI_EMBEDDING_MODEL=@azure-openai/text-embedding-3-large
PORTKEY_EMBEDDING_CONFIG=

# Layer 1 escalation classifier
# Can use any supported provider (portkey, ollama, openai_compat)
ESCALATION_PROVIDER=ollama
ESCALATION_MODEL=qwen2.5:3b
ESCALATION_COOLDOWN_MINUTES=0

# Twilio SMS escalation alerts
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
NOTIFICATION_PHONE=

# Observability (optional)
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Medical summary regeneration interval (messages per patient)
SUMMARY_INTERVAL=3
```

### Start all services

```bash
docker compose up --build
```

On first run, `ollama-init` pulls the `bge-m3` embedding model automatically. If using Ollama as the LLM provider, pull the chat model and the Layer 1 escalation classifier once manually:

```bash
docker exec -it anna_remembers-ollama-1 ollama pull qwen2.5:3b
```

For cloud providers (Groq, Anthropic, OpenRouter, Portkey), set `LLM_PROVIDER` and the matching API key in `.env` — no local chat model needed. If using Ollama for the Layer 1 escalation classifier, the model still needs to be pulled.

### Services

| Service | URL |
|---|---|
| Frontend dashboard | http://localhost:3001 |
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
│       │   ├── chat/       # Chat screen (text + voice mode + avatar)
│       │   ├── trends/     # Symptom trends screen
│       │   └── escalations/# Escalation management screen
│       ├── lib/            # api.ts, mock-data.ts, utils.ts
│       └── types/          # TypeScript interfaces
│
├── backend/                # FastAPI
│   ├── routers/
│   │   ├── patients.py
│   │   ├── escalations.py
│   │   ├── tts.py          # TTS provider routing (Piper / XTTS)
│   │   ├── symptom_trends.py
│   │   └── chat/           # Chat package
│   │       ├── _routes.py      # FastAPI handlers (chat + greet endpoint)
│   │       ├── _prompts.py     # System, greet, and summary prompt builders
│   │       ├── _summary.py     # Periodic medical_summary BackgroundTask
│   │       ├── _escalation.py  # Layer 0 keywords + Layer 1 classifier
│   │       └── _animation.py   # Avatar animation tag resolution
│   ├── models/             # SQLAlchemy ORM models
│   ├── schemas/            # Pydantic request/response schemas
│   ├── services/           # llm.py, database.py, mcp_client.py, tts.py
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
| `escalate_to_human(patient_id, reason, urgency)` | Sends SMS via Twilio based on urgency |

---

## Dashboard screens

| Screen | Route | Status |
|---|---|---|
| Patient management | `/patients` | Live |
| Chat with Anna | `/chat` | Live — RAG, medical summary, TTS, STT, avatar, auto check-in |
| Symptom trends | `/trends` | Live — weekly aggregates from PostgreSQL |
| Escalation management | `/escalations` | Live — Layer 0 + Layer 1 detection, Twilio SMS |

---

## Chat features

**Auto weekly check-in:** When a new session opens, Anna sends the first message. She queries RAG for earlier statements from this patient and generates a personalised, indirect opening question (e.g. *"Last time you mentioned some shortness of breath — how has that been this week?"*). The patient does not need to know how to start.

**Voice mode:** Toggle between text and voice in the chat header. The browser's Web Speech API handles speech-to-text; the backend synthesises Anna's reply via Piper (fast, offline) or XTTS v2 (GPU, voice cloning), selectable per patient in Settings.

**3D avatar:** A Three.js GLB model with 72 ARKit morph targets lip-syncs to Anna's audio using Web Audio API FFT frequency analysis. Animation state is driven by tags (`[ANIM: x]`) embedded in the LLM response and stripped before display.

**RAG memory:** Patient statements are stored in ChromaDB with `source=patient_stated`. Anna's inferred summaries use `source=ai_inferred`. Only `patient_stated` memories are injected into the system prompt — Anna never fabricates facts.

**Medical summary:** Every `SUMMARY_INTERVAL` messages, a compact JSON dossier (`sym/med/wgt/bhv/ovr`) is regenerated in the background and shown in the Dossier panel.

**Symptom extraction:** When a session is closed, the full transcript is passed to an LLM that extracts structured symptom scores (dyspnea, edema, fatigue, medication adherence, weight) and stores them in `symptom_observations` for the trends chart.

---

## Escalation detection

A patient message is checked twice for emergencies, in two layers:

| Layer | When | How | Latency |
|---|---|---|---|
| **Layer 0** | Synchronous, before LLM | Hardcoded Dutch keyword sets (`pijn op de borst`, `bewusteloos`, `brandwond`, …) split into `high` and `medium` | ~0 ms |
| **Layer 1** | Async `BackgroundTask` after the response is sent | Configurable classifier (Portkey / Ollama / OpenAI-compatible) returns `{escalate, urgency, reason}` JSON. Per-patient semaphore + optional cooldown prevent duplicates | ~1–5 s |

Layer 0 fires before the chat response so urgent cases trigger immediately. Layer 1 catches nuanced cases that keyword matching misses (e.g. *"ik werd vannacht wakker omdat ik geen lucht kreeg"*). Both paths call `escalate_to_human` via MCP, which sends a Twilio SMS. Every Layer 1 call is traced in Langfuse.

The classifier model is configurable via `ESCALATION_MODEL` and `ESCALATION_PROVIDER`. `qwen2.5:0.5b` was tested first and rejected — too small to reason in Dutch without hallucinating reasons. See `portfolio/decision-logs/DL4_escalatie_detectie.md`.

---

## Portfolio

Decision logs and evidence are in `portfolio/`. The build log (`STAPPEN.md`) documents every step taken, including decisions and commit references.
