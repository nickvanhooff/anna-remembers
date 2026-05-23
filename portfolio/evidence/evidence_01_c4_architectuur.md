# Evidence 01 — C4 Architectuurdiagrammen

**Type:** architectuurdiagram
**Datum:** 2026-05-08
**Hoort bij:** Stap 10, DL2 (embedding model keuze)
**Commit:** ea89e9a

---

## Level 1 — System Context

```mermaid
C4Context
    title Anna Remembers — System Context

    Person(zorgverlener, "Zorgverlener", "Beheert patiënten en escalaties")
    Person(patient, "Patiënt", "Wekelijkse check-in via chat of stem")

    System(app, "Anna Remembers", "AI-gezondheidsassistent voor hartfalenpatiënten")

    System_Ext(ai, "AI (Ollama / Cloud LLM)", "Lokale of cloud taalmodellen")
    System_Ext(twilio, "Twilio SMS", "Notificaties bij escalaties")

    Rel(zorgverlener, app, "Gebruikt")
    Rel(patient, app, "Check-in")
    Rel(app, ai, "Chat en embeddings")
    Rel(app, twilio, "SMS bij urgentie")
```

---

## Level 2 — Container

```mermaid
C4Container
    title Anna Remembers — Containers

    Person(user, "Zorgverlener", "")

    Container_Boundary(anna, "Anna Remembers") {
        Container(frontend, "Frontend", "Next.js 15", "Dashboard — poort 3000")
        Container(backend, "Backend API", "FastAPI", "Bedrijfslogica — poort 8000")
        Container(mcp, "MCP Server", "fastmcp", "RAG + geheugen — poort 8001")
        ContainerDb(postgres, "PostgreSQL", "PostgreSQL 16", "Patiënten, sessies, escalaties — poort 5432")
        ContainerDb(chroma, "ChromaDB", "Vector store", "Patiëntgeheugen — poort 8002")
    }

    System_Ext(ollama, "Ollama", "gemma4:e4b (chat) + bge-m3 (embed) — poort 11434")
    System_Ext(notif, "Email / Slack", "Escalatie")

    Rel(user, frontend, "Gebruikt", "HTTPS")
    Rel(frontend, backend, "REST", "HTTP")
    Rel(backend, postgres, "CRUD", "SQL")
    Rel(backend, ollama, "Chat", "HTTP")
    Rel(backend, mcp, "MCP-tools", "SSE")
    Rel(mcp, chroma, "Vectoren lezen/schrijven", "HTTP")
    Rel(mcp, ollama, "Embeddings", "HTTP")
    Rel(mcp, notif, "Escalatie-alert", "HTTP")
```

---

## Level 3 — Component (MCP Server)

```mermaid
C4Component
    title MCP Server — Componenten

    Container_Boundary(mcp, "MCP Server") {
        Component(server, "FastMCP Server", "main.py", "Tool-registratie en SSE-transport")
        Component(memory, "Memory Tools", "tools/memory.py", "store_memory en recall_context")
        Component(embed, "OllamaEmbeddingProvider", "services/embedding.py", "Tekst naar 1024-dim vector")
        Component(db, "ChromaDB Client", "chromadb SDK", "Vectoren opslaan en zoeken")
    }

    System_Ext(fastapi, "FastAPI Backend", "Aanroeper via MCP-protocol")
    System_Ext(ollama, "Ollama (bge-m3)", "Poort 11434")
    System_Ext(chromadb, "ChromaDB", "Poort 8002")

    Rel(fastapi, server, "store_memory / recall_context", "SSE")
    Rel(server, memory, "Delegeert tool-aanroepen")
    Rel(memory, embed, "embed(tekst)")
    Rel(embed, ollama, "POST /api/embed", "HTTP")
    Rel(memory, db, "add / query")
    Rel(db, chromadb, "Vectoren", "HTTP")
```

---

## Level 2 bijgewerkt — Container (alle Docker services, mei 2026)

Volledig overzicht van de Docker Compose services zoals ze draaien in productie/demo.

```mermaid
C4Container
    title Anna Remembers — Docker Compose Services (mei 2026)

    Person(zorgverlener, "Zorgverlener", "Beheert patiënten, bekijkt escalaties")
    Person(patient, "Patiënt", "Voert wekelijkse check-in uit")

    Container_Boundary(anna, "Anna Remembers (Docker Compose)") {

        Container_Boundary(custom, "Custom Services") {
            Container(frontend, "Frontend", "Next.js 15", "Dashboard UI — poort 3001 (lokaal)")
            Container(backend, "Backend API", "FastAPI / Python", "Bedrijfslogica, chat, escalaties — poort 8000")
            Container(mcp, "MCP Server", "fastmcp / Python", "RAG, geheugen, escalatie-tool — poort 8001")
        }

        Container_Boundary(ai, "AI & Spraak") {
            Container(ollama, "Ollama", "ollama/ollama + GPU", "LLM (gemma4:e2b) + embeddings (bge-m3) — poort 11434")
            Container(xtts, "XTTS Bridge", "Coqui XTTS v2 + GPU", "Nederlandse stemkloning — poort 5006")
            Container(piper_bridge, "Piper HTTP Bridge", "Python wrapper", "HTTP-interface voor Piper — poort 5005")
            Container(piper, "Piper TTS", "linuxserver/piper", "Nederlandstalige TTS (nl_NL-ronnie) — poort 10200")
        }

        Container_Boundary(data, "Data") {
            ContainerDb(postgres, "PostgreSQL", "postgres:16", "Patiënten, sessies, escalaties, settings — poort 5432")
            ContainerDb(chroma, "ChromaDB", "chromadb/chroma", "Vectorgeheugen (RAG) — poort 8002")
        }

        Container(langfuse, "Langfuse", "Docker Compose apart", "LLM-tracing en observability — poort 3000")
    }

    System_Ext(twilio, "Twilio SMS API", "SMS bij escalaties — cloud")
    System_Ext(groq, "Groq / Anthropic / OpenRouter", "Cloud LLM providers (optioneel)")

    Rel(zorgverlener, frontend, "Gebruikt", "HTTPS")
    Rel(patient, frontend, "Check-in via chat + stem", "HTTPS")
    Rel(frontend, backend, "REST API", "HTTP")
    Rel(backend, postgres, "CRUD", "SQL")
    Rel(backend, mcp, "MCP-tools aanroepen", "SSE / HTTP")
    Rel(backend, ollama, "Chat + embeddings", "HTTP")
    Rel(backend, groq, "Cloud LLM (optioneel)", "HTTPS")
    Rel(backend, twilio, "SMS bij escalatie", "HTTPS")
    Rel(backend, piper_bridge, "TTS-syntheseverzoek", "HTTP")
    Rel(backend, xtts, "TTS met stemkloning", "HTTP")
    Rel(backend, langfuse, "LLM-traces sturen", "HTTP")
    Rel(mcp, chroma, "Vectoren lezen/schrijven", "HTTP")
    Rel(mcp, ollama, "Embeddings", "HTTP")
    Rel(mcp, postgres, "Symptoomtrends", "SQL")
    Rel(piper_bridge, piper, "Syntheseverzoek doorsturen", "HTTP")
```

---

## Level 2 — Opstartafhankelijkheden (Docker Compose)

```mermaid
graph TD
    postgres[(PostgreSQL)]
    chromadb[(ChromaDB)]
    ollama[Ollama GPU]
    ollama_init[ollama-init\nbge-m3 pull]
    backend[Backend API]
    mcp[MCP Server]
    piper[Piper TTS]
    piper_bridge[Piper HTTP Bridge]
    xtts[XTTS Bridge GPU]

    postgres -->|healthy| backend
    postgres -->|healthy| mcp
    ollama -->|started| backend
    ollama -->|started| mcp
    ollama -->|started| ollama_init
    chromadb -->|started| mcp
    piper -->|started| piper_bridge
```

---

## Bronnen

1. Brown, S. (2018). *The C4 model for visualising software architecture*. c4model.com
