# Evidence 07 — C3 & C4: Chat-pipeline van gebruikersinvoer tot respons

**Type:** architectuurdiagram
**Datum:** 2026-05-17
**Hoort bij:** Stap 42, DL4 (escalatiedetectie — gelaagde architectuur)
**Commit:** (nog niet gecommit)

---

## Level 3 — Component (Backend API, chat-package)

Toont de componenten binnen de FastAPI backend die bij elke chat-aanvraag betrokken zijn.
De chat-router is na stap 42 opgesplitst in vier interne modules.

```mermaid
C4Component
    title Backend API — Componenten (chat-pipeline)

    Container_Boundary(backend, "Backend API (FastAPI)") {
        Component(routes, "_routes.py", "FastAPI router", "Ontvangt POST /chat/{patient_id}, orkestreert de volledige pipeline")
        Component(escalation, "_escalation.py", "Escalatiedetectie", "Laag 0 (keywords, synchroon) + Laag 1 (qwen via Ollama, BackgroundTask)")
        Component(prompts, "_prompts.py", "Prompt builders", "build_system_prompt() combineert patiëntdata, RAG-geheugen en medische samenvatting")
        Component(summary, "_summary.py", "Samenvattingstaak", "trigger_summary_update() elke N berichten als BackgroundTask")
        Component(llm_svc, "LLM Service", "services/llm.py", "Provider-agnostische LLM-aanroep: Ollama / Groq / Anthropic / OpenRouter")
        Component(mcp_client, "MCP Client", "services/mcp_client.py", "HTTP-client naar MCP Server: store_memory, recall_context, escalate_to_human")
        ComponentDb(pg, "PostgreSQL", "SQLAlchemy ORM", "Sessies, berichten, escalaties lezen en schrijven")
    }

    Container_Boundary(mcp, "MCP Server") {
        Component(mem_tools, "Memory Tools", "tools/memory.py", "RAG: ChromaDB embed + query")
        Component(esc_tool, "Escalation Tool", "tools/escalation.py", "escalate_to_human — schrijft naar DB en verstuurt notificatie")
    }

    System_Ext(ollama_chat, "Ollama (chat-LLM)", "gemma4:e2b of cloud-provider")
    System_Ext(ollama_esc, "Ollama (qwen2.5:0.5b)", "Laag 1 classificatie")
    Container_Boundary(fe, "Frontend (Next.js)") {
        Component(chat_ui, "Chat-scherm", "components/chat", "Verstuurt bericht, toont respons")
    }

    Rel(chat_ui, routes, "POST /chat/{patient_id}", "HTTP/JSON")
    Rel(routes, mcp_client, "recall_context + store_memory", "asyncio.gather()")
    Rel(mcp_client, mem_tools, "MCP-protocol", "SSE/HTTP")
    Rel(routes, escalation, "layer0_check(tekst)", "synchroon, vóór LLM")
    Rel(routes, prompts, "build_system_prompt(patient, memories)", "")
    Rel(routes, llm_svc, "llm.chat(history, system)", "await")
    Rel(llm_svc, ollama_chat, "POST /api/chat", "HTTP")
    Rel(routes, pg, "sessie ophalen, berichten opslaan", "SQL")
    Rel(routes, summary, "BackgroundTask (elke N berichten)", "async")
    Rel(routes, escalation, "layer1_classify() als BackgroundTask", "async, ná response")
    Rel(escalation, ollama_esc, "POST /api/chat (qwen2.5:0.5b)", "HTTP, timeout 90s")
    Rel(escalation, mcp_client, "escalate_to_human()", "als Laag 0 of Laag 1 triggert")
    Rel(mcp_client, esc_tool, "MCP-protocol", "SSE/HTTP")
```

---

## Level 4 — Code (volgorde van aanroepen binnen één chat-request)

Toont de exacte aanroepvolgorde binnen `_routes.py → chat()` voor één POST-aanvraag.
Grijs = loopt parallel via `asyncio.gather()`. Stippellijn = BackgroundTask (loopt ná de HTTP-response).

```mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant R as _routes.py (chat)
    participant DB as PostgreSQL
    participant MCP as MCP Client
    participant L0 as _escalation: layer0_check
    participant PR as _prompts: build_system_prompt
    participant LLM as LLM Service
    participant BG_S as BackgroundTask: summary
    participant BG_L1 as BackgroundTask: layer1_classify

    FE->>R: POST /chat/{patient_id} {content}
    R->>DB: patiënt ophalen (db.get)
    R->>DB: open sessie ophalen of aanmaken
    R->>DB: user-bericht opslaan

    par asyncio.gather
        R->>MCP: recall_context(query, patient_id, limit=5)
        R->>MCP: store_memory(content) [alleen als geen vraag]
    end

    R->>DB: recente berichten ophalen (limit=6)
    R->>L0: layer0_check(content)
    Note over L0: deterministisch, synchroon<br/>keywords HIGH en MEDIUM

    R->>PR: build_system_prompt(patient, memories)
    Note over PR: combineert patiëntdata +<br/>RAG-dossier + medische samenvatting

    R->>LLM: llm.chat(history, system_prompt)
    LLM-->>R: raw_response

    R->>DB: assistant-bericht opslaan

    alt Laag 0 getriggerd
        R->>MCP: escalate_to_human(urgency=high/medium) [synchroon]
    else Laag 0 niet getriggerd
        R-->>BG_L1: layer1_classify(patient_id, content) [BackgroundTask]
    end

    R-->>BG_S: trigger_summary_update(patient_id) [BackgroundTask, elke N berichten]

    R-->>FE: MessageResponse {content, escalation_triggered, summary_update_triggered}

    Note over BG_L1: Loopt ná response — qwen2.5:0.5b<br/>classificeert, escaleert indien nodig
    Note over BG_S: Loopt ná response — hergenereert<br/>medical_summary in JSON
```

---

## Toelichting

| Stap | Wat | Waarom zo |
|---|---|---|
| 1–3 | Sessie + bericht opslaan vóór LLM | Altijd persisteren, ook bij LLM-fout |
| 4 | `asyncio.gather` voor RAG + store | Beide MCP-aanroepen zijn onafhankelijk; parallel bespaart ~200–400 ms |
| 5 | `layer0_check` vóór LLM | Kritieke keywords hoeven niet door LLM bevestigd te worden; sneller en deterministisch |
| 6 | `build_system_prompt` combineert drie blokken | Patiëntdata (statisch) + RAG-dossier (semantisch) + samenvatting (longitudinaal) |
| 7 | LLM-aanroep | Domineert latency (~500–3000 ms); rest is ruis |
| 8 | Laag 0 → synchroon escaleren | Hoge urgentie mag response niet blokkeren, maar wel vóór teruggeven |
| 9 | Laag 1 als BackgroundTask | Qwen-aanroep kan 1–90 s duren; mag response niet vertragen |
| 10 | Samenvatting als BackgroundTask | LLM-aanroep voor samenvatting hoort niet in de gebruikerslatency |

---

## Bronnen

1. Brown, S. (2018). *The C4 model for visualising software architecture*. c4model.com
2. FastAPI. (2024). *Background Tasks*. fastapi.tiangolo.com/tutorial/background-tasks
