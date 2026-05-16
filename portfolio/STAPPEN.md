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

---

## Stap 22 — 2026-05-12

**Wat:** Chat-endpoint werkt end-to-end met RAG. Architectuuranalyse gedaan voor lange-termijn geheugen. Twee nieuwe issues aangemaakt voor Iteration 3.

**Aanleiding:**
Het chat-systeem (PostgreSQL + ChromaDB RAG + LLM) werkt aantoonbaar: de `context_proof` in de response toont dat Postgres-historie, RAG-hits en `store_memory` allemaal correct samenkomen. Vervolgens is op basis van een externe analyse (ChatGPT) besproken hoe het systeem op lange termijn robuuster te maken is.

**Kernbevinding uit de analyse:**
Ruwe berichtenhistorie is geen geheugen. Een hartpatiënt-companion heeft na verloop van tijd een samenvatting van de patiënt nodig — niet de volledige chatlog. Het model moet weten *wie* de patiënt is en *wat terugkeert*, niet elke zin ooit gezegd.

**Beslissingen:**
- Punt 2 en 3 van de analyse zijn de meest waardevolle verbeteringen:
  - Punt 2: periodieke medische samenvatting per patiënt, automatisch bijgehouden en opgeslagen in PostgreSQL
  - Punt 3: RAG blijft voor semantisch zoeken op symptomen en uitspraken; samenvatting wordt daarnaast als apart blok geïnjecteerd in de system prompt
- Punt 1 (selectief opslaan / filteren vóór ChromaDB) bewust uitgesteld — de gebruiker geeft de voorkeur aan brede opslag met een aparte samenvatting, niet aan een hard filter

**Aangemaakt:**
- Issue #28: `feat(memory): periodieke patiëntsamenvatting — update medische samenvatting elke N berichten` — Iteration 3
- Issue #29: `feat(chat): injecteer patiëntsamenvatting in system prompt naast RAG-context` — Iteration 3

**Volgende stap:** frontend werkend krijgen met de huidige staat (Postgres-patiënten, chat, trends, escalaties zichtbaar).

---

## Stap 23 — 2026-05-12

**Wat:** Chat-scherm gekoppeld aan FastAPI (issue #19 afgesloten).

**Gedaan:**
- `frontend/lib/api.ts` — `sendMessage` mock vervangen door echte `POST /chat/{patient_id}` aanroep met 90 seconden AbortController-timeout; retourneert `{ reply, sessionId }` op basis van `MessageResponse` uit de backend
- `frontend/components/chat/chat-screen.tsx` — volledig herschreven:
  - Patiënten laden via `getPatients()` API (verwijderd: mock `PATIENTS`)
  - Berichten per patiënt bijgehouden in een `Record<patientId, Message[]>` state-map
  - `session_id` van de eerste API-response bijgehouden per patiënt
  - `send()` met echte API, toast bij timeout en bij andere fouten, optimistisch toegevoegde user-message teruggedraaid bij fout
  - Skeleton loading-state voor patiëntenselector en patiënt-header
  - Lege-state in de berichtenstroom ("Nog geen gesprek gestart")
  - `+` knop in session rail: wist de lokale berichten en reset session_id (nieuw gesprek starten; backend maakt nieuwe sessie zodra bericht gestuurd wordt)
  - Composer en verstuurknop uitgeschakeld tijdens het laden en tijdens LLM-wacht

**Beslissingen:**
- Backend auto-manages sessies (één open sessie per patiënt) — frontend beheert geen session_id als invoer voor de API-call
- 90 seconden timeout: LLM via Ollama (lokaal, GPU) kan 10-30 seconden duren; ruime marge voor slechte GPU-bezetting
- Mock `CHAT` volledig verwijderd uit api.ts; sessierail toont nu de live lopende sessie of een lege staat

**TypeScript check:** geen fouten (`npx tsc --noEmit`).

**Commit:** `9b0af3f` — feat(frontend): wire chat to FastAPI — real sendMessage + patient load from API

---

## Stap 24 — 2026-05-12

**Wat:** Sessierail werkend gemaakt — GET-endpoints voor sessies en berichten toegevoegd.

**Aanleiding:** Na koppeling van de chat aan de API werden sessies niet weergegeven in de sessierail. De backend had nog geen endpoints om sessies of berichten op te halen.

**Gedaan:**
- `backend/schemas/message.py` — `SessionListItem` en `MessageListItem` Pydantic-modellen toegevoegd
- `backend/routers/chat.py` — `GET /chat/{patient_id}/sessions` toegevoegd met berichtentelling via één aggregatiequery (geen N+1); `GET /chat/{patient_id}/sessions/{session_id}/messages` toegevoegd
- `frontend/lib/api.ts` — `getChatSessions()` en `getChatMessages()` geïmplementeerd; berichten gemapped van `role` (`user`/`assistant`) naar UI-waarden (`me`/`them`)
- `frontend/components/chat/chat-screen.tsx` — sessierail laadt live sessies via API; berichten worden per sessie gecached in `msgMap`; klikken op sessie laadt de bijbehorende berichten

**Beslissingen:**
- Berichtentelling via één aggregatiequery (`GROUP BY session_id`) — voorkomt N+1 bij patiënten met veel sessies
- Berichten gecached per sessie-ID in frontend-state — geen herhaalde API-calls bij terugschakelen naar eerdere sessie

**Commit:** `54ccf9c` — feat(chat): add sessions/messages GET endpoints + load history in frontend

---

## Stap 25 — 2026-05-12

**Wat:** Anna herinnerde zich informatie niet die aantoonbaar in RAG stond. Systeem prompt herschikt en geheugeninstructies toegevoegd.

**Aanleiding:** Aantoonbaar via `context_proof`: doktersnummer (06-84184389) stond in RAG-hits op distance 0.21, maar Anna beweerde het niet te weten. Oorzaak: LLM las het geheugenblok pas nadat de crisis-history al dominant was.

**Gedaan:**
- `backend/routers/chat.py` — `_build_system_prompt`:
  - RAG-blok verplaatst van onderaan naar bóven in de system prompt (hoogste prioriteit voor de LLM)
  - Expliciete instructie toegevoegd: "Wordt gevraagd naar iets dat eerder gedeeld is? Geef het terug vanuit die herinneringen. Zeg nooit dat je vorige sessies niet kunt herinneren."
  - `_HISTORY_LIMIT` verlaagd van 10 naar 6 — minder crisis-berichten die het prompt domineren
- `frontend/components/chat/chat-screen.tsx` — `POST /chat/{patient_id}/sessions/close` aangeroepen bij `+` knop; daarna sessies opnieuw geladen en staat gereset

**Beslissingen:**
- Prompt-volgorde is instructie-prioriteit: wat boven staat weegt zwaarder voor LLM. RAG bovenaan → inhoud wordt eerder verwerkt dan crisis-patronen uit de history
- History van 10 naar 6: ruim genoeg voor conversatieflow, klein genoeg om niet te domineren

**Commits:**
- `977563c` — fix(chat): instruct Anna to use RAG context for recall queries across sessions
- `3a8b176` — fix(chat): move RAG block to top of prompt, reduce history to 6 to prevent crisis spiral
- `16f6e6b` — feat(chat): add close session endpoint + new session button closes current session

---

## Stap 26 — 2026-05-12

**Wat:** Timeout- en stabiliteitsproblemen opgelost — chat reageerde niet na ~90s, MCP-aanroepen crashten bij bezet Ollama.

**Aanleiding:**
- Frontend gooide "Anna reageert niet (time-out na 90 s)" terwijl de LLM na 2-5 min wél antwoordde (te laat zichtbaar na handmatige refresh)
- Docker Compose logs toonden `ReadTimeout` op `store_memory`/`recall_context` wanneer Ollama tegelijk infereerde

**Oorzaak:**
- gemma4:e4b = 9,4 GiB totaal; RTX 4050 Laptop (6 GiB VRAM) laadt slechts 2,8 GiB op GPU — 6,6 GiB draait op CPU → inferentie duurt 2-5 minuten
- bge-m3 embed-call had een timeout van 30s, te kort als Ollama al bezig was met de LLM

**Gedaan:**
- `mcp-server/services/embedding.py` — httpx timeout 30s → 120s
- `backend/services/llm.py` — httpx timeout 120s → 600s
- `frontend/lib/api.ts` — AbortController timeout 90s → 600s
- `backend/routers/chat.py` — `asyncio.gather(return_exceptions=True)` zodat een fout in `store_memory` of `recall_context` de chat niet afbreekt; fallback: lege memories-lijst, geen chroma_doc_id

**Beslissingen:**
- 600s (10 min) als timeout: ruim genoeg voor worst-case CPU-inferentie, duidelijk slechter dan productie; acceptabel voor demo/portfolio fase
- Non-fatal MCP-calls: RAG-degradatie is beter dan een crashende chat

**Commits:**
- `39be187` — fix(mcp): raise embed timeout to 120s, make RAG gather non-fatal when Ollama is busy
- `7e45af7` — fix: increase LLM and frontend timeout to 600s for CPU-offloaded gemma4:e4b

---

## Stap 27 — 2026-05-12

**Wat:** LLM gewisseld van `gemma4:e4b` naar `gemma4:e2b` om timeouts op te lossen.

**Aanleiding:** gemma4:e4b (9,4 GiB) past niet in het VRAM van de RTX 4050 Laptop (6 GiB). Daardoor draait 6,6 GiB op CPU, wat leidt tot inferentietijden van 2-5 minuten. gemma4:e2b is de kleinere variant van dezelfde modelfamilie en is beschikbaar via Ollama.

**Gedaan:**
- `.env` — `OLLAMA_MODEL=gemma4:e4b` → `OLLAMA_MODEL=gemma4:e2b`
- `.env.example` — idem bijgewerkt

**Verwachting:** gemma4:e2b past volledig in VRAM, inferentie zakt naar 5-20s. Zelfde prompt-structuur en Nederlands taalgedrag blijven van toepassing.

---

## Stap 28 — 2026-05-13

**Wat:** Grondig RAG-recall onderzoek via NotebookLM (6 wetenschappelijke bronnen) + reeks iteratieve fixes op basis van de bevindingen. Conclusie: RAG-pipeline werkt correct, model is de bottleneck.

**Aanleiding:**
Na alle eerdere fixes bleef Anna in nieuwe sessies antwoorden met "Als een AI heb ik geen toegang tot je persoonlijke locatie", ook als het feit ("ik woon in eindhoven") aantoonbaar in de RAG-hits zat en de system prompt `system_prompt_includes_rag_block: true` toonde.

**NotebookLM research (notebook: anna-remembers)**
Bronnen toegevoegd: Lost in the Middle (Liu et al. 2023), Self-RAG (2023), RAG Survey (2023), Pinecone RAG docs, LangChain memory docs, eigen codebase als tekstbron.

Drie bevindingen uit de literatuur:
1. **"Lost in the Middle"** — feiten midden in de prompt worden genegeerd. Oplossing: RAG-blok naar het einde van de prompt.
2. **Authoritative data** — sla alleen feitelijke uitspraken op, geen vragen. Vragen veroorzaken self-hits (distance ≈ 0) die feiten verdringen.
3. **In-context history corrupts system prompt** — als de history weigeringsantwoorden bevat ("Ik heb geen toegang"), leert het model dat patroon voort te zetten, ook als het feit wél in de prompt staat.

**Iteratieve fixes (chronologisch):**
- RAG-blok verplaatst naar einde van de system prompt
- `_is_question()` geïmplementeerd: detecteert Nederlandse vraagsignalen (`waar`, `wat`, `wie`, `hoe` etc.) én vraagtekens; vragen worden niet opgeslagen in ChromaDB
- Weigeringsantwoorden gefilterd uit de conversation history vóór LLM-aanroep (`_is_refusal()`)
- Noise-drempel verhoogd van 0.01 naar 0.08 (oude "waar woon ik" entries lagen op distance 0.045 en lekten nog door)
- RAG-blok omgeformuleerd van "Wat de patiënt eerder heeft verteld" naar "PATIËNTENDOSSIER (geautoriseerde medische informatie)" — vermijdt dat het model het ziet als persoonlijke data waarover het geen bevoegdheid heeft

**Conclusie uit context_proof analyse:**
- `system_prompt_char_length` identiek in werkende en falende sessie (1284 chars)
- `system_prompt_includes_rag_block: true` in beide gevallen
- `store_memory` had geen `chroma_document_id` → vraagdetectie werkt, vragen worden niet opgeslagen
- Enig verschil: de conversation history
- **Maar**: zelfs de allereerste turn in een nieuwe sessie (geen history) faalt → het model negeert de RAG-context structureel voor locatievragen

**Definitieve diagnose:** gemma4:e2b (~2B effectieve params, grotendeels CPU) heeft te sterke RLHF-training op "Ik heb geen toegang tot persoonlijke locatiegegevens". Die override is sterker dan de system prompt instructie. De RAG-pipeline is technisch correct.

**Commits (chronologisch):**
- `d016d07` — fix(chat): also store Anna response in ChromaDB for cross-session RAG recall
- `3d191b3` — fix(mcp): deduplicate ChromaDB entries with deterministic content hash ID
- `d6133f6` — fix(chat): filter RAG self-hits and ai_inferred noise, strengthen memory instruction
- `d7b7d23` — fix(chat): store only facts not questions, move RAG block to end of prompt
- `c0a666f` — fix(chat): detect Dutch questions without ?, filter refusal turns from LLM history
- `38d0d02` — fix(chat): raise noise floor to 0.08, reframe RAG as patient dossier

**Volgende stap:** cloud model testen (Claude Haiku via Anthropic API) — als dat wél werkt, bewijst het dat de pipeline correct is en het model de bottleneck.

---

## Stap 28 — 2026-05-12

**Wat:** RAG cross-sessie recall gerepareerd — Anna's antwoorden worden nu ook opgeslagen in ChromaDB.

**Aanleiding:**
Via `context_proof` aangetoond dat RAG semantisch faalde. De gebruiker vroeg "waar woon ik?" en de RAG-hits waren uitsluitend de vraag zelf ("waar woon ik", distance ≈ 0), niet het feit "ik woon in schaft". Oorzaak: `store_memory` sloeg alleen het user-bericht op. Bij een recall-query matcht de vraag zichzelf perfect — het antwoord zit er niet in.

**Voorbeeld uit context_proof:**
```json
"hits": [
  { "content": "waar woon ik",  "distance": 1.19e-7 },  ← vraag opgeslagen, niet het feit
  { "content": "waar woon ik?", "distance": 1.19e-7 }
]
```
"ik woon in schaft" verscheen nergens in de hits.

**Fix:**
- `backend/routers/chat.py` — na opslaan van `assistant_message`: extra `store_memory`-aanroep met `content=response_text`, `source="ai_inferred"`. Anna's antwoord ("Je woont in Schaft") heeft wél semantische overlap met "waar woon ik?".

**Beslissingen:**
- `source="ai_inferred"` — onderscheidt Anna's samenvattingen van directe patiëntuitspraken, conform architectuurregel (source-tag is verplicht)
- Geen deduplicatie toegevoegd — duplicaten zijn acceptabel in demo-fase; de samenvatting (Issue #28) lost dit structureel op

**Commit:** `d016d07` — fix(chat): also store Anna response in ChromaDB for cross-session RAG recall

---

## Stap 29 — 2026-05-13

**Wat:** Cloud LLM-providers (Anthropic, OpenRouter, Groq) toegevoegd aan `backend/services/llm.py`. RAG-recall bevestigd werkend met Groq (llama-3.3-70b-versatile).

**Aanleiding:**
Stap 28 concludeerde dat gemma4:e2b de bottleneck is: RLHF-training overschrijft de system prompt, zelfs als de RAG-hits correct zijn. Om dit te bewijzen én een werkend systeem te hebben voor de demo, zijn drie cloud-providers toegevoegd zonder de rest van de codebase te raken.

**Gedaan:**
- `AnthropicProvider` toegevoegd — gebruikt officiële `anthropic` Python SDK
- `OpenRouterProvider` toegevoegd — OpenAI-compatibele HTTP API via `httpx`, geen extra dependencies
- `GroqProvider` toegevoegd — OpenAI-compatibele HTTP API via `httpx`, gratis tier met snelle LPU-inferentie
- `get_llm_provider()` factory uitgebreid voor alle vier providers
- Security fix: hardcoded API key als default verwijderd (`""` i.p.v. `"sk-or-v1-..."`)
- `anthropic>=0.40.0` toegevoegd aan `backend/requirements.txt`
- `docker-compose.yml` uitgebreid: `GROQ_API_KEY`, `GROQ_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` doorgegeven aan backend container
- `.env` ingesteld op `LLM_PROVIDER=groq` met Groq API key

**Bewijs RAG werkt:**
`context_proof` van eerste Groq-sessie toont:
```json
"content": "Je woont in Eindhoven. Wil je praten over je planning om te verhuizen naar Londen?"
"hits": [
  { "content": "ik woon in eindhoven", "distance": 0.297 },
  { "content": "ik wil verhuizen naar londn", "distance": 0.381 }
]
```
Anna haalt correct twee feiten op uit een eerdere sessie (`session_id` verschilt van huidige sessie) en verwerkt ze in een vloeiend antwoord. De pipeline was altijd correct — het model was de bottleneck.

**Beslissingen:**
- Groq gekozen boven Anthropic/OpenRouter voor eerste test: gratis tier, geen betaalkaart nodig, llama-3.3-70b is capabel genoeg voor RLHF override te omzeilen
- Provider-agnostische abstractie behouden — wisselen van provider vereist alleen `.env` aanpassen, geen codewijziging
- API keys nooit als default-waarde in code — altijd lege string, ValueError als de key ontbreekt

---

## Stap 30 — 2026-05-13

**Wat:** Periodieke medische samenvatting per patiënt geïmplementeerd (issue #28).

**Gedaan:**
- Alembic migratie `0002_add_medical_summary.py`: `ALTER TABLE patients ADD COLUMN medical_summary TEXT`
- `Patient` model uitgebreid met `medical_summary: Mapped[str | None]`
- `_build_summary_prompt()` toegevoegd in `chat.py` — stuurt laatste 40 berichten + huidige samenvatting naar LLM met instructie alleen patiënt-gemelde feiten op te nemen
- `_trigger_summary_update()` + `_async_summary_update()` toegevoegd — draait als FastAPI `BackgroundTask` zodat de HTTP-response niet geblokkeerd wordt; gebruikt eigen `SessionLocal`-sessie
- Trigger in `chat()` endpoint: na opslaan assistant-bericht worden alle berichten van de patiënt geteld; als `total % SUMMARY_INTERVAL == 0` start de achtergrondtaak
- `SUMMARY_INTERVAL` configureerbaar via env var (default: 10)
- `_build_system_prompt()` injecteert samenvatting als `MEDISCHE SAMENVATTING`-blok boven het RAG-dossier

**Beslissingen:**
- BackgroundTasks gekozen boven `asyncio.create_task()`: FastAPI beheert de levenscyclus, geen race condition met request-sessie
- Eigen `SessionLocal` in de achtergrondtaak — de request-DB-sessie is al gesloten als de taak start
- Samenvatting staat bóven het RAG-blok in de prompt — stabiele context-voor-sessie vs. query-specifieke hits

**Commit:** `46f6697` — feat(memory): periodic medical summary — update patients.medical_summary every N messages

---

## Stap 32 — 2026-05-13

**Wat:** Issue #32 geïmplementeerd — medische samenvatting omgezet van Markdown naar compact JSON. Token usage gemeten voor en na via Langfuse.

**Uitgevoerd:**
- `_build_summary_prompt()` herschreven: vraagt nu compact JSON met korte keys (`sym`, `med`, `wgt`, `bhv`, `ovr`) in plaats van vrije Markdown-tekst
- JSON-validatie toegevoegd in `_async_summary_update`: markdown fences gestript → `json.loads()` → minified opgeslagen; fallback op ruwe tekst bij parse-fout
- `asyncio.run()` bug gefixed: `_trigger_summary_update` was een sync wrapper die `asyncio.run()` aanriep vanuit een al-draaiende event loop → omgezet naar `async def`
- `MedicalSummaryJSON` interface toegevoegd aan `frontend/types/index.ts`
- `DossierCard` component gebouwd in `chat-screen.tsx`: parse JSON → gestructureerde weergave met gelabelde secties; fallback voor legacy Markdown-summaries

**Meting:**

| Formaat | Input | Output | Totaal | Latency |
|---|---|---|---|---|
| Markdown (voor) | 1.276 | 219 | 1.495 | 0,69s |
| JSON run 1 | 1.579 | 139 | 1.718 | 0,36s |
| JSON run 2 | 1.591 | 84 | 1.675 | 0,30s |

**Beslissingen:**
- Output tokens dalen −62%, maar input stijgt door groeiende gesprekscontext — netto verschil minimaal en niet hard te isoleren
- Acceptatiecriterium "meetbare daling in token usage" is niet onomstotelijk aangetoond; de contextgroei is een confounding factor
- Voordeel zit in gestructureerde data (frontend kan JSON renderen), latency (−57%) en schaalbaarheid over tijd
- Gedocumenteerd in evidence_06 met eerlijke conclusie

**Evidence:** `portfolio/evidence/evidence_06_token_usage_markdown_vs_json.md`

---

## Stap 33 — 2026-05-14

**Wat:** README.md en CLAUDE.md bijgewerkt naar de huidige bouwstaat (feature/patient-summary).

**Gedaan:**
- `README.md` — stack tabel uitgebreid met Langfuse en cloud LLM-providers; env vars sectie herschreven met alle huidige variabelen (`LLM_PROVIDER`, `GROQ_*`, `ANTHROPIC_*`, `OPENROUTER_*`, `LANGFUSE_*`, `SUMMARY_INTERVAL`); Ollama pull-instructie bijgewerkt van `gemma4:e4b` → `gemma4:e2b`; Chat screen status van "Mock" naar "Live"
- `CLAUDE.md` — stack tabel bijgewerkt (LLM als Ollama/Groq/Anthropic/OpenRouter + Langfuse); bouwstaat volledig herschreven naar 2026-05-14: alle gesloten issues toegevoegd (#3, #14, #19, #28, #29, #32), chat-pipeline gedocumenteerd (RAG, history filters, Langfuse tracing, BackgroundTask samenvatting), open issues bijgesteld (#13 trends + #4 frontend volledig + gesimuleerde patiënten)

**Beslissingen:**
- Geen inhoudelijke codewijzigingen — alleen documentatie gesynchroniseerd met de werkelijke staat van de branch

---

## Stap 34 — 2026-05-14

**Wat:** `escalate_to_human` MCP-tool geïmplementeerd (issue #14) — optie B: MCP-server roept FastAPI aan via HTTP, FastAPI schrijft naar PostgreSQL.

**Gedaan:**
- `backend/alembic/versions/0003_add_notification_status_to_escalations.py` — migratie: `notification_status VARCHAR(20) DEFAULT 'pending'` toegevoegd aan `escalations` tabel (hook voor issue #25)
- `backend/models/escalation.py` — `notification_status` veld toegevoegd
- `backend/schemas/escalation.py` — `EscalationCreate` en `EscalationStatusUpdate` toegevoegd; `notification_status` in `EscalationResponse`
- `backend/routers/escalations.py` — nieuw: `POST /escalations`, `GET /escalations`, `GET /escalations/{id}`, `PATCH /escalations/{id}/status`; `# Issue #25` comment markeert waar notificatieverzending ingeplugd wordt
- `backend/main.py` — `escalations` router geregistreerd
- `docker-compose.yml` — `BACKEND_URL: http://backend:8000` toegevoegd aan mcp-server environment
- `mcp-server/tools/escalation.py` — stub vervangen: valideert urgency → POST naar backend via httpx → logt naar stdout → geeft escalation ID terug
- `mcp-server/main.py` — return type `None` → `str`
- `mcp-server/tests/test_escalation.py` — 4 tests herschreven met respx mock: happy path, alle urgency-levels, ongeldige urgency, backend HTTP-fout

**Testresultaat:** 4/4 PASS

**Beslissingen:**
- Optie B (MCP → FastAPI HTTP) gekozen boven directe PostgreSQL-connectie vanuit MCP: FastAPI blijft eigenaar van alle DB-schrijfacties, consistent met architectuurregel
- `notification_status="pending"` als startwaarde: issue #25 pikt dit op en werkt bij naar `sent`/`failed` na daadwerkelijke verzending — geen notification-code nu geschreven
- Validatie van urgency in de MCP-tool zelf (vóór HTTP-call) zodat foute input nooit de backend bereikt

---

## Stap 36 — 2026-05-16

**Wat:** Escalatiedetectie geïmplementeerd in de chat-pipeline — `escalate_to_human` wordt nu écht aangeroepen bij urgente patiëntberichten.

**Aanleiding:**
In een testgesprek meldde een patiënt "er is nood ik ga dood" en "de ontlasting is rood" — Anna reageerde bezorgd maar er werd geen escalatie aangemaakt. De oorzaak was tweeledig: (1) `mcp_client.escalate_to_human()` was een stub (`pass`), (2) `chat.py` riep de tool aan op elk bericht met lege reason.

**Gedaan:**
- `backend/services/mcp_client.py` — `escalate_to_human` omgezet van stub naar echte MCP-tool aanroep via `client.call_tool("escalate_to_human", ...)`
- `backend/routers/chat.py` — `_ESCALATION_HIGH` en `_ESCALATION_MEDIUM` keyword-sets toegevoegd; `_detect_escalation(patient_message)` detecteert urgentie op basis van patiëntbericht; stub vervangen door conditionele aanroep met `try/except` zodat een escalatiefout de chat niet blokkeert
- `backend/schemas/message.py` — `escalation_triggered: bool` veld toegevoegd aan `MessageResponse`
- `frontend/lib/api.ts` — `escalationTriggered` doorgegeven vanuit `sendMessage` response
- `frontend/components/chat/chat-screen.tsx` — `toast.warning` getoond als `escalationTriggered === true`

**Beslissingen:**
- Keyword-detectie op patiëntbericht (niet op Anna's response): betrouwbaarder, geen LLM nodig, voorspelbaar gedrag
- Hartfalenpatiënten: liever te vroeg escaleren dan te laat — `_ESCALATION_HIGH` bevat ook twijfelgevallen zoals "bloed" en "nood"
- `try/except` rond de escalatieaanroep: escalatiefout mag de chatresponse nooit blokkeren

---

## Stap 37 — 2026-05-16

**Wat:** Escalatiedetectie omgezet van keyword-matching naar LLM-beslissing via prompt-signaal (optie B — token-besparend).

**Aanleiding:**
Keyword-matching miste gevallen zoals "20 shotjes tot ik in coma lig" en "de ontlasting is rood" (woordvolgorde verschilt van keyword). Bovendien begrijpt de LLM al de volledige context van het gesprek — een aparte classificatiecall is overbodig.

**Aanpak:**
Anna krijgt in de system prompt de instructie om `[ESCALATE:high:reden]` of `[ESCALATE:medium:reden]` toe te voegen aan het einde van haar antwoord als escalatie nodig is. De backend parseert dit signaal, strips het uit de response vóór opslaan, en roept `escalate_to_human` aan.

**Gedaan:**
- `backend/routers/chat.py` — keyword-sets verwijderd; `_ESCALATION_SIGNAL_RE` regex toegevoegd; `_detect_escalation()` vervangen door `_parse_escalation_signal(response_text)`; system prompt uitgebreid met escalatie-instructie; `raw_response` → strip signaal → `response_text` opslaan
- Geen extra LLM-call, geen extra tokens buiten de ~30 tokens voor de prompt-instructie

**Beslissingen:**
- Optie B (prompt-signaal) boven optie A (aparte classificatiecall): geen extra kosten per bericht, Anna heeft al volledige context
- Signaal aan het EINDE van de response zodat het makkelijk te strippen is en Anna's antwoord leesbaar blijft
- Case-insensitive regex: LLM schrijft soms `[ESCALATE:HIGH:...]` in hoofdletters

---

## Stap 38 — 2026-05-16

**Wat:** Decision log DL4 — gelaagde escalatiedetectie (keywords + lokaal classificatiemodel).

**Gedaan:**
- `portfolio/decision-logs/DL4_escalatie_detectie.md` — kernvraag, succescriteria, keuze Laag 0 + Laag 1, DOT-onderzoek, links naar commits

**Beslissingen:**
- Prompt-signaal (stap 37) vervangen door gelaagde aanpak: betrouwbaarder dan `[ESCALATE:…]` in Anna's antwoord
- Laag 1 asynchroon zodat chat-latency nul extra wachttijd heeft

**Commit:** (zie stap 39)

---

## Stap 39 — 2026-05-16

**Wat:** Gelaagde escalatiedetectie geïmplementeerd in `backend/routers/chat.py`.

**Gedaan:**
- Laag 0: `_ESCALATION_HIGH` / `_ESCALATION_MEDIUM`, `_layer0_check()` synchroon vóór LLM; Langfuse span `escalation-layer0`
- Laag 1: `_layer1_classify()` als `BackgroundTask` met `qwen2.5:0.5b` (default), Engelse classify-prompt, `_parse_escalation_json()`, timeout 90s, logging i.p.v. stille `except`
- Vervangen: `[ESCALATE:…]` regex en prompt-signaal uit system prompt
- Keywords uitgebreid o.a. `ik verbrand`, `ontlasting is rood` (Laag 0)
- `docker-compose.yml` — `ESCALATION_MODEL`, `ESCALATION_COOLDOWN_MINUTES`, `MCP_URL` op backend
- `.env.example` — documentatie pull-commando qwen
- `backend/tests/test_escalation_layers.py` — unit tests Laag 0 + JSON-parse

**Beslissingen:**
- `ESCALATION_MODEL=qwen2.5:0.5b` i.p.v. gemma4:e2b — past in VRAM naast bge-m3; gemma4 laadt vision-encoder (~7 GiB)
- Cooldown default 5 min; `ESCALATION_COOLDOWN_MINUTES=0` voor testen zonder wachten
- Semaphore serialiseert per patiënt (geen `locked()` skip meer — berichten wachten in rij)

**Commit:** (nog niet gecommit)

---

## Stap 35 — 2026-05-14

**Wat:** Escalatiescherm gekoppeld aan FastAPI — mock data vervangen door echte API.

**Aanleiding:**
Het escalatiescherm gebruikte nog seed-data uit `mock-data.ts`. Na implementatie van de backend escalatie-endpoints (stap 34) moesten de veld-mismatches tussen backend en frontend opgelost worden.

**Mismatches opgelost:**
- Backend `urgency: low/medium/high` → frontend `info/warning/urgent` via mapping in `api.ts`
- Backend `status: open/acknowledged/resolved` → frontend `open/in_progress/closed` via mapping
- Backend geeft `patient_id` (UUID) → `patient_name` via `joinedload` in de backend query toegevoegd
- Kanaal (`channel`) afgeleid uit urgency (high→Slack, low/medium→E-mail) — geen DB-kolom nodig
- `assignee` en `closed` zijn niet in backend (scope issue #25/later) — defaulten naar `null`

**Gedaan:**
- `backend/schemas/escalation.py` — `patient_name: str` toegevoegd aan `EscalationResponse`
- `backend/routers/escalations.py` — `joinedload(Escalation.patient)` in alle queries; `_to_response()` helper bouwt response inclusief `patient_name`
- `frontend/lib/api.ts` — `EscalationAPI` interface, `toEscalation()` mapping, echte `getEscalations()` en nieuwe `updateEscalationStatus()` functie
- `frontend/components/escalations/escalations-screen.tsx` — `useEffect` laadt via API, loading skeletons, `setStatus` roept `updateEscalationStatus()` aan (async), detail dialog heeft `saving` state

**TypeScript check:** geen fouten (`npx tsc --noEmit`)
