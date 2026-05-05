# STAPPEN.md — Anna Remembers

Doorlopend bouwlogboek. Elke stap wordt direct na uitvoering toegevoegd.

---

## Stap 1 — 2026-05-03

**Wat:** Project opgezet: mappenstructuur aangemaakt, CLAUDE.md geschreven, .gitignore en README toegevoegd. Git repo geinitialiseerd en GitHub repo `anna-remembers` aangemaakt.

**Beslissingen:**
- Mapnaam `anna_remembers` (dubbele n, underscore) — consistent met bestaande semester_4 mappenstructuur
- Eigen git repo los van semester_4 repo — Anna Remembers is een zelfstandig project met eigen history
- GitHub repo naam: `anna-remembers` (koppelteken, GitHub conventie)

**Commit:** `fa9473a` — init: project scaffold — CLAUDE.md, README, portfolio structure

---

## Stap 2 — 2026-05-03

**Wat:** GitHub Project ingericht voor agile werken.

**Gedaan:**
- GitHub Project aangemaakt: "Anna Remembers" (project #3), gekoppeld aan de repo
- Labels aangemaakt: laag-labels (backend, frontend, mcp-server, infrastructure), portfolio-labels (evidence, decision-log) en LO1-LO7
- Status-kolommen ingesteld: To Do / In Progress / Review / Done
- Sprint iteration field: handmatig toe te voegen via de web UI (API ondersteunt dit niet)
- Board view: handmatig aan te maken via de web UI (zie instructies hieronder)

**Beslissingen:**
- 1 sprint = 1 week (3 werkdagen) — tempo past bij AI-assisted development
- Issues per architectuurlaag, niet per kleine subtaak
- LO-labels zodat beoordelaar direct ziet welke leeruitkomst een issue raakt
- evidence/decision-log labels als aparte takenlijst in het board

**Commit:** geen — alleen GitHub configuratie

---

## Stap 3 — 2026-05-04

**Wat:** Projectopzet-document (`project_opzet_ana_remembers.docx`) ingelezen en verwerkt in CLAUDE.md en GitHub issues.

**Wijzigingen:**
- CLAUDE.md uitgebreid met: poortoverzicht, 3 gesimuleerde patiënten (deliverable), exacte MCP tool-signatures, dashboard-schermen, PostgreSQL JSONB-vereiste, buiten-scope-lijst
- Issue #1 gecorrigeerd: ChromaDB draait op poort 8002 (niet 8000)
- Issue #4 uitgebreid: van "chat UI" naar volledig dashboard (patiëntbeheer, chat, symptoomtrends, escalatiebeheer)

**Beslissingen:**
- Buiten scope hard vastgelegd in CLAUDE.md: geen auth, geen TTS/STT, geen Twilio — zodat Claude daar nooit aan begint
- MCP tool-signatures exact vastgelegd zodat implementatie consistent is met het ontwerp

**Commit:** `48de1ae` — docs: enrich CLAUDE.md with deliverables, ports, tool signatures from project spec

---

## Stap 4 — 2026-05-04

**Wat:** Docker Compose setup gebouwd (issue #1 gesloten).

**Aangemaakt:**
- `docker-compose.yml` — 4 services: postgres, chromadb, backend, mcp-server
- `backend/Dockerfile` — met Alembic + uvicorn hot reload als CMD
- `backend/main.py` — minimale FastAPI app met `/health` endpoint
- `backend/requirements.txt`
- `backend/models/base.py` — SQLAlchemy DeclarativeBase voor Alembic
- `backend/alembic.ini` + `alembic/env.py` — Alembic leest DATABASE_URL uit omgeving
- `mcp-server/Dockerfile` + `main.py` — minimale fastmcp bootstrap
- `.env.example` — template voor lokale credentials

**Beslissingen:**
- Alembic gekozen boven init-script: versie-gecontroleerde schema-wijzigingen, rollback mogelijk, industry standaard voor FastAPI + PostgreSQL
- Hot reload via volume mount (`./backend:/app`) + `uvicorn --reload` — bij code-wijziging herstart server automatisch, geen rebuild nodig
- Alembic draait vóór uvicorn in de CMD (`alembic upgrade head && uvicorn ...`) — database is altijd up to date bij container-start
- ChromaDB intern op poort 8000, extern gemapped naar 8002 — intern netwerk gebruikt altijd de eigen poort

**Commit:** `8a1ce68` — feat: docker compose setup with postgres, chromadb, backend and mcp-server

---

## Stap 5 — 2026-05-04

**Wat:** Bug gefixed: `ModuleNotFoundError: No module named 'models'` bij backend-start.

**Oorzaak:** Alembic draait `env.py` vanuit de `alembic/` submap. Python zocht `models` relatief aan die map in plaats van aan de backend root (`/app`).

**Fix:** `sys.path.insert(0, ...)` toegevoegd aan `alembic/env.py` — voegt `/app` toe aan het Python-pad zodat `from models import Base` werkt.

**Resultaat na fix (`docker compose up --build`):**
- PostgreSQL 16 ✅ healthy op poort 5432
- ChromaDB ✅ draait, data persistent
- Backend ✅ Alembic uitgevoerd, uvicorn op poort 8000 met hot reload
- MCP Server ✅ FastMCP 3.2.4 op poort 8001 via SSE

**Commit:** `6c43f4d` — fix: add backend root to sys.path in alembic env.py

---

## Stap 7 — 2026-05-05

**Wat:** Backend scaffold voltooid (issue #2 gesloten).

**Aangemaakt:**
- `services/llm.py` — abstracte `LLMProvider` klasse + `OllamaProvider` (gemma4:e4b)
- `services/database.py` — SQLAlchemy sessie als FastAPI dependency
- `services/mcp_client.py` — stubs voor MCP-tools (issue #3)
- `models/` — Patient, Session, Message, Escalation met JSONB voor symptoomdata
- `schemas/` — Pydantic request/response modellen
- `routers/patients.py` — volledige CRUD
- `routers/chat.py` — chat endpoint met echte LLM-aanroep, MCP-context volgt in issue #3
- `alembic/versions/0001_initial_schema.py` — eerste migratie, alle 4 tabellen
- `docker-compose.yml` — Ollama service toegevoegd met NVIDIA GPU (RTX 4050, 6GB VRAM)

**Beslissingen:**
- Ollama als LLM-provider: gemma4:e4b, lokaal via Docker met GPU passthrough
- Abstracte LLMProvider klasse: wisselen van provider = één nieuwe subklasse, rest van de codebase raakt niet
- Chat router roept LLM al echt aan, MCP-context (herinneringen, trends) volgt in issue #3
- NVIDIA runtime was al beschikbaar in Docker (WSL2) — geen extra installatie nodig

**Resultaat na `docker compose up --build`:**
- Ollama ✅ CUDA detected: RTX 4050 Laptop GPU, 5.3 GiB available VRAM
- Alembic migratie ✅ `Running upgrade → 0001, initial schema`
- Backend ✅ uvicorn draait op poort 8000

**Commit:** `aad405d` — feat: fastapi scaffold with models, schemas, routers, llm service and alembic migration

---

## Stap 6 — 2026-05-05

**Wat:** GitHub Actions CI workflow aangemaakt.

**Gedaan:**
- `.github/workflows/ci.yml` toegevoegd
- Triggert op elke push naar `main`
- Bouwt backend en mcp-server Docker images
- Eerste run geslaagd in 46 seconden

**Beslissingen:**
- Simpel gehouden: alleen build-check, geen test-containers opgestart
- Node.js 24 geforceerd via env var om deprecation warning te onderdrukken

**Commit:** `c331c30` — ci: add github actions workflow to build docker images on push to main
