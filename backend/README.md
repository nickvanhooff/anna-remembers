# Anna Remembers — Backend

FastAPI backend. Ontvangt requests van de Next.js frontend, orkestreert LLM-aanroepen, en delegeert geheugen/trends/escalaties naar de MCP-server.

---

## Lagen

```
┌─────────────────────────────────────────────┐
│                   Routers                   │  HTTP entry points, validatie via Pydantic
│          patients.py  │  chat.py            │  Geen business logic — alleen request/response
└──────────────┬──────────────────────────────┘
               │ Depends(get_db)
┌──────────────▼──────────────────────────────┐
│                  Services                   │
│  database.py   llm.py   mcp_client.py       │
│  SQLAlchemy    LLM ABC  MCP protocol stubs  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│                   Models                    │  SQLAlchemy ORM — directe DB-mapping
│  Patient  Session  Message  Escalation      │  Geen logica, alleen kolommen + relaties
└──────────────┬──────────────────────────────┘
               │
        PostgreSQL 16
```

---

## Request flow — chat

```mermaid
sequenceDiagram
    participant FE as Next.js
    participant R  as Router (chat.py)
    participant DB as PostgreSQL
    participant MC as mcp_client.py
    participant MS as MCP Server :8001
    participant LM as Ollama (LLM)

    FE->>R: POST /chat/{patient_id}
    R->>DB: get Patient
    R->>DB: get or create Session
    R->>DB: save user Message

    R->>MC: recall_context(query, patient_id)
    MC->>MS: MCP call → tools/memory.py
    MS-->>MC: relevante herinneringen (RAG)

    R->>MC: get_symptom_trends(patient_id)
    MC->>MS: MCP call → tools/trends.py
    MS-->>MC: symptoomdata (PostgreSQL aggregatie)

    R->>LM: chat(messages, system_prompt + context)
    LM-->>R: Anna's antwoord

    R->>DB: save assistant Message
    R->>MC: store_memory(patient_stated)
    MC->>MS: MCP call → tools/memory.py → ChromaDB

    R-->>FE: MessageResponse
```

> `mcp_client.py` bevat momenteel stubs (`NotImplementedError`). De echte MCP-protocol aanroepen worden geïmplementeerd in issue #18.

---

## Request flow — patiëntbeheer

```mermaid
sequenceDiagram
    participant FE as Next.js
    participant R  as Router (patients.py)
    participant DB as PostgreSQL

    FE->>R: GET /patients/
    R->>DB: query Patient.all()
    DB-->>R: lijst van Patient rows
    R-->>FE: list[PatientResponse]

    FE->>R: POST /patients/
    R->>R: Pydantic validatie (PatientCreate)
    R->>DB: insert Patient
    DB-->>R: Patient met gegenereerd UUID
    R-->>FE: PatientResponse (201)
```

---

## Mappenstructuur

```
backend/
├── main.py                 # App-setup, CORS, router-registratie — geen logica
│
├── routers/
│   ├── patients.py         # CRUD: GET list, GET by id, POST, PATCH, DELETE
│   └── chat.py             # POST /{patient_id} — orchestreert LLM + MCP
│
├── models/                 # SQLAlchemy ORM — één klasse per tabel
│   ├── base.py             # DeclarativeBase
│   ├── patient.py          # first_name, last_name, birth_date, medication_schedule (JSONB), status
│   ├── session.py          # started_at, ended_at, summary
│   ├── message.py          # role (user/assistant), content
│   └── escalation.py       # reason, urgency, status
│
├── schemas/                # Pydantic — request/response shapes
│   ├── patient.py          # PatientCreate, PatientUpdate, PatientResponse
│   ├── session.py
│   ├── message.py          # ChatRequest, MessageResponse
│   └── escalation.py
│
├── services/
│   ├── database.py         # SQLAlchemy engine + get_db() dependency
│   ├── llm.py              # LLMProvider ABC + OllamaProvider + factory
│   └── mcp_client.py       # Stubs voor store_memory, recall_context, get_symptom_trends, escalate_to_human
│
└── alembic/
    ├── env.py
    └── versions/
        └── 0001_initial_schema.py   # patients, sessions, messages, escalations
```

---

## LLM provider — provider-agnostisch patroon

`services/llm.py` gebruikt een abstracte basisklasse zodat de LLM-provider verwisselbaar is zonder de rest van de codebase aan te raken:

```
LLMProvider (ABC)
    └── OllamaProvider      ← actief (gemma4:e4b, lokaal via Docker)
    └── AnthropicProvider   ← toekomstig (voeg subklasse toe + registreer in factory)
    └── OpenAIProvider      ← toekomstig
```

Provider wisselen: zet `LLM_PROVIDER=anthropic` in `.env` en voeg de subklasse toe in `llm.py`.

---

## Datamodel

```mermaid
erDiagram
    patients {
        uuid id PK
        string first_name
        string last_name
        date birth_date
        jsonb medication_schedule
        text notes
        string status
        datetime created_at
    }
    sessions {
        uuid id PK
        uuid patient_id FK
        datetime started_at
        datetime ended_at
        text summary
    }
    messages {
        uuid id PK
        uuid session_id FK
        string role
        text content
        datetime created_at
    }
    escalations {
        uuid id PK
        uuid patient_id FK
        uuid session_id FK
        text reason
        string urgency
        string status
        datetime created_at
    }

    patients ||--o{ sessions : "heeft"
    sessions ||--o{ messages : "bevat"
    patients ||--o{ escalations : "heeft"
    sessions ||--o{ escalations : "gekoppeld aan"
```

---

## Environment variables

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `DATABASE_URL` | — | `postgresql://user:pass@host:5432/db` |
| `LLM_PROVIDER` | `ollama` | LLM backend (`ollama`) |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | `gemma4:e4b` | Modelnaam |
| `CHROMA_HOST` | `chromadb` | ChromaDB host (voor MCP-server) |
| `CHROMA_PORT` | `8000` | ChromaDB poort |

---

## API endpoints

| Methode | Path | Beschrijving |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/patients/` | Alle patiënten |
| `POST` | `/patients/` | Nieuwe patiënt aanmaken |
| `GET` | `/patients/{id}` | Één patiënt |
| `PATCH` | `/patients/{id}` | Patiënt bijwerken (partial) |
| `DELETE` | `/patients/{id}` | Patiënt verwijderen (cascade) |
| `POST` | `/chat/{patient_id}` | Bericht sturen aan Anna |

Interactieve docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Seeder

`seed.py` vult de database met 3 gesimuleerde patiënten × 10 sessies voor demo en portfolio.

| Patiënt | Scenario |
|---|---|
| Maria Jansen | Stabiel — goede medicatietrouw, geen escalatie |
| Hendrik de Boer | Geleidelijke verslechtering over 10 weken → escalatie (medium) |
| Liesbeth van Dam | Plotselinge urgentie tijdens sessie 10 → escalatie (high) |

### Uitvoeren

**Via Docker (aanbevolen):**

```bash
docker exec -it anna_remembers-backend-1 python seed.py
```

**Lokaal** (vereist `DATABASE_URL` als env var):

```bash
cd backend
DATABASE_URL=postgresql://anna:secret@localhost:5432/anna_remembers python seed.py
```

**Reset en opnieuw vullen:**

```bash
docker exec -it anna_remembers-backend-1 python seed.py --reset
```

`--reset` verwijdert de bestaande seeder-patiënten en maakt ze opnieuw aan. Handig na een schema-wijziging zonder volledig `down -v`.

### Wat de seeder aanmaakt

```
3 patiënten
├── Maria Jansen     (status: success)  10 sessies  0 escalaties
├── Hendrik de Boer  (status: warning)  10 sessies  1 escalatie (medium, acknowledged)
└── Liesbeth van Dam (status: urgent)   10 sessies  1 escalatie (high, open)

Totaal: 30 sessies · 60 berichten · 2 escalaties
```

Sessies lopen van **1 maart 2026** met een week tussenruimte per sessie, zodat de symptoomtrend-grafieken een realistisch patroon tonen.
