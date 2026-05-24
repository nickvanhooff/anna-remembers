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

## Stap 40 — 2026-05-16

**Wat:** Escalatiereden in dashboard leesbaar gemaakt — altijd het originele patiëntbericht tonen.

**Gedaan:**
- `backend/routers/chat.py` — `_format_escalation_reason()`: `Laag N · Patiëntbericht: «…» · <detail>` voor Laag 0 en Laag 1
- Classify-prompt: `reason` veld verplicht Nederlands
- Test `test_format_escalation_reason_includes_patient_message`

**Beslissingen:**
- Geen DB-schema-wijziging — alles in bestaand `reason` Text-veld; frontend toont `e.reason` ongewijzigd

**Commit:** (nog niet gecommit)

---

## Stap 41 — 2026-05-16

**Wat:** Escalatiescherm toont patiëntbericht en laag gestructureerd (niet alleen ruwe `reason`-string).

**Gedaan:**
- `frontend/Anna-remembers/lib/parse-escalation-reason.ts` — parse `Laag N · Patiëntbericht: «…» · detail` + legacy `[Layer 1 — …]`
- `frontend/Anna-remembers/components/escalations/escalation-reason-display.tsx` — `EscalationReasonCompact` (tabel) en `EscalationReasonDetail` (dialog)
- `frontend/Anna-remembers/components/escalations/escalations-screen.tsx` — componenten ingebouwd

**Beslissingen:**
- Parser in frontend i.p.v. extra API-velden — `reason` blijft één kolom, geen migratie

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

---

## Stap 42 — 2026-05-16

**Wat:** `backend/routers/chat.py` (794 regels) opgesplitst in een Python-package `chat/`.

**Gedaan:**
- `backend/routers/chat/_escalation.py` — Laag 0 keywords, `layer0_check()`, `layer1_classify()`, `format_escalation_reason()`, `_parse_classify_json()`
- `backend/routers/chat/_prompts.py` — `build_system_prompt()`, `build_summary_prompt()`
- `backend/routers/chat/_summary.py` — `trigger_summary_update()`, `_SUMMARY_INTERVAL`
- `backend/routers/chat/_routes.py` — alle FastAPI route handlers, `_is_question()`, `_is_refusal()`, `_build_context_proof()`
- `backend/routers/chat/__init__.py` — exporteert `router`
- Oude `chat.py` verwijderd — Python prefereert package boven module; backend start correct

**Beslissingen:**
- Geen functionele wijzigingen — alleen structuur; `main.py` hoefde niet aangepast (`from routers import chat` werkt met package)
- `_` prefix voor interne modules — conventie dat ze niet direct geïmporteerd worden buiten het package

---

## Stap 43 — 2026-05-17

**Wat:** Evidence 07 (C3/C4 diagrammen) en evidence 08 (implementatie-iteraties) aangemaakt; DL4 bijgewerkt en alles gecommit.

**Gedaan:**
- `portfolio/evidence/evidence_07_c3_c4_chat_pipeline.md` — C3 componentdiagram Backend + C4 sequentiediagram van één chat-request
- `portfolio/evidence/evidence_08_escalatie_implementatie.md` — 5 implementatie-iteraties gedocumenteerd (modelswitch, prompt fix, timeout, cooldown, reden-opmaak) + API-testbewijs
- `portfolio/decision-logs/DL4_escalatie_detectie.md` — model gecorrigeerd (gemma4:e2b → qwen2.5:0.5b), alle evidence-links gekoppeld, succescriteria gemarkeerd als gehaald, commits toegevoegd

**Beslissingen:**
- Sequence diagram voor C4 i.p.v. klasse/code diagram — toont beter temporele volgorde en async/parallel gedrag
- Evidence 08 volgt zelfde iteratieve structuur als evidence 05 (bugrapporten per iteratie, commit per fix)

**Commit:** `bd07eca`

---

## Stap 44 — 2026-05-17

**Wat:** Laag 1 escalatie-prompt aangescherpt — te veel niet-urgente berichten werden als `Urgent` geëscaleerd.

**Probleem:** Berichten als "ik heb veel gewerkt en ben vermoeid", "ik heb last van mijn nek" en "krijg pijn als ik naar links kijk" werden door qwen2.5:0.5b als escalatie gemarkeerd en in de UI getoond als `Urgent`. Daardoor verloor de escalatielijst signaalwaarde — een gewoon gesprek werd als noodgeval gelogd.

**Aanpassing in `backend/routers/chat/_escalation.py`:**
- `_CLASSIFY_SYSTEM` herschreven met expliciete NIET-escaleren lijst (vermoeidheid, milde pijn, medicatievragen, begroetingen, gewone conversatie)
- Strikt onderscheid tussen `high` (levensbedreigend) en `medium` (ernstig maar niet acuut)
- Default-gedrag expliciet: NIET escaleren tenzij duidelijk acuut
- Extra Nederlandstalige voorbeelden zodat de kleine 0.5B-model conservatiever wordt

**Beslissingen:**
- Fix in prompt, niet in code-filter — zo blijven Langfuse-traces overeenkomen met de modelbeslissing
- `low` blijft buiten het JSON-schema; als het laag is hoort het `escalate=false` te zijn

---

## Stap 45 — 2026-05-17

**Wat:** Test- en validatieronde van de aangescherpte Laag 1 prompt; modelwissel `qwen2.5:0.5b` → `qwen2.5:3b`.

**Prompt 1:** *"it is detecting this all: [lijst van escalaties waarbij 'Ik ben vermoeid', 'Ik ben lui' en 'Wat doet mijn furosemide' als Urgent werden gemarkeerd] is it because of the small model that doesnt understand dutch good?"*

**Diagnose:** Ja — `qwen2.5:0.5b` is 0.5 miljard parameters en hallucineerde redenen. Bericht "Ik ben vermoeid" gaf reden "pijn op de borst is gemeld" en "Ik ben lui" gaf "pijn op de borst gemeld" — pure verzinsels. Model begreep Nederlands onvoldoende voor causaal redeneren.

**Prompt 2:** *"ik wil in docker qwen2.5:3b deze downloaden, geef commando"*

**Gedaan:**
- `docker exec -it ollama ollama pull qwen2.5:3b` (6× groter, ~3-5s latency, past nog in beschikbare VRAM)
- `.env`: `ESCALATION_MODEL=qwen2.5:3b`
- Backend herstart

**Validatie na modelwissel:** alle high-risk berichten ("bloed opgehoest", "geen lucht", "hart bonkt + duizelig") correct geëscaleerd; gewone gesprekken niet meer als urgent gemarkeerd.

**Beslissingen:**
- 3B blijkt het sweet spot voor Nederlands medisch triage — 0.5B was structureel onbruikbaar
- Bewijst portfoliopunt: kleinere modellen besparen GPU maar leveren onbruikbaar oordeel in non-English context

---

## Stap 46 — 2026-05-17

**Wat:** Laag 1 escalatie-prompt verruimd met `low` urgentie voor zachte waarschuwingssignalen.

**Prompt:** *"ik wil dat je laag 1 iets losser maakt qua escalatie, want sommige onderdelen verwacht ik wel als info"*

**Aanpassing in `backend/routers/chat/_escalation.py`:**
- `low` (Info-niveau) toegevoegd aan JSON-schema en voorbeelden
- Categorisatie expliciet: high = ambulance, medium = ernstig niet acuut, low = zacht waarschuwingssignaal (mild oedeem, gewichtstoename, kortademig bij inspanning, algemeen onwel)
- Twijfelregel: bij twijfel false↔low → kies low zodra een symptoom genoemd is

**Beslissingen:**
- Verschil tussen "geen escalatie" en "low/info-escalatie" benoemd: zachte signalen wel loggen voor de zorgverlener, maar zonder Slack-alert (alleen e-mail)
- Frontend toont `low` als `Info` (zachtgeel) via bestaande `URGENCY_MAP` in `lib/api.ts`

---

## Stap 47 — 2026-05-17

**Wat:** Twee frontend-bugs opgelost: patiënt-edit dialog en datum-/tijdweergave bij escalaties.

**Prompt:** *"there are 2 problems: 1: als ik op de edit knop klik voor Patiënt bewerken worden de current gegevens niet weergegeven. 2: bij escalatie beheer staat: -7 dagen geleden 19:54 dat klopt niet want dat was vandaag, het loopt alleen 2 uur achter en verkeerde datum lijkt erop"*

**Gedaan:**
- `frontend/Anna-remembers/components/patients/patients-screen.tsx` — `useEffect` toegevoegd aan `PatientFormDialog` die alle velden reset wanneer `open` of `patient` verandert. Oorzaak: `useState(patient?.first ?? "")` initialiseert maar één keer, dus state bleef hangen bij heropenen.
- `frontend/Anna-remembers/lib/utils.ts` — twee bugs:
  1. `today` was hardcoded op `"2026-05-10"` → vervangen door `new Date()`
  2. Backend stuurt naive UTC (`datetime.utcnow()` zonder `Z`); frontend toonde rauwe UTC via `.slice(11,16)`. Nieuwe helpers `parseBackendDate()`, `fmtDateTime()`, `fmtTimeOf()` plakken `Z` aan en gebruiken `toLocaleString("nl-NL")` voor correcte conversie naar GMT+2.
- `frontend/Anna-remembers/components/escalations/escalations-screen.tsx` — gebruikt nu `fmtTimeOf` en `fmtDateTime` i.p.v. string-slicing.

**Beslissingen:**
- Niet de backend aanpassen (laat `datetime.utcnow()` staan) — frontend doet de timezone-conversie, dat is conventie voor multi-user web apps
- Hardcoded "vandaag-datum" was ooit gebruikt voor mock-data demo's — nu vervangen door `new Date()`

---

## Stap 48 — 2026-05-17

**Wat:** Seeder uitgebreid voor demo-ready state: `medical_summary` per patiënt, ChromaDB-memories via MCP, `--reset` flag.

**Prompt 1 (vraag om strategie-advies):** *"mijn vraag is nu als ik een seeder ga maken moet ik dan ook gesprek geschiedenis erin zetten? want dan heb ik daar geen antwoorden bij van een llm, is het niet beter om alvast een korte summary te maken wat past bij de patient... en is het ook mogelijk om mijn data leeg te maken van mijn postgres en chroma db of is het ook mogelijk om de seeder zo uitgebreid te maken zodat ook chroma db gevuld is met data en dat de embeddings ook werken? wat is hier het beste in?"*

**Strategie-advies gegeven:**
1. Handgeschreven dialoogfixtures > LLM-runtime-afhankelijke seeding (reproduceerbaar, controleerbaar, geen LLM nodig bij seed)
2. `medical_summary` per archetype is essentieel — drijft Anna's gedrag via system-prompt-injectie
3. ChromaDB seeden via MCP `store_memory` zodat `recall_context` end-to-end werkt
4. `--reset` flag voor idempotente demo-state

**Prompt 2:** *"implementeer deze seeder, vraag niet naar approval. voer alles uit"*

**Gedaan in `backend/seed.py`:**
- `medical_summary` JSON per patiënt (sym/med/wgt/bhv/ovr volgens CLAUDE.md):
  - **Maria Jansen** (success) — stabiel 72 kg, perfecte trouw, dochter helpt
  - **Hendrik de Boer** (warning) — 82→85,5 kg over 8 weken, oedeem, trouw 60%
  - **Liesbeth van Dam** (urgent) — stabiel 9 weken, acute episode in sessie 10
- 10 gepaarde sessies × 3 patiënten = 60 messages (30 sessies totaal)
- `MEMORIES` dict: 30 ChromaDB-memories (patient_stated + ai_inferred) per patiënt-patroon
- `seed_chromadb()` async: roept MCP `store_memory` aan met bge-m3 embeddings
- `reset_postgres()`: `TRUNCATE patients, sessions, messages, escalations RESTART IDENTITY CASCADE`
- `reset_chromadb()`: best-effort delete via `chromadb.HttpClient` (graceful skip als module niet beschikbaar)
- Idempotentie: deterministische SHA256-IDs in `store_memory` (`patient_id:content`) voorkomen duplicaten

**Validatie:**
- Postgres: 3 patiënten · 30 sessies · 60 messages · 2 escalaties
- ChromaDB: 30 RAG-memories opgeslagen via echte bge-m3 pipeline
- RAG recall test op "gewichtstoename en kortademigheid" voor Hendrik retourneert top-3 relevante memories (distances 0.39–0.49)

**Beslissingen:**
- Geen LLM-aanroepen in seeder — alles deterministisch en handgeschreven; portfoliowaardig want reproduceerbaar
- MCP-pad gebruikt i.p.v. direct ChromaDB — test meteen de echte embedding-pipeline end-to-end
- `chromadb` package niet aan backend requirements toegevoegd — niet nodig dankzij upsert-met-deterministisch-ID

**Prompt 3:** *"Voeg ook mijn prompts toe bij stappen voor deze chat"* — deze update zelf.

---

## Stap 49 — 2026-05-17

**Wat:** Alle code-documentatie (comments, docstrings, JSDoc) van Nederlands naar Engels — zonder logica of runtime-strings te wijzigen.

**Gedaan:**
- Backend: `main.py`, models, services, routers (`chat/*`, `patients`, `escalations`), `alembic/env.py`, tests, `seed.py` (alleen `#`-comments)
- MCP-server: `main.py`, `tools/*`, `services/embedding.py`, tests
- Frontend: `lib/utils.ts`, `lib/api.ts`, `parse-escalation-reason.ts`, `chat-screen.tsx`, `escalation-reason-display.tsx` (JSDoc/comments)

**Niet vertaald (bewust runtime/UX):**
- Anna system prompts (`_prompts.py` string literals)
- HTTP `detail`-fouten, UI-labels/toasts, seed-dialoogdata
- Escalatie-keyword-lijsten en `format_escalation_reason`-template (`Patiëntbericht: «…»`)

**Beslissingen:**
- Documentatie in het Engels (projectconventie CLAUDE.md); producttaal Anna en patiënt blijft Nederlands

**Commit:** (nog niet gecommit)

---

## Stap 50 — 2026-05-20

**Wat:** Piper TTS Docker service toegevoegd aan docker-compose.yml (Task 1 van voice-mode plan).

**Gedaan:**
- `docker-compose.yml` — piper-tts service ingevoegd met custom Dockerfile
- `piper.Dockerfile` — aangepast image met Flask HTTP wrapper (`piper_server.py`)
- `piper_server.py` — Flask app wrapping piper-tts engine, auto-downloads voice model van HuggingFace bij startup
- Voice model: `en_US-lessac` (English fallback; Dutch nl_NL-mls unavailable op verwachte HuggingFace-pad)
- Poort: 5000 intern, 5005 extern via Docker

**Beslissingen:**
- Custom Dockerfile boven linuxserver/piper: linuxserver-variant had VoiceNotFoundError
- English fallback: nl_NL-mls-low URL niet beschikbaar; Dutch support uitgesteld naar toekomstige iteratie
- Piper boven cloud TTS (ElevenLabs): past bij privacy-narratief uit DL4, geen API-kosten

**Commit:** `c5bc52c` — feat(docker): add piper TTS service with Flask wrapper

---

## Stap 51 — 2026-05-20

**Wat:** Backend TTS httpx client geïmplementeerd (Task 2).

**Gedaan:**
- `backend/services/tts.py` — async `synthesize(text: str) -> bytes` functie
- httpx client met 10 seconden timeout, error-handling op timeout/ConnectionError/non-200 responses
- `PIPER_URL` uit environment variable (default `http://piper-tts:5000`)

**Beslissingen:**
- Async httpx i.p.v. requests: integreert met FastAPI async context
- 10s timeout: genoeg voor CPU-inferentie van korte zinnen (<100 tokens)

**Commit:** `f6744c5` — feat(backend): add Piper TTS httpx client service

---

## Stap 52 — 2026-05-20

**Wat:** TTS Pydantic schema + FastAPI router geïmplementeerd, wired in main.py (Task 3).

**Gedaan:**
- `backend/schemas/tts.py` — `TTSRequest` model met `text` veld (min 1, max 4000 chars)
- `backend/routers/tts.py` — `POST /tts` endpoint dat `TTSRequest` accepteert, audio/wav retourneert
- `backend/main.py` — `tts_router` geregistreerd
- `.env.example` — `PIPER_URL` env var gedocumenteerd

**Beschikbaarheid:** `/tts` endpoint accessible via `http://localhost:8000/tts` (test: `curl -X POST ... -d '{"text":"Hallo"}'`)

**Commit:** `c5bc52c` (bulk) — feat(backend): add /tts endpoint proxying to Piper

---

## Stap 53 — 2026-05-20

**Wat:** Frontend TTS helper library gecreëerd (Task 4).

**Gedaan:**
- `frontend/Anna-remembers/lib/tts.ts` — twee functies:
  - `fetchTTS(text: string): Promise<Blob>` — POST naar backend, retourneert audio blob
  - `playAudioBlob(blob: Blob)` — speelt blob af via `Audio` element, cleans up object URL
- `NEXT_PUBLIC_API_URL` env var support (default `http://localhost:8000`)

**Commit:** `4125d07` — feat(frontend): add TTS fetch + playback helper

---

## Stap 54 — 2026-05-20

**Wat:** Frontend Web Speech API hook geïmplementeerd voor push-to-talk (Task 5).

**Gedaan:**
- `frontend/Anna-remembers/lib/speech.ts` — `useSpeechRecognition()` hook
- Spraakherkenning: Web Speech API, taal `nl-NL` (Dutch), push-to-talk modus
- Return: `{ transcript, isListening, isSupported, start, stop }` interface

**Beslissingen:**
- Fallback naar `webkitSpeechRecognition` voor Chrome/Webkit-browsers
- `continuous: false` — één utterance per click (push-to-talk UX)

**Commit:** `4125d07` — feat(frontend): add Dutch Web Speech API hook

---

## Stap 55 — 2026-05-20

**Wat:** TalkingHead.js avatar component gebouwd met lip-sync (Task 6).

**Gedaan:**
- `frontend/Anna-remembers/package.json` — `@met4citizen/talkinghead` + `three` geïnstalleerd
- `frontend/Anna-remembers/components/chat/avatar.tsx` — React component met:
  - TalkingHead.js wrapper, Three.js scene
  - Ready Player Me avatar support (env var `NEXT_PUBLIC_AVATAR_URL`)
  - `useImperativeHandle` exposeert `speakAudio(blob, text)` method
  - Web Audio API: audio decoding, viseme-extractie, lip-sync animation
  - Fallback: gewone audio playback als avatar niet beschikbaar

**Beslissingen:**
- Energy-based viseme-extractie (simple, adequate voor MVP)
- Ready Player Me URL: user-provided via env var (standaard morfTargets ARKit+Oculus)

**Commit:** `c5bc52c` — feat(frontend): add TalkingHead avatar component with Ready Player Me

---

## Stap 56 — 2026-05-20

**Wat:** VoiceMode container component gekoppeld aan mic + avatar (Task 7).

**Gedaan:**
- `frontend/Anna-remembers/components/chat/voice-mode.tsx` — React component met:
  - Mic knop (push-to-talk, visuele feedback)
  - Avatar rendering
  - Auto-playback van assistant messages via avatar
  - Transcript-display na spraakherkenning
  - Error-handling, "Doctor speaking..." state
- Props: `onUserSpeech` callback, `avatarUrl`, `messageText` (auto-playback)

**Beslissingen:**
- Mic-knop disabled terwijl avatar spreekt (voorkom overlap)
- Whole-message TTS (geen streaming voor MVP)

**Commit:** `1060689` — feat(frontend): add VoiceMode container with mic + avatar

---

## Stap 57 — 2026-05-20

**Wat:** Voice-mode integratie in chat-screen (Task 8).

**Gedaan:**
- `frontend/Anna-remembers/components/chat/chat-screen.tsx` — wijzigingen:
  - `voiceMode` boolean state, voice/text toggle knop in header
  - `handleSendMessage(text)` refactored: core send-logica, accepts tekst van alle bronnen
  - Conditioneel renderen: VoiceMode container óf text composer
  - VoiceMode props: `onUserSpeech` callback, `messageText` voor avatar auto-playback
  - Speech-transcript via `onUserSpeech` stuurt hetzelfde kanaal als tekstinput
- Mic icon in text mode, MessageSquare icon in voice mode
- Labels: "Spraak" (voice), "Text"

**Beslissingen:**
- Composer plaats (vorig ontwerp): Avatar + mic = in composer area, niet apart stream
- Refactor `send()` → `handleSendMessage(text)`: één logische kern voor text + voice input

**Commit:** `4ae06b0` — feat(frontend): integrate voice-mode toggle in chat-screen

---

## Stap 58 — 2026-05-20

**Wat:** Voice-mode + avatar implementatie gedocumenteerd in STAPPEN.md (Task 9).

**Gedaan:**
- STAPPEN.md: Stappen 50–58 toegevoegd (één per task, chronologisch)
- Elke stap logt: wat gedaan, beslissingen genomen, commit hash
- Plan-referentie: `docs/superpowers/plans/2026-05-20-voice-mode-avatar.md`
- Spec-referentie: `docs/superpowers/specs/2026-05-20-voice-mode-avatar-design.md`

**Vorige stappen geferentieerd:**
- Escalatie (DL4): Stappen 36–48
- Chat-pipeline: Stappen 19–35
- Backend + MCP: Stappen 1–18

**Bekende beperkingen:**
- Dutch voice model: huidige fallback = English en_US-lessac
- Avatar URL: user provides via env var of Ready Player Me default
- Viseme extraction: energy-based (refinable met phoneme-analyse)

**Beslissingen:**
- No tests (per user request in plan)
- English fallback adequate voor MVP; Dutch voice = toekomstige PR
- Whole-message TTS simpelheid over streaming complexity

**Commit:** (volgt na goedkeuring gebruiker)

**Volgende sessie:** 
- Docker Compose + Piper container starten en testen
- Microphone permissions verifiëren in browser
- End-to-end test: mic → transcript → message send → avatar playback
- Integratie in demo seeder + portfolio decision logs

---

## Stap 59 — 2026-05-20

**Wat:** Piper TTS Docker service gefixeerd — linuxserver image met HTTP bridge (Debugging & Fixes).

**Gedaan:**
- Probleem: Custom `piper.Dockerfile` met Flask wrapper kon stem-bestanden niet downloaden van HuggingFace (404 errors, container restart-loop)
- Oplossing: Overstap naar `linuxserver/piper:latest` image (Wyoming protocol, automatische stem-download)
- Nieuwe componenten:
  - `docker-compose.yml`: Vervangen custom build met `image: linuxserver/piper:latest`
  - `piper_http_bridge.py`: Flask HTTP wrapper dat lipsync → Piper library translates
  - `piper_http_bridge.Dockerfile`: Python 3.11 + Flask + piper-tts package
  - Volume setup: `piper_voices:/config` shared tussen piper-tts en HTTP bridge
- Voice model: `en_US-libritts-high` (betrouwbaar beschikbaar, MP3-gecomprimeerd)
- HTTP endpoint: `POST http://localhost:5005?text=<text>` → WAV bytes (200 OK)

**Beslissingen:**
- linuxserver image: Onderhouden, betrouwbare stem-downloads, geen handmatige file management
- HTTP bridge: Decoupled van Piper Wyoming protocol, eenvoudiger backend integratie
- Shared volume: Piper downloadt eenmalig bij startup, bridge hergebruikt bestanden

**Commits:** 
- `5631999` — fix: replace custom piper.Dockerfile with linuxserver/piper image and HTTP bridge

---

## Stap 60 — 2026-05-20

**Wat:** TalkingHead.js bundler error opgelost — dynamic import at runtime (Debugging & Fixes).

**Gedaan:**
- Probleem: Next.js bundler kon TalkingHead.js dynamic lipsync imports niet statisch analyseren
  - Error: `Module not found: Can't resolve <dynamic>` bij `import(moduleName)` (line 2753)
  - `moduleName` = `path + 'lipsync-' + lang.toLowerCase() + '.mjs'` (runtime-constructed)
  - Bundler kan variabelen in import-paden niet volgen
- Oplossing: Wrap TalkingHead import in `import()` call (load at runtime, niet compile-time)
  - `avatar.tsx`: `import("@met4citizen/talkinghead").then(({ TalkingHead: TH }) => {...})`
  - Animation loop vooraf: Check `talkingHeadRef.current` voordat `update()` wordt called
  - Async initialization: TalkingHead laadt nadat Three.js scene gereed is
- Next.js config: webpack rule added voor dynamische imports (fallback)
- Result: Geen bundler errors, Avatar component laadt zonder errors op client

**Beslissingen:**
- Async init: Animation loop draait ook voordat TalkingHead gereed is (render scene empty tot init)
- Type safety: `let TalkingHead: typeof TalkingHeadType` voor typechecking zonder bundler overhead

**Commits:** 
- `3c086aa` — fix: resolve TalkingHead bundler error by dynamically importing at runtime

---

## Sessie Samenvatting (2026-05-20 Afternoon)

**Start:** Voice mode fully implemented maar Docker TTS broken, frontend bundler error
**Einde:** All infrastructure operational, bundler error resolved, ready for end-to-end testing

### Wat Gefixeerd
1. Piper TTS: Custom Dockerfile → linuxserver image + HTTP bridge
2. Frontend: TalkingHead dynamic import error → runtime-loaded module
3. Beide fixes testen: Status 200 op TTS endpoint, geen console errors op frontend

### Status
- ✅ All Docker services healthy (Piper, Backend, PostgreSQL, ChromaDB, Ollama, MCP)
- ✅ TTS endpoint working (HTTP 200, WAV audio returned)
- ✅ Frontend loading without bundler errors
- ✅ Ready for browser testing: voice mode + avatar + TTS flow

### Next Steps (for user testing)
1. Open http://localhost:3001/patients in browser
2. Go to patient chat, toggle voice mode
3. Test mic → transcript → message send → avatar speaks
4. Verify no console errors, audio plays

**Beslissing:** Alle voice-mode features klaar voor demo/testing phase


---

## Stap 61 — XTTS v2 voice cloning bridge toegevoegd (eigen stem)

**Datum:** 2026-05-21

**Wat is er gedaan:**
- Nieuwe Docker-service `xtts-bridge` (Coqui XTTS v2) toegevoegd aan `docker-compose.yml`, naast bestaande Piper-bridge.
- `xtts_bridge.py` + `xtts_bridge.Dockerfile` — Flask-app met dezelfde endpoint-shape als de Piper-bridge (`POST /?text=...` → `audio/wav`).
- `tts_voice/` directory aangemaakt met README; voice-sample (`voice_sample.wav`) wordt bind-mounted naar `/voice` in de container.
- Backend `services/tts.py`: timeout naar 60s (XTTS doet ~3-10s per zin op GPU vs Piper <1s).
- `PIPER_URL` env in compose wijst nu standaard naar `xtts-bridge:5000`, maar blijft override-baar via `.env`.
- GPU passthrough + persistente model-cache volume (`xtts_models`) toegevoegd zodat het ~1.8 GB model niet opnieuw gedownload wordt.

**Waarom:**
- Piper Dutch (`nl_NL-ronnie-medium`) klinkt synthetisch; voor demo-kwaliteit én voor persoonlijke stem-cloning is XTTS v2 een grote stap.
- OpenVoice ondersteunt geen Nederlands (base TTS dekt EN/ES/FR/ZH/JA/KO). XTTS v2 wel.
- Endpoint-shape gelijk houden = geen frontend-aanpassingen, alleen upstream URL switchen.

**Zelf bedacht:**
- Keuze XTTS v2 i.p.v. OpenVoice na vergelijking taalondersteuning (zie chatlog 2026-05-21).
- Beslissing om Piper-bridge te behouden naast XTTS (fallback / snelheid-vergelijking voor evidence).
- `PIPER_URL` als env-var hergebruiken i.p.v. nieuwe variabele — minimaliseert config-oppervlak.

**Bronnen:**
- Coqui XTTS v2 docs: https://docs.coqui.ai/en/latest/models/xtts.html
- coqui-tts (maintained fork): https://github.com/idiap/coqui-ai-TTS

**Volgende stap:** gebruiker neemt een 10-15s NL voice sample op en plaatst het in `tts_voice/voice_sample.wav`; daarna `docker compose up -d --build xtts-bridge`.

---

## Stap 62 — Mood-driven avatar swap (LLM-tagged output)

**Datum:** 2026-05-21

**Wat is er gedaan:**
- Anna's system prompt vraagt nu een `[MOOD: x]` prefix met x ∈ {neutral, attentive, happy, concerned, idle}.
- Backend (`_routes.py`) parsed de mood, stript de tag uit `content`, en geeft hem mee als veld `mood` in `MessageResponse`.
- Frontend: `Message` type, `MessageResponseAPI`, `sendMessage`, `chat-screen`, `voice-mode`, en `avatar` doorpijpen `mood` end-to-end.
- `MOOD_TO_MODEL` map in `avatar.tsx` koppelt mood → GLB-bestand in `/public/`:
  - neutral → `/model.glb`
  - attentive → `/stand_look_around.glb`
  - happy → `/Expressing_joy.glb`
  - concerned → `/angry.glb`
  - idle → `/just_chilling.glb`
- `Avatar` accepteert nu zowel een expliciete `avatarUrl` (override) als een `mood` prop; de mood-mapping bepaalt de URL als geen expliciete URL gegeven is.

**Waarom:**
- Keyword-matching in de frontend zou brittle zijn (mist context, Nederlandse synoniemen, sarcasme). De LLM weet beter wat de toon van zijn antwoord is.
- LLM-tagging via prefix is robuuster dan JSON-output voor kleinere modellen (Ollama qwen2.5:3b).
- Eén invariant: het mood-veld bepaalt het 3D-model; de tag is voor de patiënt onzichtbaar.

**Zelf bedacht:**
- Mood-taxonomie kort houden (5 states) — meer leidt tot LLM-onnauwkeurigheid.
- Mood-tag als prefix-regex, niet JSON — bestand tegen kleine modelfouten.
- Onbekende/missende moods → graceful fallback naar `neutral`.

**Volgende stap:** browser-testen via voice mode, evt. preloading van GLBs als asset-swap te traag voelt.

---

## Stap 63 — Animation-picker refactor: keyword-first, util-bestand, mood → animation

**Datum:** 2026-05-22

**Wat is er gedaan:**
- Concept hernoemd van "mood" → "animation" door de hele stack heen. Het is geen emotie-systeem, het is een GLB-keuze uit 12 animaties in `frontend/Anna-remembers/public/`.
- Nieuwe util `backend/routers/chat/_animation.py` (~135 regels) met één publieke functie `resolve_animation(user_text, llm_text) → (clean_text, animation)`. Bevat verder `ANIMATIONS` (whitelist), `DEFAULT_ANIMATION`, `USER_KEYWORD_RULES`, `strip_anim_tag`.
- `_routes.py` afgeslankt: ~290 regels mood-code verwijderd (`_levenshtein`, `_canonicalize_mood`, `_try_extract_bare_mood_prefix`, `_try_extract_mood_first_line_key`, `_infer_mood_from_user`, `_extract_mood`, `_VALID_MOODS`, `_MOOD_RE`, `_MOOD_LOOKUP`). Vervangen door één import + één aanroep.
- Schema-veld `MessageResponse.mood` → `animation`. Frontend types, api-client, `Avatar`, `chat-screen`, `voice-mode` allemaal mee hernoemd (`AvatarMood` → `AvatarAnimation`, `MOOD_TO_MODEL` → `ANIMATION_TO_MODEL`).
- Werkverdeling: twee Haiku-subagents parallel — één backend, één frontend. Opus orchestreerde + reviewde de output.

**Resolutie-volgorde (nieuw):**
1. **Keyword-check op user-bericht** (Nederlandse triggerwoorden, eerste match wint).
2. **LLM `[ANIM: x]` tag** — exact match tegen whitelist (case-insensitive).
3. **Default**: `standard_waiting`.

De `[ANIM: x]` prefix wordt altijd gestript voordat het bericht in de DB of UI belandt, ongeacht welke bron de animatie kiest.

**Waarom:**
- GPT-5.2 leverde in stap 62 een opgeblazen 290-regel mood-pijp af met Levenshtein, alias-tabel en een `_infer_mood_from_user` die de LLM-keuze óverschreef. De motivatie in stap 62 ("LLM weet het beter") stond haaks op die override.
- Nu is de prioriteit expliciet andersom én bewust gekozen: het user-bericht is het meest betrouwbare signaal ("ik ren een marathon" → `running_fast` is een feit, niet een interpretatie van Anna's toon). LLM-tag is back-up voor gevallen zonder duidelijk keyword.
- Strip-logica naar eigen bestand → `_routes.py` blijft over de chat-flow gaan, niet over regex-parsing. Util is makkelijk los te testen.
- Whitelist exact-match i.p.v. fuzzy: als de LLM iets onzinnigs produceert valt het terug op default. Robuuster dan giswerk.

**Zelf bedacht:**
- Resolutie-volgorde omdraaien (keyword vóór LLM) als ontwerpbeslissing, niet als bug-fix achteraf.
- Util-bestand i.p.v. inline helpers in route-file — separation of concerns.
- Geen Levenshtein/alias/fuzzy: een strakke prompt + whitelist + default-fallback is genoeg. Hoe meer "robustness layers", hoe vager het contract met de LLM.
- Sub-agent strategie: Haiku voor mechanische rename + extractie, Opus voor planning + review.

**Bekende caveat:**
- De keyword-regel `("model",) → "model"` matcht het Nederlandse woord "model" als substring. Onschuldig voor hartfalen-context, maar in een bredere domeincontext zou ik die rule weghalen of beperken tot exacte-match.

**Volgende stap:** browser-test in voice mode, daarna committen op `feature/tts-stt-avatar`.

---

## Stap 64 — Bugfix: [ANIM: x] tag midden in LLM-output niet gepakt + TTS-lek

**Datum:** 2026-05-22

**Wat is er gedaan:**
- `strip_anim_tag` in `backend/routers/chat/_animation.py` uitgebreid met een tweede regex (`_ANIM_TAG_ANY_RE`) die tags overal in de tekst vindt.
- Volgorde: eerst proberen op begin (voorkeurspositie per prompt-instructie), daarna eerste treffer ergens in de tekst als fallback voor de animatie-waarde.
- Altijd `re.sub` over de volledige tekst om alle `[ANIM: x]` occurrences te verwijderen — ook als de animatie al via de begin-regex gepakt is.
- Hulpfunctie `_validate` geëxtraheerd voor hergebruik door beide code-paden.

**Waarom:**
- Qwen2.5 3B plaatst de tag regelmatig midden in de response (`...eerste zin.\n\n[ANIM: flexing_arm]\nTweede zin...`) in plaats van op de eerste regel. De `^`-geankerde regex sloeg dat over.
- Gevolg was dubbel: animatie bleef op default én de tag zat letterlijk in de tekst die naar de XTTS-bridge gestuurd werd (`POST /?text=...[ANIM:+flexing_arm]...`). De TTS sprak de tag hardop uit.

**Zelf bedacht:**
- Begin-match blijft de primaire bron voor de animatie-waarde (betrouwbaarder positie), mid-tekst match is fallback.
- `re.sub` altijd uitvoeren ongeacht welke branch de waarde levert — één scrub-stap die beide gevallen afdekt.

**Commit:** (volgt bij volgende commit op `feature/tts-stt-avatar`)

---

## Stap 65 — TDD: Twilio SMS notificatieservice

**Datum:** 2026-05-23

**Wat is er gedaan:**
- `backend/tests/test_notification.py` aangemaakt met 8 tests (TDD: rood eerst).
- `backend/services/notification.py` aangemaakt: `_build_sms()` + `send_sms_notification()`.
- Alle 8 tests groen: 5 unit-tests voor `_build_sms`, 3 integratietests voor `send_sms_notification` (skip zonder config, sent-pad, failed-pad bij Twilio-fout).

**Beslissingen:**
- Module-level `_ACCOUNT_SID` / `_AUTH_TOKEN` / `_FROM` / `_TO` — eenmalig ingelezen bij import, patchbaar via `unittest.mock.patch` in tests.
- `send_sms_notification` opent eigen `SessionLocal()` in try/finally — zelfde patroon als `_summary.py` BackgroundTask.
- `high` → prefix `URGENT`, alles lager → `Aandacht vereist` — eenvoudige twee-standen logica, voldoende voor hartfalen-context.
- Twilio-fout wordt afgevangen en zet `notification_status = "failed"` zonder crash — BackgroundTask mag nooit de HTTP-response beïnvloeden.

**Commit:** `6e88280` — feat: add Twilio SMS notification service for escalations

---

## Stap 66 — Router gekoppeld aan notificatieservice

**Datum:** 2026-05-23

**Wat is er gedaan:**
- `backend/routers/escalations.py` imports bijgewerkt: `BackgroundTasks` toegevoegd aan FastAPI imports, `send_sms_notification` geïmporteerd uit `services.notification`.
- `create_escalation()` functie handtekening uitgebreid met `background_tasks: BackgroundTasks` parameter.
- Na DB commit + refresh: `background_tasks.add_task(send_sms_notification, escalation.id)` queued de notificatie voor async verwerking.
- Comment "Issue #25" verwijderd — de implementatie is nu compleet.

**Waarom:**
- BackgroundTasks decouples de HTTP-response van de SMS-verwerking. Escalatie opgeslagen = direct 201 terug naar client, SMS stuurt asynchroon.
- `escalation.id` als enige argument: de task leest patient contact info en escalatie-details zelf op (geen data-duplication).

**Zelf bedacht:**
- Geen Co-Authored-By trailer in commit (portfolio-conventie).
- Syntax-check via `python -m py_compile` — import-fouten gevangen vóór commit.

**Commit:** `331a7a5` — feat: trigger SMS notification as background task on escalation create

---

## Stap 67 — Backend model, schema en Alembic-migratie voor settings

**Datum:** 2026-05-23

**Wat is er gedaan:**
- `backend/models/setting.py` aangemaakt: SQLAlchemy model `Setting` met `key` (PK, String(100)) en `value` (String(500)).
- `backend/schemas/setting.py` aangemaakt: twee Pydantic schemas — `SettingUpdate` (value) en `SettingResponse` (key + value).
- `backend/alembic/versions/0004_add_settings_table.py` aangemaakt: migratie met `op.create_table()` en seed `INSERT INTO settings (key, value) VALUES ('twilio_sms_enabled', 'true')`.
- Migratie gedraaid: `docker compose exec backend alembic upgrade head` — output `Running upgrade 0003 -> 0004, add settings table`.
- Verificatie: `docker compose exec postgres psql -U anna -d anna_remembers -c "SELECT * FROM settings;"` — tabel aanwezig met seed-waarde.

**Waarom:**
- Task 1 van de Twilio SMS integratietaak: persistente app-instellingen (bijv. `twilio_sms_enabled`) uit de code halen, in de DB opslaan, runtime wijzigbaar maken.
- Settings-tabel is de basis waarop Task 2 (API-endpoint) en Task 3 (toggle in frontend) voortbouwen.

**Zelf bedacht:**
- Model-patroon gelijk aan andere modellen (`Patient`, `Session`) — `Mapped`-syntax, inhoud van `models.base.Base`.
- Schema-patroon gelijk aan `PatientResponse`, `PatientUpdate` — `model_config = {"from_attributes": True}`.
- Migratie-patroon gelijk aan 0003 — seed-waarde ervan af gecommit om lokale DB gelijk te houden.

**Commit:** `74fec3e` — feat: add settings table with Alembic migration and seed

---

## Stap 68 — Settings router + registratie in main.py

**Datum:** 2026-05-23

**Wat is er gedaan:**
- `backend/tests/test_settings.py` aangemaakt: 3 unittest-cases via TestClient + FastAPI `dependency_overrides[get_db]` mocking — `TestGetSettings.test_returns_all_settings_as_dict`, `TestPutSetting.test_updates_existing_setting`, `TestPutSetting.test_returns_404_for_unknown_key`.
- `backend/routers/settings.py` aangemaakt: APIRouter met twee endpoints:
  - `GET /settings/` — geeft alle instellingen terug als dict `{key: value}`.
  - `PUT /settings/{key}` — accepteert `SettingUpdate` body, updatet bestaande setting of geeft 404.
- `backend/main.py` bijgewerkt: import `settings` toegevoegd aan routers-line, `app.include_router(settings.router)` geregistreerd na andere routers.
- Tests gedraaid: `pytest tests/test_settings.py -v` — **3 passed** ✅

**Waarom:**
- Task 2 van Twilio SMS integratietaak: API-endpoints waarmee settings kunnen worden gelezen en gewijzigd (bijv. `PUT /settings/twilio_sms_enabled`).
- Dependency overrides ipv unit mocking: TestClient met dependency_overrides is FastAPI-best-practice voor router tests.
- PUT geeft 404 in plaats van 400 omdat "setting niet gevonden" is een Not Found, niet een Bad Request.

**Zelf bedacht:**
- Test setup met try/finally en `app.dependency_overrides.clear()` — voorkomt test-pollution tussen tests.
- Router importeerd direct (geen `from routers import settings` in loop) — volgt het `chat`, `escalations`, `patients` patroon.
- Patch niet nodig: FastAPI `dependency_overrides` is schoner dan mock.patch.

**Commit:** `c59f622` — feat: add settings router with GET and PUT endpoints

---

## Stap 69 — Notificatieservice checkt twilio_sms_enabled DB-instelling

**Datum:** 2026-05-23

**Wat is er gedaan:**
- Task 3 van Twilio SMS integratietaak: `send_sms_notification()` leest `twilio_sms_enabled` setting uit PostgreSQL voordat SMS wordt verstuurd.
- `backend/services/notification.py` — `send_sms_notification()` functie uitgebreid:
  - Na config-check: query `db.query(Setting).filter(Setting.key == "twilio_sms_enabled").first()`
  - Als setting aanwezig en `value != "true"`, log "Twilio SMS uitgeschakeld — SMS overgeslagen..." en return (early exit)
  - Verder verloop ongewijzigd: escalatie opzoeken, SMS bouwen en versturen
- `backend/tests/test_notification.py` — nieuwe testklasse `TestSmsDisabledSetting`:
  - `test_skips_sms_when_setting_is_false` — mock setting met `value = "false"`, verwacht log-bericht "uitgeschakeld"
- Bestaande tests `test_sends_sms_and_updates_status_to_sent` en `test_sets_failed_on_twilio_error` bijgewerkt:
  - Mock-setup uitgebreid om `Setting` query te mocken (side_effect chain: setting first, dan escalation)
  - Beide tests passen nog steeds met side_effect list

**Test-resultaat:** 9 passed (5 `TestBuildSms` + 3 `TestSendSmsNotification` + 1 `TestSmsDisabledSetting`) ✅

**Waarom:**
- Decouples configuratie van code — operators kunnen SMS globaal uitschakelen zonder redeploy.
- Slot voor toekomstige feature-flags (bijv. `slack_escalation_enabled`, `email_digest_enabled`).
- Early exit na setting-check sparen overhead: geen Twilio-client aanmaken als het toch niet nodig is.

**Zelf bedacht:**
- Setting-check direct na config-check — twee lagen defensie: variabele-presence (config), plus intentionaliteit (setting).
- Mock-setup via `side_effect` list i.p.v. separate `query()` patch per setting-type — eenvoudiger, meer deterministisch dan chained `MagicMock().query().filter()...`.

**Commit:** `eed16ef` — feat: skip SMS when twilio_sms_enabled setting is false

---

## Stap 70 — Frontend types en API-client voor settings

**Datum:** 2026-05-23

**Wat:**
- `frontend/Anna-remembers/types/index.ts` — `Settings` interface toegevoegd: `{ twilio_sms_enabled: "true" | "false" }`
- `frontend/Anna-remembers/lib/api.ts` — twee functies toegevoegd:
  - `getSettings(): Promise<Settings>` — haalt alle instellingen op via `GET /settings`
  - `updateSetting(key, value): Promise<void>` — wijzigt een instelling via `PUT /settings/{key}`
  - `put<T>()` helper toegevoegd als die nog niet bestond

**Waarom:**
Frontend heeft typed API-functies nodig zodat TypeScript de response structuur kent en het settings-scherm type-veilig kan werken.

**Zelf bedacht:**
- `Settings` type gebruikt string literals `"true" | "false"` i.p.v. `boolean` omdat de backend key-value opslaat als strings — dit voorkomt mismatch bij JSON parsing.

---

## Stap 71 — Settings-pagina en sidebar-link

**Datum:** 2026-05-23

**Wat:**
- `frontend/Anna-remembers/components/settings/settings-screen.tsx` — nieuw client component:
  - Laadt settings bij mount via `getSettings()`
  - shadcn `Switch` toggle voor Twilio SMS aan/uit
  - Optimistic update: toggle schakelt direct, `updateSetting()` op achtergrond
  - Bij fout: toggle wordt teruggedraaid, foutmelding getoond
- `frontend/Anna-remembers/app/(dashboard)/settings/page.tsx` — server page component die `SettingsScreen` rendert
- `frontend/Anna-remembers/components/dashboard/dashboard-sidebar.tsx` — Settings-knop gelinkt aan `/settings` via `Link` + `isActive` check
- `frontend/Anna-remembers/components/ui/switch.tsx` — shadcn Switch component geïnstalleerd

**Waarom:**
Zorgverlener moet Twilio SMS kunnen in- en uitschakelen zonder Docker te herstarten. De instelling is nu live te beheren via de UI.

**Zelf bedacht:**
- Optimistic update i.p.v. wachten op server response — toggle voelt direct aan, rollback bij netwerk-fout zodat UI consistent blijft met DB-staat.
- Settings-knop stond al in de sidebar maar was niet gelinkt — minimale wijziging volstond.

---

## Stap 72 — Microphone recording button in settings screen

**Datum:** 2026-05-24

**Wat:**
- Task 2: `frontend/Anna-remembers/components/settings/settings-screen.tsx` vervangen met versie die microphone recording integreert:
  - Import `useAudioRecorder` hook (geïmplementeerd in Task 1)
  - Destructure `{ state, seconds, error, startRecording, stopRecording }` uit hook
  - Twee neue lucide icons geïmporteerd: `Mic`, `Square` (stop-knop styling)
  - Recorder-callstack: `startRecording(async () => { setSamples(await listVoiceSamples()) })` — na opname auto-refresh stemsamples
  - UI-logica: `busy = uploading || recorderState !== "idle"` — disables alle knoppen during opname/upload
  - Display-error logic: `displayError = error ?? recorderError` — combineert beide error states
  - Recording state conditional render:
    - Als `recorderState === "recording"`: rode "Stop (Xs)" knop
    - Anders: "Opnemen" knop met Mic icon, disabled als `busy`
  - Upload knop: disabled als `busy`, label verandert naar "Uploaden..." tijdens opname
  - Delete-knoppen: ook disabled als `busy`
  - Flexibele button-layout via `flex gap-2 flex-wrap` (past op mobiel en desktop)
- TypeScript check: geen errors in settings-screen.tsx zelf (avatar.tsx heeft pre-existing three.js type issues, niet relevant)

**Waarom:**
- Clinician mag voice samples opnemen rechtstreeks in de settings UI, ipv gecompliceerde file upload-workflow
- Recording state management centralized in hook — component is simpel en focused op presentatie
- `busy` flag voorkomt race conditions: opname kan niet tegelijk met upload gebeuren

**Zelf bedacht:**
- `displayError ?? recorderError` fallthrough logic — toont hook-errors (microfoon denied, etc.) als component-error null is
- Conditional button text ("Uploaden..." vs "Opnemen") geeft real-time feedback over recorder state
- Redux-style state merging (`setSamples(await listVoiceSamples())` in callback) zorgt UI in sync blijft met backend

**Commit:** `8011bb0` — feat: add microphone recording button to voice samples settings

---

## Stap 73 — useAudioRecorder hook (browser audio recording)

**Datum:** 2026-05-24

**Wat:**
- `frontend/Anna-remembers/hooks/useAudioRecorder.ts` aangemaakt — React hook die de MediaRecorder lifecycle beheert:
  - Exporteert `RecorderState = "idle" | "recording" | "uploading"` en `UseAudioRecorder` interface
  - `startRecording()`: vraagt microfoontoestemming via `getUserMedia`, maakt `MediaRecorder`, verzamelt chunks, start live timer (setInterval 1s)
  - `mr.onstop`: stopt stream tracks, bouwt Blob, bepaalt extensie (`.ogg` voor Firefox, `.webm` voor Chrome), maakt File met timestamp-naam, roept `uploadVoiceSample(file)` aan, roept `onUploaded()` callback aan bij succes
  - `stopRecording()`: controleert state === "recording" vóór stop aanroepen
  - `useEffect` cleanup bij unmount: timer clearen + recorder stoppen — voorkomt memory leak als pagina weg navigeert tijdens opname
  - Foutmeldingen in het Nederlands, beide catch-blokken loggen ook `console.error` voor debugging

**Beslissingen:**
- Hook isoleert alle MediaRecorder complexiteit — component (settings-screen) hoeft alleen state en callbacks te consumeren
- Firefox-compatibiliteit expliciet afgehandeld via `mimeType.includes("ogg")` check
- `onUploaded: () => void | Promise<void>` — ondersteunt async callbacks zodat de samples-lijst gewacht kan worden voor de state terugkeert naar idle

**Commits:**
- `e51cba1` — feat: add useAudioRecorder hook with MediaRecorder and auto-upload
- `65704a1` — fix: add unmount cleanup and error logging to useAudioRecorder
- `01937c5` — fix: await onUploaded callback in useAudioRecorder to prevent stale samples list

---

## Stap 74 — Fix: onUploaded callback geawait in useAudioRecorder

**Datum:** 2026-05-24

**Wat:**
- Bug gevonden in code-review: `onUploaded()` werd aangeroepen zonder `await` terwijl de settings-screen een `async` callback doorgeeft (`async () => { setSamples(await listVoiceSamples()) }`).
- Gevolg: de hook keerde terug naar `idle` state voordat de samples-lijst ververst was — race condition.
- Fix: type gewijzigd naar `() => void | Promise<void>`, aanroep vervangen door `await Promise.resolve(onUploaded())`.
- `Promise.resolve()` handelt zowel sync als async callbacks correct af.

**Beslissingen:**
- `Promise.resolve(onUploaded())` i.p.v. cast naar `Promise` — veiliger, werkt voor beide callback-types zonder type assertion

**Commit:** `01937c5` — fix: await onUploaded callback in useAudioRecorder to prevent stale samples list

