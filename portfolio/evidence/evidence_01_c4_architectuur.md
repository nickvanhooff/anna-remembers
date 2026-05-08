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

    Person(user, "Zorgverlener", "Bekijkt dashboard en patiëntgesprekken")

    System_Boundary(anna, "Anna Remembers") {
        System(app, "Anna Remembers", "AI-gezondheidsassistent voor hartfalenpatiënten")
    }

    System_Ext(ollama, "Ollama", "Lokale LLM en embedding model")
    System_Ext(notif, "Email / Slack", "Escalatie-notificaties")

    Rel(user, app, "Gebruikt")
    Rel(app, ollama, "Chat en vectorembeddings")
    Rel(app, notif, "Stuurt alerts bij escalatie")
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

## Bronnen

1. Brown, S. (2018). *The C4 model for visualising software architecture*. c4model.com
