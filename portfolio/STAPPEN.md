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

## Stap 8 — 2026-05-05

**Wat:** Decision log DL1 geschreven — vector database keuze ChromaDB vs pgvector.

**Aanleiding:** twijfel over nut van ChromaDB naast PostgreSQL. Na vergelijking op projectschaal (20-30 patiënten, 100+ sessies ≈ 45.000 vectoren) en leerdoel bewust gekozen voor ChromaDB.

**Beslissing:** ChromaDB houden — pgvector presteert technisch identiek op deze schaal, maar ChromaDB maakt de RAG-pipeline expliciet zichtbaar. Beter voor LO1 en LO4.

**Commit:** zie git log — docs: add DL1 vector database decision log

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

---

## Stap 9 — 2026-05-08

**Wat:** CLAUDE.md bijgewerkt met huidige projectstaat en bekende beslissingen.

**Gedaan:**
- Tabel "Bekende beslissingen" uitgebreid: LLM-provider (Ollama + gemma4:e4b), Alembic-keuze, DL1-referentie voor ChromaDB toegevoegd
- Embedding model als open punt gemarkeerd (moet beslist worden vóór MCP-server implementatie)
- Sectie "Huidige bouwstaat" toegevoegd: overzicht van gesloten issues (#1, #2, #6, #7, #9) en open issues (#3, #4, #5) met aanbevolen vervolgvolgorde

**Beslissingen:**
- Embedding model nog niet vastgelegd — dit wordt DL2 vóór implementatie van `store_memory` en `recall_context` in de MCP-server
- Aanbevolen volgorde: DL2 (embedding model) → MCP-server tools → backend chat-router met echte MCP-context → frontend

**Commit:** geen — alleen documentatie bijgewerkt

---

## Stap 10 — 2026-05-08

**Wat:** Embedding model gekozen en geïmplementeerd (DL2).

**Gedaan:**
- `services/embedding.py` — `EmbeddingProvider` ABC, `OllamaEmbeddingProvider`, `EmbeddingUnavailableError`
- `tools/memory.py` — `store_memory` en `recall_context` met ChromaDB
- `main.py` — tools geregistreerd als MCP tools
- `docker-compose.yml` — `ollama-init` service toegevoegd voor `bge-m3` pull
- 7 unit tests geschreven (TDD)

**Beslissingen:**
- bge-m3 gekozen: meertalig state-of-the-art, 8192-token context, past op RTX 4050 via Ollama model-swapping
- Embedding in MCP-server: RAG-laag blijft volledig in MCP, FastAPI raakt ChromaDB niet
- Provider-agnostisch patroon: wisselen = één nieuwe subklasse in embedding.py

**Commits:**
- `a33ca43` — EmbeddingProvider ABC + OllamaEmbeddingProvider + tests
- `d6b6763` — store_memory + recall_context tools met ChromaDB
- `63a14d7` — MCP tools geregistreerd in main.py
- `3b5c047` — ollama-init service + embedding env vars in docker-compose

---

## Stap 11 — 2026-05-08

**Wat:** DL2 decision log en evidence geschreven voor embedding model keuze.

**Gedaan:**
- `portfolio/decision-logs/DL2_embedding_model_keuze.md` — volledige decision log: onderzoeksvraag, succescriteria, keuze bge-m3 onderbouwd, DOT-methode, BEIR-NL ranking gecorrigeerd naar #6
- `portfolio/evidence/evidence_02_embedding_model_vergelijking.md` — vergelijkingstabel drie kandidaten, BEIR-NL screenshot, uitleg model-swapping, DOT-verantwoording
- `portfolio/evidence/images/huggingface_mteb_leaderboard_BEIR-NL.png` — screenshot leaderboard als bewijs

**Beslissingen:**
- Succescriterium aangepast: niet "top-5" maar "hoogst gerankt lokaal beschikbaar model op BEIR-NL" — de 5 modellen erboven zijn niet in Ollama of hebben te korte context
- Provider-agnostisch patroon expliciet gedocumenteerd als toekomstbestendig: overstap naar cloud provider = één nieuwe subklasse + ChromaDB opnieuw inrichten

**Commit:** `3b156ad` — docs: add DL2 embedding model decision log and evidence

---

## Stap 12 — 2026-05-09

**Wat:** Issue #3 gesloten, twee nieuwe issues aangemaakt voor openstaande MCP tools.

**Gedaan:**
- Issue #3 gesloten — acceptatiecriteria gehaald (store_memory + recall_context + source tags + poort 8001)
- Issue #13 aangemaakt: `get_symptom_trends` — PostgreSQL week-aggregatie over symptoomdata
- Issue #14 aangemaakt: `escalate_to_human` — stub notificatie + opslaan in escalations tabel
- Beide issues op Iteratie 2 gezet in het project board

**Beslissingen:**
- get_symptom_trends en escalate_to_human losgemaakt uit #3: andere technologie (PostgreSQL vs ChromaDB), aparte scope
- Iteratie 2 (start 2026-05-11) — past bij de aanbevolen bouwvolgorde in CLAUDE.md

---

## Stap 13 — 2026-05-09

**Wat:** Frontend project aangemaakt en UI-library gekozen voor Issue #4.

**Gedaan:**
- Next.js 15 project aangemaakt via `npx create-next-app@latest` in `frontend/`
- TypeScript strict mode, Tailwind CSS, App Router ingeschakeld
- Monorepo optie: **N** — Anna Remembers heeft al een monorepo op het hogere niveau (`anna_remembers/`)
- shadcn/ui geïnitialiseerd via `npx shadcn@latest init`

**Beslissingen:**
- **shadcn/ui** gekozen als UI-library — componenten worden gekopieerd naar eigen codebase (`components/ui/`), volledige controle zonder override-hacks
- Alternatief Stitch/Claude Code `/ui` bewust afgewezen: genereert UI maar leert de onderliggende patronen (Radix UI, Tailwind) niet — minder waarde voor portfolio en werkveld
- MUI/Ant Design afgewezen: meer overkill, theming is complexer, minder gebruikelijk in Next.js App Router projecten
- shadcn `Chart` component gebruikt voor symptoomtrends — installeert Recharts als peer dependency

**Componenten per scherm:**
- Patiëntbeheer: `Table`, `Dialog`, `Form`, `Input`, `Button`
- Chat: `ScrollArea`, `Input`, `Button`, `Avatar`
- Symptoomtrends: `Card` + `Chart` (Recharts)
- Escalatiebeheer: `Table`, `Badge`, `Select`, `Button`

**Commit:** nog niet — setup fase

---

## Stap 14 — 2026-05-10

**Wat:** shadcn/ui componenten geïnstalleerd voor alle vier dashboard-schermen.

**Gedaan:**
- `npx shadcn@latest add` uitgevoerd voor alle benodigde componenten
- Geïnstalleerd: `avatar`, `badge`, `button`, `card`, `dialog`, `alert-dialog`, `input`, `label`, `select`, `separator`, `scroll-area`, `sidebar`, `table`, `tabs`, `textarea`, `tooltip`, `sonner` + `recharts` als peer dependency
- shadcn style: `radix-nova` (warm neutrale kleuren, rounded-lg standaard)
- Icon library: `lucide-react`

**Beslissingen:**
- shadcn `Chart` component niet gebruikt — Recharts direct geïmporteerd voor meer controle over assen en tooltip styling
- `sonner` gekozen voor toasts: geen wrapper-setup nodig, werkt out-of-the-box met `toast()` call

**Commit:** `9960be6` / `27ce596` / `df8e4ec` — add all components needed

---

## Stap 15 — 2026-05-10

**Wat:** Design system gemaakt met Claude Design (claude.ai/design) voor de Anna Remembers dashboard-look.

**Gedaan:**
- Design opgezet op claude.ai/design met de volgende specificaties:
  - Sage-teal als primaire kleur (healthcare, rustig, professioneel)
  - Warme neutrale achtergronden (niet koud grijs)
  - Semantische statuskleuren: success / warning / urgent / info — elk met een zachte achtergrond-variant (soft-bg/soft-fg) voor badges en kaarten
  - shadcn/ui als basis — alleen kleuren, typografie en spatiepatronen aanpassen, componenten zelf niet herontwerpen
- Design handoff verkregen (HTML/CSS/JSX prototype)

**Beslissingen:**
- Geist font (Next.js standaard) behouden — past bij de sage-teal kleurpalette en is al geconfigureerd
- Semantische statuskleuren als CSS variabelen op `:root` — niet als Tailwind utilities — zodat ze direct bruikbaar zijn via `style={}` props zonder extra class-mapping
- Soft-bg/soft-fg patroon: elke status heeft een gedempte achtergrondkleur + een contrast-kleur voor de tekst. Dit maakt StatusBadge-achtige componenten mogelijk zonder hardcoded hex-waarden

---

## Stap 16 — 2026-05-10

**Wat:** Volledige Next.js 15 frontend geïmplementeerd — alle vier dashboard-schermen, design tokens, mock data en API-wrapper.

**Gedaan:**
- `app/globals.css` — design tokens geïntegreerd: sage-teal primair `oklch(0.48 0.07 185)`, warme achtergrond, semantische statuskleuren (success/warning/info/destructive met soft-bg/soft-fg varianten), 5 chart-kleuren, sidebar tokens. Dark mode toegevoegd.
- `app/layout.tsx` — Geist font, `ThemeProvider`, `Toaster` (sonner), `TooltipProvider`
- `app/page.tsx` — redirect naar `/patients`
- `types/index.ts` — TypeScript interfaces: `Patient`, `Message`, `Session`, `Escalation`, `TrendPoint`, `PatientStatus`
- `lib/mock-data.ts` — seed data voor 6 patiënten, 2 chatsessies, 5 escalaties, 28 trend-datapunten
- `lib/api.ts` — API-wrapper met mock-returns en TODO-comments voor echte FastAPI-calls
- `lib/utils.ts` — `fmtDate()` en `fmtTime()` hulpfuncties
- `components/dashboard/status-badge.tsx` — custom badge die CSS variabelen gebruikt (shadcn Badge variants dekken success/warning/info niet)
- `components/dashboard/dashboard-sidebar.tsx` — sidebar met navigatie, open escalatie badge, gebruikersvoettekst
- `components/dashboard/shell.tsx` — `SidebarProvider` wrapper
- `app/(dashboard)/layout.tsx` — route group layout met DashboardShell
- `components/patients/patients-screen.tsx` — CRUD: Table, Dialog (toevoegen/bewerken), AlertDialog (verwijderen), zoeken, filteren op status
- `components/chat/chat-screen.tsx` — sessierail, chat-bubbels (ScrollArea + Avatar), composer (Textarea + Button), typing-indicator, koppeling aan `sendMessage()` uit api.ts
- `components/trends/trends-screen.tsx` — 5 KPI-tiles met custom SVG Sparkline, Recharts LineChart/BarChart per geselecteerd symptoom, observatieblok
- `components/escalations/escalations-screen.tsx` — Table met urgentie/status badges, DetailDialog met Anna's redenering en klinische notitie

**TypeScript-fixes:**
- `NavItem` interface toegevoegd in sidebar — `badge?` optioneel — zodat TypeScript geen foutmelding geeft op het laatste array-element
- Recharts Tooltip formatter: `Number(v).toFixed()` in plaats van `(v: number)` — Recharts typt de waarde als `ValueType | undefined`

**Beslissingen:**
- Feature-based componentstructuur: `components/patients/`, `components/chat/` etc. — dunne `page.tsx` files, alle logica in de schermcomponent
- Mock data + API wrapper patroon: frontend werkt volledig offline, koppeling aan FastAPI = één TODO per functie vervangen
- Recharts direct gebruikt (geen shadcn ChartContainer) — meer flexibiliteit voor custom assen en tooltips
- Custom SVG Sparkline voor KPI-tiles — geen externe dependency, volledige controle over grootte en stijl

**Commit:** `e8123a4` — add next js with shadcn frontend

---

## Stap 17 — 2026-05-10

**Wat:** Backend patiëntenmodel aangepast en frontend gekoppeld aan FastAPI.

**Gedaan:**
- `backend/models/patient.py` — `name` gesplitst naar `first_name` + `last_name`, `status` veld toegevoegd (default `"info"`)
- `backend/schemas/patient.py` — `PatientCreate`, `PatientUpdate`, `PatientResponse` bijgewerkt op nieuwe velden
- `backend/alembic/versions/0001_initial_schema.py` — migratie aangepast (dev-fase, nog geen productiedata — `docker compose down -v` + rebuild)
- `backend/main.py` — CORS middleware toegevoegd voor `http://localhost:3000`
- `frontend/lib/api.ts` — echte `fetch` calls geïmplementeerd voor GET/POST/PATCH/DELETE `/patients/`; mapping `PatientAPI → Patient` (age berekend uit `birth_date`, meds string uit JSONB, status → label)
- `frontend/components/patients/patients-screen.tsx` — `useEffect` laadt patiënten bij mount, CRUD roept API aan, loading skeletons, error toasts, disabled knop tijdens opslaan

**Beslissingen:**
- `name` → `first_name` + `last_name` in de DB: frontend had aparte velden nodig en één veld splitsen op spatie is fragiel
- JSONB `medication_schedule` opgeslagen als `{ tekst: "..." }` voor invoer als vrije tekst — flexibel genoeg voor fase 1, uitbreidbaar naar gestructureerd schema later
- Bestaande migratie aangepast (niet nieuwe revisie) — toegestaan omdat de database nog leeg was en alleen lokaal draait. Zodra er seeder-data is, worden schema-wijzigingen altijd als nieuwe Alembic-revisie gedaan
- CORS beperkt tot `localhost:3000` — niet `"*"` zodat de instelling productie-klaar is (alleen whitelist uitbreiden)

---

## Stap 18 — 2026-05-12

**Wat:** `escalate_to_human` stub geïmplementeerd met TDD (Issue #14 voorbereiding).

**Gedaan (TDD):**
1. Test-driven development: eerst twee tests geschreven — `test_escalate_to_human_is_stub()` en `test_escalate_accepts_all_urgency_levels()`
2. Test liet zien: `ModuleNotFoundError: No module named 'tools.escalation'` — verwachte failure
3. `mcp-server/tools/escalation.py` aangemaakt met `async def escalate_to_human()` stub
4. `mcp-server/main.py` aangepast: import + registratie als `@mcp.tool()`
5. Alle 9 tests slagen: 2 escalation + 7 bestaande (embedding + memory)

**Aangemaakt:**
- `mcp-server/tools/escalation.py` — `escalate_to_human(patient_id, reason, urgency) -> None` stub
- `mcp-server/tests/test_escalation.py` — twee async tests, geen externe afhankelijkheden

**Aangepasst:**
- `mcp-server/main.py` — `from tools.escalation import escalate_to_human as _escalate_to_human` + registratie als tool

**Resultaat:**
- Tests: 9/9 PASS (embedding: 4, escalation: 2, memory: 3)
- MCP server kan escalatie-calls ontvangen (stub gooit geen fout)
- Signaal gereed voor vervolgstap: PostgreSQL escalations-tabel opvragen + email/Slack stub in tools/escalation.py

**Beslissingen:**
- Stub retourneert `None` zodat async context correct werkt — geen hardcoded placeholder-waarden
- Geen mock/patch nodig: escalation is stateless, geen afhankelijkheden op ChromaDB/Ollama
- TDD puur: geen code geschreven tot test faalde

**Commit:** `d9bcb68` — feat(mcp): add escalate_to_human stub + register all tools

---

## Stap 19 — 2026-05-12

**Wat:** Bewijsbaar maken wanneer PostgreSQL vs RAG (MCP/Chroma) wordt gebruikt en hoe dat samenhangt in één chat-request.

**Gedaan:**
- `backend/schemas/message.py` — Pydantic-modellen `ChatContextProof`, `PostgresContextProof`, `RAGContextProof`, `StoreMemoryProof`, `CombinedContextProof`; optioneel veld `context_proof` op `MessageResponse`
- `backend/routers/chat.py` — query-parameter `debug` (default false); bij `?debug=true` wordt `context_proof` gevuld met: Postgres `messages`-historie (ids, rollen, preview), RAG-hits uit `recall_context`, `chroma_document_id` uit `store_memory`, en `combined` (o.a. `system_prompt_includes_rag_block`, char-lengte); `response_model_exclude_none=True` zodat zonder debug geen `context_proof`-key in JSON
- `backend/tests/test_chat.py` — twee tests: debug-response bevat verwachte provenance; zonder debug ontbreekt `context_proof` in JSON

**Beslissingen:**
- Opt-in via query (`debug=true`) i.p.v. altijd aan — geen extra payload in productie-flow, wel reproduceerbaar voor portfolio (curl, OpenAPI, screen recording)
- Geen volledige system prompt in de response (privacy/size); wel expliciete `origin`-labels en tellingen als bewijslijn

**Commit:** `3d6aaab` — feat(chat): add debug context_proof for Postgres vs RAG provenance

---

## Stap 20 — 2026-05-12

**Wat:** System prompt aangescherpt na ongewenst LLM-gedrag (alarmistische ALL CAPS, 112/doktersnummer-combinatie uit context + RAG).

**Gedaan:**
- `backend/routers/chat.py` — `_build_system_prompt`: extra regels voor rustige toon, geen meldkamer-rol, geen stap-voor-stap noodscripts of alarmnummers tenzij patiënt expliciet vraagt, neutrale uitleg dat Anna niet belt, doktersnummers alleen kort vastleggen zonder kunstmatig "BEL NU"-plan, proportioneel reageren op huidig bericht t.o.v. eerdere/RAG-context

**Beslissingen:**
- Grenzen in prompt i.p.v. post-filter — lage latency, herhaalbaar in portfolio; echte medische escalatie blijft via geplande `escalate_to_human`-logica

**Commit:** `0b2cf34` — fix(chat): tighten system prompt against alarmist and 112-style output

---

## Stap 21 — 2026-05-12

**Wat:** Vastgelegd dat korte user-berichten **niet** worden overgeslagen voor RAG: elke turn blijft `recall_context` (parallel met `store_memory`) het volledige bericht gebruiken — geen trivial-skip pad.

**Beslissingen:**
- Op jouw verzoek: geen uitzondering op berichtlengte of begroeting; volledige pipeline en `context_proof` blijven per request vergelijkbaar

**Commit:** `33af042` — docs(portfolio): STAPPEN 21 — no RAG skip for short messages
