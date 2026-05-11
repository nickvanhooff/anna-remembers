# Design: Chat Endpoint — FastAPI ↔ MCP ↔ LLM

**Datum:** 2026-05-11  
**Issue:** Backend: Chat endpoint wiren (FastAPI ↔ MCP ↔ LLM)  
**Status:** Goedgekeurd, klaar voor implementatie

---

## Doelstelling

`POST /chat/{patient_id}` volledig werkend maken:  
bericht ontvangen → RAG-context ophalen → LLM aanroepen → antwoord opslaan.

**Acceptatiecriteria:**
- `recall_context` aangeroepen vóór LLM-call
- `store_memory` na elk patiëntbericht (`source=patient_stated`)
- LLM-aanroep via `services/llm.py` (provider-agnostisch)
- Ollama + gemma4:e4b geeft antwoord terug
- Sessie + berichten opgeslagen in PostgreSQL

---

## Architectuurkeuze: MCP communicatie via SSE

De MCP server draait als apart proces op poort 8001 (SSE transport, via `fastmcp`).  
FastAPI praat via `fastmcp.Client` over het echte MCP-protocol — exact zoals de architectuurregels in CLAUDE.md voorschrijven.

**Verworpen alternatieven:**
- HTTP REST wrapper op MCP server — dupliceert de interface, breekt architectuurregel
- Directe import van MCP functies in FastAPI — verboden per CLAUDE.md ("apart proces")

---

## Volledige chat-flow

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as FastAPI (chat.py)
    participant MCP as MCP Server (port 8001)
    participant Chroma as ChromaDB
    participant PG as PostgreSQL
    participant LLM as Ollama (gemma4:e4b)

    FE->>BE: POST /chat/{patient_id} {content}
    BE->>PG: Haal patiënt op
    BE->>PG: Haal/maak sessie + sla user message op

    par RAG context ophalen
        BE->>MCP: recall_context(query, patient_id, limit=5)
        MCP->>Chroma: vector search (bge-m3 embedding)
        Chroma-->>MCP: top-5 memories
        MCP-->>BE: [{content, source, distance}]
    and Geheugen opslaan
        BE->>MCP: store_memory(content, "patient_stated", patient_id, session_id)
        MCP->>Chroma: embed + insert
    end

    BE->>PG: Haal laatste 10 berichten op (conversation history)
    BE->>BE: Bouw system prompt (patiëntdata + RAG memories)
    BE->>LLM: chat(messages=history+user, system=prompt)
    LLM-->>BE: response_text

    BE->>PG: Sla assistant message op
    BE->>MCP: escalate_to_human() [stub]
    BE-->>FE: MessageResponse
```

### Latency breakdown

| Stap | Tijd |
|---|---|
| PostgreSQL queries | ~5ms |
| `recall_context` + `store_memory` (parallel) | ~100–150ms |
| LLM aanroep (gemma4:e4b) | 1.000–5.000ms |
| **Totaal** | **~1.1–5.2s** |

`recall_context` en `store_memory` draaien parallel via `asyncio.gather()` per CLAUDE.md architectuurregel.

---

## System prompt constructie

De system prompt bestaat uit drie lagen:

```
┌─────────────────────────────────────────────────────┐
│ LAAG 1 — Persona (statisch)                         │
│ "Je bent Anna, empathische AI-assistent voor        │
│  hartfalenpatiënten..."                             │
├─────────────────────────────────────────────────────┤
│ LAAG 2 — Patiëntcontext (uit PostgreSQL)            │
│ Naam, medicatieschema, notities                     │
├─────────────────────────────────────────────────────┤
│ LAAG 3 — RAG memories (uit ChromaDB, max 5)         │
│ "Relevante eerdere uitspraken van deze patiënt:"    │
│ - [patient_stated] "Afgelopen week meer kortademig" │
│ - [ai_inferred] "Loopt elke dag 20 minuten"         │
└─────────────────────────────────────────────────────┘
```

**Regels in de prompt:**
- Verzin nooit symptomen of medicatie die de patiënt niet heeft gemeld
- Refereer aan eerdere uitspraken als die relevant zijn
- Stel één gerichte vervolgvraag per response

De `source`-tag (`patient_stated` vs `ai_inferred`) staat expliciet in de prompt zodat het model weet welke herinneringen feiten zijn vs inferenties.

### Conversation history

Laatste **10 berichten** uit PostgreSQL (huidige sessie) worden als `messages`-lijst meegegeven aan de LLM. RAG-context zit in de system prompt, niet in de history.

---

## `mcp_client.py` — technisch ontwerp

```python
class MCPClient:
    def __init__(self, base_url: str): ...
    async def recall_context(self, query, patient_id, limit) -> list[dict]: ...
    async def store_memory(self, content, source, patient_id, session_id) -> str: ...
    async def get_symptom_trends(self, patient_id, weeks) -> dict: ...  # stub
    async def escalate_to_human(self, patient_id, reason, urgency) -> None: ...  # stub

def get_mcp_client() -> MCPClient:
    """FastAPI dependency — leest MCP_URL uit env."""
```

- Elke methode opent een korte SSE-verbinding via `fastmcp.Client`
- `get_mcp_client()` is een FastAPI `Depends()` dependency zodat de URL uit env komt
- Stubs (`get_symptom_trends`, `escalate_to_human`) zijn aanwezig voor latere implementatie

---

## C4 Diagrammen

### Level 1 — Systeemcontext

```mermaid
C4Context
    title Anna Remembers — Systeemcontext

    Person(zorgverlener, "Zorgverlener", "Ontvangt escalaties")
    Person(patient, "Patiënt", "Doet wekelijkse check-in via dashboard")

    System(anna, "Anna Remembers", "AI-gezondheidsassistent die symptoompatronen bijhoudt en escaleert")

    System_Ext(ollama, "Ollama", "Lokale LLM + embedding server (gemma4:e4b, bge-m3)")
    System_Ext(email, "Email / Slack", "Escalatiekanaal")

    Rel(patient, anna, "Stuurt berichten")
    Rel(anna, zorgverlener, "Escaleert bij risico")
    Rel(anna, ollama, "LLM-aanroepen + embeddings")
    Rel(anna, email, "Escalatieberichten")
```

### Level 2 — Containers

```mermaid
C4Container
    title Anna Remembers — Containers

    Person(patient, "Patiënt")

    Container(frontend, "Frontend", "Next.js 15", "Dashboard: chat, trends, escalaties")
    Container(backend, "FastAPI", "Python", "Business logic, chat endpoint, MCP client")
    Container(mcp, "MCP Server", "fastmcp Python", "Tools: store_memory, recall_context, trends, escalatie")
    ContainerDb(postgres, "PostgreSQL 16", "Database", "Patiënten, sessies, berichten, escalaties")
    ContainerDb(chroma, "ChromaDB", "Vector DB", "Semantisch geheugen per patiënt (bge-m3 embeddings)")
    System_Ext(ollama, "Ollama", "LLM + embedding server")

    Rel(patient, frontend, "Gebruikt", "HTTPS")
    Rel(frontend, backend, "REST API", "HTTP/JSON")
    Rel(backend, mcp, "MCP tools", "SSE / MCP protocol")
    Rel(backend, postgres, "Lezen/schrijven", "SQLAlchemy")
    Rel(mcp, chroma, "Vector search + insert", "HTTP")
    Rel(mcp, ollama, "Embeddings (bge-m3)", "HTTP")
    Rel(backend, ollama, "LLM chat (gemma4:e4b)", "HTTP")
```

### Level 3 — Componenten: FastAPI Backend

```mermaid
C4Component
    title FastAPI Backend — Componenten

    Container_Ext(frontend, "Frontend", "Next.js 15")
    Container_Ext(mcp, "MCP Server", "fastmcp")
    ContainerDb_Ext(postgres, "PostgreSQL 16")
    System_Ext(ollama, "Ollama")

    Container_Boundary(backend, "FastAPI Backend") {
        Component(chat_router, "chat.py", "APIRouter", "POST /chat/{patient_id} — volledige chat flow")
        Component(patients_router, "patients.py", "APIRouter", "CRUD voor patiënten")
        Component(llm_svc, "llm.py", "LLMProvider ABC", "Provider-agnostische LLM aanroep (OllamaProvider)")
        Component(mcp_client, "mcp_client.py", "MCPClient", "Roept MCP tools aan via SSE protocol")
        Component(db_svc, "database.py", "SQLAlchemy", "DB sessie dependency")
        Component(models, "models/", "SQLAlchemy ORM", "Patient, Session, Message, Escalation")
        Component(schemas, "schemas/", "Pydantic", "Request/response validatie")
    }

    Rel(frontend, chat_router, "POST /chat/{id}")
    Rel(frontend, patients_router, "GET/POST/PUT/DELETE /patients")
    Rel(chat_router, mcp_client, "recall_context, store_memory")
    Rel(chat_router, llm_svc, "chat(messages, system)")
    Rel(chat_router, db_svc, "session management")
    Rel(chat_router, models, "Message, ChatSession")
    Rel(mcp_client, mcp, "SSE / MCP protocol")
    Rel(llm_svc, ollama, "HTTP /api/chat")
    Rel(db_svc, postgres, "SQLAlchemy")
```

### Level 3 — Componenten: MCP Server

```mermaid
C4Component
    title MCP Server — Componenten

    Container_Ext(backend, "FastAPI Backend")
    ContainerDb_Ext(chroma, "ChromaDB")
    System_Ext(ollama, "Ollama")

    Container_Boundary(mcp_server, "MCP Server (fastmcp)") {
        Component(mcp_main, "main.py", "FastMCP app", "Registreert tools, start SSE server op poort 8001")
        Component(memory_tool, "tools/memory.py", "MCP Tool", "store_memory + recall_context (ChromaDB)")
        Component(trends_tool, "tools/trends.py", "MCP Tool", "get_symptom_trends — haalt symptoomdata op uit PostgreSQL")
        Component(escalation_tool, "tools/escalation.py", "MCP Tool", "escalate_to_human — stub, kanaal op urgency")
        Component(embedding_svc, "services/embedding.py", "EmbeddingProvider ABC", "OllamaEmbeddingProvider (bge-m3)")
    }

    Rel(backend, mcp_main, "MCP tool calls via SSE")
    Rel(mcp_main, memory_tool, "store_memory, recall_context")
    Rel(mcp_main, trends_tool, "get_symptom_trends")
    Rel(mcp_main, escalation_tool, "escalate_to_human")
    Rel(memory_tool, embedding_svc, "embed(text)")
    Rel(embedding_svc, ollama, "HTTP /api/embed (bge-m3)")
    Rel(memory_tool, chroma, "add + query")
```

---

## Escalatie — stub voor latere uitbreiding

`escalate_to_human` staat in de chat flow maar doet momenteel niets. De interface is:

```python
async def escalate_to_human(patient_id, reason, urgency) -> None:
    # urgency: "low" | "medium" | "high"
    # kanaal: email (low/medium) | Slack (high)
    pass  # stub — implementatie volgt
```

De methode staat in `MCPClient` zodat de chat router er al naar kan verwijzen zonder aanpassingen later.

---

## Bestanden die wijzigen

| Bestand | Wijziging |
|---|---|
| `backend/services/mcp_client.py` | Volledige implementatie van `MCPClient` klasse |
| `backend/routers/chat.py` | MCP-calls indraden, system prompt uitbreiden, history ophalen |
| `mcp-server/tools/escalation.py` | Nieuw bestand — stub implementatie |
| `mcp-server/main.py` | `escalate_to_human` tool registreren |

**Buiten scope van dit issue:**
- `mcp-server/tools/trends.py` — wordt aangemaakt in een volgend issue (get_symptom_trends). De C4 L3 diagram toont dit component al omdat het deel is van de uiteindelijke architectuur, maar de implementatie volgt later.
- `MCPClient.get_symptom_trends()` is een stub (pass) — de MCP server hoeft `trends.py` nog niet te hebben.
