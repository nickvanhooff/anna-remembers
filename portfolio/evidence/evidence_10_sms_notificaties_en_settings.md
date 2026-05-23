# Evidence 10 — SMS-escalatienotificaties en instellingenpagina

**Type:** Architectuurdiagrammen (C2 + C3) + implementatiebewijs
**Datum:** 2026-05-23
**Hoort bij:** Stappen 64–71 in STAPPEN.md
**Commits:** `f8f6278` · `6e88280` · `331a7a5` · `74fec3e` · `c59f622` · `eed16ef` · `6c9cce7`

---

## C2 — Container (bijgewerkt: Twilio vervangt Email/Slack)

```mermaid
C4Container
    title Anna Remembers — Containers (mei 2026)

    Person(zorgverlener, "Zorgverlener", "Dashboard + instellingen beheren")
    Person(patient, "Patiënt", "Wekelijkse check-in via chat")

    Container_Boundary(anna, "Anna Remembers") {
        Container(frontend, "Frontend", "Next.js 15", "Dashboard incl. instellingenpagina — poort 3001")
        Container(backend, "Backend API", "FastAPI", "Bedrijfslogica, escalaties, SMS — poort 8000")
        Container(mcp, "MCP Server", "fastmcp", "RAG + geheugen + escalatie-tool — poort 8001")
        ContainerDb(postgres, "PostgreSQL", "PostgreSQL 16", "Patiënten, sessies, escalaties, settings — poort 5432")
        ContainerDb(chroma, "ChromaDB", "Vector store", "Patiëntgeheugen — poort 8002")
    }

    System_Ext(ollama, "Ollama", "LLM + embeddings — poort 11434")
    System_Ext(twilio, "Twilio SMS API", "SMS-gateway — cloud")

    Rel(zorgverlener, frontend, "Gebruikt", "HTTPS")
    Rel(patient, frontend, "Check-in", "HTTPS")
    Rel(frontend, backend, "REST API", "HTTP")
    Rel(backend, postgres, "CRUD", "SQL")
    Rel(backend, ollama, "Chat + embeddings", "HTTP")
    Rel(backend, mcp, "MCP-tools", "SSE")
    Rel(backend, twilio, "SMS bij escalatie", "HTTPS")
    Rel(mcp, chroma, "Vectoren", "HTTP")
    Rel(mcp, ollama, "Embeddings", "HTTP")
```

---

## C3 — Component (Backend: SMS-notificatieflow)

```mermaid
C4Component
    title Backend API — SMS Escalatienotificatie

    Container_Boundary(backend, "Backend API (FastAPI)") {
        Component(router, "Escalations Router", "routers/escalations.py", "POST /escalations/ — opslaan + BackgroundTask registreren")
        Component(bg, "FastAPI BackgroundTasks", "FastAPI intern", "Voert SMS-taak uit ná HTTP-response")
        Component(notif, "Notification Service", "services/notification.py", "Controleert DB-instelling, bouwt SMS, verstuurt")
        Component(settings_router, "Settings Router", "routers/settings.py", "GET /settings + PUT /settings/{key}")
    }

    ContainerDb(postgres, "PostgreSQL", "", "escalations + settings tabellen")
    System_Ext(mcp, "MCP Server", "Roept POST /escalations/ aan")
    System_Ext(twilio, "Twilio SMS API", "")
    System_Ext(frontend, "Frontend", "Instellingenpagina")

    Rel(mcp, router, "POST /escalations/", "HTTP")
    Rel(router, postgres, "INSERT escalation", "SQL")
    Rel(router, bg, "add_task(send_sms_notification)")
    Rel(bg, notif, "Voert uit na response")
    Rel(notif, postgres, "SELECT twilio_sms_enabled", "SQL")
    Rel(notif, postgres, "UPDATE notification_status", "SQL")
    Rel(notif, twilio, "messages.create()", "HTTPS")
    Rel(frontend, settings_router, "GET + PUT /settings", "HTTP")
    Rel(settings_router, postgres, "SELECT / UPDATE settings", "SQL")
```

---

## Ontwerpbeslissingen

| Beslissing | Keuze | Reden |
|---|---|---|
| Notificatiekanaal | Twilio SMS | Gratis trial, realistisch voor zorgdomein |
| Timing SMS-aanroep | FastAPI BackgroundTask | API blokkeert niet op Twilio-latency |
| Instelling opslaan | Key-value `settings` tabel | Live aan/uit zonder herstart; uitbreidbaar |
| Frontend toggle | Optimistic update | Directe feedback, rollback bij fout |

---

## Testbewijs

| Test | Resultaat |
|---|---|
| SMS-tekst URGENT bij `high` | ✅ |
| SMS-tekst Aandacht bij `low/medium` | ✅ |
| Overgeslagen zonder Twilio-config | ✅ |
| `notification_status = "sent"` na succesvolle SMS | ✅ |
| `notification_status = "failed"` bij Twilio-fout | ✅ |
| Overgeslagen als `twilio_sms_enabled = false` | ✅ |
| GET /settings geeft key-value dict | ✅ |
| PUT /settings/{key} wijzigt waarde | ✅ |
| PUT met onbekende key → 404 | ✅ |

**Totaal: 9/9 notification tests + 3/3 settings tests geslaagd**

---

## Bronnen

1. Twilio. (z.d.). *Python helper library quickstart*. https://www.twilio.com/docs/libraries/python
2. Tiangolo, S. (z.d.). *Background tasks*. FastAPI Documentation. https://fastapi.tiangolo.com/tutorial/background-tasks/
3. Brown, S. (2018). *The C4 model for visualising software architecture*. c4model.com
