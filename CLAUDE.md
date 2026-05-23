# CLAUDE.md — Anna Remembers

## Over dit project

Anna Remembers is een AI-gezondheidsassistent die hartfalenpatiënten begeleidt via
wekelijkse check-ins. Het systeem onthoudt gesprekken, herkent symptoompatronen
over meerdere weken, en escaleert naar een zorgverlener wanneer dat nodig is.

**Student:** Nick van Hooff
**Opleiding:** Fontys ICT — Software Engineering, Semester 4
**Werkmap:** `C:\fontys\semester_4\anna_remembers`

---

## Stack

| Laag | Technologie | Poort |
|---|---|---|
| Frontend | Next.js 15 (App Router) | 3001 |
| Backend API | FastAPI (Python) | 8000 |
| MCP Server | fastmcp (Python, apart proces) | 8001 |
| Relationele DB | PostgreSQL 16 | 5432 |
| Vector DB | ChromaDB (RAG geheugen) | 8002 |
| LLM | Ollama (gemma4:e2b) of cloud: Groq / Anthropic / OpenRouter | 11434 / cloud |
| Embeddings | bge-m3 via Ollama | 11434 |
| TTS (snel) | Piper TTS nl_NL-ronnie via HTTP-bridge | 5005 / 10200 |
| TTS (kwaliteit) | XTTS v2 (Coqui) — GPU, stemkloning | 5006 |
| STT | Web Speech API (browser, cloud) | — |
| Observability | Langfuse (tracing LLM + RAG) | cloud |
| Notificaties | Twilio SMS (escalatie) | cloud |
| Omgeving | Docker Compose (alle lokale services) | — |

LLM-aanroepen in `backend/services/llm.py` zijn provider-agnostisch via een abstracte klasse.
Wisselen van provider = alleen `.env` aanpassen (`LLM_PROVIDER` + bijbehorende API key).

---

## Deliverables — wat het systeem moet kunnen

### 3 gesimuleerde patiënten (minimaal 10 sessies elk)

| Patiënt | Scenario |
|---|---|
| Patiënt 1 | Stabiel — goede medicatietrouw, geen escalatie |
| Patiënt 2 | Geleidelijke verslechtering over meerdere weken — escalatie vereist |
| Patiënt 3 | Plotselinge urgentie tijdens routine check-in |

Het systeem moet:
- Correct herkennen wanneer patronen risico vormen
- Nooit medische geschiedenis verzinnen die niet gemeld is
- Natuurlijke vervolgvragen stellen die refereren aan eerdere gesprekken

### MCP tool-signatures (exact zo implementeren)

```python
store_memory(content: str, source: str, patient_id: str, session_id: str)
# source = "patient_stated" | "ai_inferred"

recall_context(query: str, patient_id: str, limit: int)
# semantische RAG-search over eerdere uitspraken van de patiënt

get_symptom_trends(patient_id: str, weeks: int)
# haalt gestructureerde symptoomdata op uit PostgreSQL

escalate_to_human(patient_id: str, reason: str, urgency: str)
# urgency bepaalt het kanaal en de prioriteit (email vs. Slack)
```

### Dashboard-schermen (Next.js)

1. **Patiëntbeheer** — CRUD voor patiënten, basisgegevens en medicatieschema
2. **Chat per patiënt** — gesprek starten met Anna, volledige gesprekshistorie
3. **Symptoomtrends** — grafieken van kortademigheid, enkelvoetoedeem, gewicht, medicatietrouw
4. **Escalatiebeheer** — overzicht van alle escalaties, status bijhouden

### PostgreSQL datamodel

Gebruik JSONB-kolommen voor flexibele symptoomdata per sessie. Tabellen minimaal:
`patients`, `sessions`, `messages`, `escalations`

---

## Buiten scope (niet implementeren)

- Authenticatie (geen auth, geen login)
- ElevenLabs TTS — te duur, Piper + XTTS zijn geïmplementeerd
- Whisper/lokale STT — lage prioriteit (Issue #47), Web Speech API werkt goed genoeg voor demo
- Twilio bellen (echte telefoongesprekken) — buiten scope, SMS is geïmplementeerd
- SSR in Next.js voor SEO
- Voice sample upload via settings pagina — medium prioriteit, nog niet gebouwd (Issue #48)

---

## Portfoliowerkwijze (drietrapsraket)

Ik documenteer terwijl ik bouw — niet achteraf. Een beoordelaar leest mijn
portfolio via deze lijn:

**GitHub Project (Agile board) → Decision log → Losse evidence → STAPPEN.md**

Elke laag linkt door naar de volgende.

### STAPPEN.md

Elk moment dat ik iets doe, noteer ik het direct in `portfolio/STAPPEN.md`:
- Wat ik deed
- Welke keuze ik maakte en waarom
- Welke prompt ik gebruikte (als relevant)
- Commit hash als er iets gecommit is

**Jij helpt mij STAPPEN.md bijhouden.** Na elke actie die je uitvoert,
voeg je een nieuwe stap toe aan `portfolio/STAPPEN.md` met:
- Stapnummer (oplopend)
- Datum
- Korte beschrijving van wat er gedaan is
- Relevante beslissingen
- Commit hash (als er gecommit is)

### Evidence

Een evidence is een los bestand in `portfolio/evidence/` dat bewijst
dat iets gedaan is. Typen: vergelijkingstabel, bugreport, code diff,
testresultaat, screenshot-beschrijving, benchmark.

Structuur van een evidence:
```
# Evidence [nummer] — [naam]

**Type:** [vergelijkingstabel / bugreport / etc.]
**Datum:** [datum]
**Hoort bij:** Decision log [naam], Stap [N] in STAPPEN.md
**Commit:** [hash] (als van toepassing)

## Inhoud
[het bewijs zelf]

## Bronnen
[genummerde APA-bronnen, alleen als ze daadwerkelijk gebruikt zijn]
```

Maak maximaal 2 evidences per werkdag aan. Kies de meest waardevolle.

### Decision log

Een decision log is kort (max. 3 pagina's) in `portfolio/decision-logs/`.
Hij bevat alleen:
- De kernvraag
- Opties overwogen
- Keuze + redenering
- Links naar losse evidences
- Relevante commits (hash, probleem, aanpassing, hoe ontdekt)

De decision log vertelt het verhaal. De evidence levert het bewijs.
Geen bewijs in de decision log zetten.

---

## Projectstructuur

```
anna_remembers/
├── frontend/                # Next.js 15
├── backend/                 # FastAPI
│   ├── routers/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   │   ├── llm.py           # provider-agnostisch houden
│   │   ├── rag.py
│   │   └── mcp_client.py
│   └── main.py
├── mcp-server/              # fastmcp, draait apart op poort 8001
│   └── tools/
│       ├── memory.py        # store_memory, recall_context (RAG hier)
│       ├── trends.py        # get_symptom_trends
│       └── escalation.py   # escalate_to_human
├── portfolio/
│   ├── STAPPEN.md           # doorlopend logboek
│   ├── decision-logs/
│   └── evidence/
├── docker-compose.yml
└── README.md
```

---

## Architectuurregels — houd je hier altijd aan

1. **Next.js is alleen UI** — geen AI-logica, geen directe database-aanroepen.
   Alle intelligentie zit in FastAPI en de MCP-server.

2. **FastAPI is de enige die de MCP-client aanroept** — Next.js praat nooit
   rechtstreeks met de MCP-server.

3. **MCP-server draait als apart proces** — hij wordt niet geïmporteerd in
   FastAPI, alleen aangeroepen via het MCP-protocol op poort 8001.

4. **RAG zit in de MCP-server** — `recall_context()` in `tools/memory.py`
   doet de ChromaDB vector search. FastAPI weet niet hoe ChromaDB werkt.

5. **Elke herinnering heeft een source-tag** — `patient_stated` of
   `ai_inferred`. Dit is cruciaal: Anna mag nooit symptomen of medicatie
   verzinnen die de patiënt niet heeft gemeld.

6. **Parallelle MCP-aanroepen waar mogelijk** — gebruik `asyncio.gather()`
   als meerdere tools tegelijk aangeroepen kunnen worden. De LLM-aanroep
   domineert toch de latency (500-3000ms), dus lokale hops zijn ruis.

---

## Codeerstijl

- Python: type hints overal, docstrings bij elke publieke functie,
  geen logica in main.py (alleen app-setup en router-imports)
- TypeScript: strict mode aan, geen any, interfaces voor alle
  API-responses in frontend/types/index.ts
- Commentaar: schrijf commentaar in het Nederlands als het gaat om
  portfoliorelevante keuzes, technische commentaar mag in het Engels
- Commits: schrijf commit messages in het Engels, kort en beschrijvend

---

## Wat je ALTIJD doet na een actie

1. Voeg een stap toe aan portfolio/STAPPEN.md
2. Geef aan of deze actie een nieuwe evidence of decision log waard is
3. Als je twijfelt: vraag het — maak niets aan zonder dat ik het goed heb gekeurd

## Wat je NOOIT doet

- Authenticatie implementeren — dat is buiten scope
- LLM-provider hardcoden — houd llm.py provider-agnostisch
- Bewijs in een decision log zetten — dat hoort in losse evidences
- Vage termen gebruiken zonder uitleg tenzij de term eerder uitgelegd is
- Meer dan 2 evidences per dag aanmaken
- Bestaande STAPPEN.md entries overschrijven — altijd toevoegen onderaan

---

## Bekende beslissingen (al gedocumenteerd)

Deze keuzes zijn al gemaakt en gedocumenteerd. Heropener ze niet tenzij ik dat vraag:

| Beslissing | Keuze | Evidence / Decision log |
|---|---|---|
| Frontend framework | Next.js 15 | evidence_frontend_framework.docx |
| Backend taal | Python + FastAPI | Nog te documenteren |
| MCP server positie | Los draaiend proces op poort 8001 | Nog te documenteren |
| Vector database | ChromaDB lokaal in Docker (bewust, voor zichtbare RAG-pipeline) | `portfolio/decision-logs/DL1_vector_database_keuze.md` |
| Relationele database | PostgreSQL 16 met JSONB | Nog te documenteren |
| LLM provider | Ollama + gemma4:e4b (lokaal, GPU passthrough RTX 4050) | Nog te documenteren |
| Embedding model | bge-m3 via Ollama (meertalig, 1024-dim, 8192 context) | `docs/superpowers/specs/2026-05-08-embedding-model-design.md` |
| Alembic vs init-script | Alembic (versie-gecontroleerde migraties, rollback mogelijk) | Nog te documenteren |
| TTS provider | Piper (snel, offline) + XTTS v2 (GPU, stemkloning), instelbaar via settings page | `docs/superpowers/plans/2026-05-23-tts-provider-toggle.md` |
| TTS provider toggle | Key-value `settings` tabel (zelfde patroon als Twilio toggle), optimistic update in frontend | migration 0005 |
| STT implementatie | Web Speech API (browser-native, cloud) — offline Whisper is Issue #47 lage prioriteit | Nog te documenteren |
| Avatar lip sync | Three.js morph targets met volledige ARKit viseme set, Web Audio API FFT frequency analysis | feature/tts-stt-avatar branch |

---

## Huidige bouwstaat (bijgewerkt 2026-05-23)

### Klaar (issue gesloten)
- **Issue #1** — Docker Compose setup: postgres, chromadb, ollama (GPU), backend, mcp-server
- **Issue #2** — FastAPI scaffold: models, schemas, routers, LLM service, Alembic migratie
- **Issue #3** — MCP-server memory tools: `store_memory` + `recall_context` (ChromaDB, bge-m3)
- **Issue #6** (CI) — GitHub Actions CI workflow (build-check op push + PR)
- **Issue #7** (CD) — GitHub Actions CD workflow (push naar Docker Hub op main)
- **Issue #9** — CI/CD pipeline gedocumenteerd als GitHub issue
- **Issue #14** — `escalate_to_human` stub geïmplementeerd + geregistreerd als MCP-tool
- **Issue #19** — Chat-scherm gekoppeld aan FastAPI (echte API, sessierail, history)
- **Issue #28** — Periodieke medische samenvatting: `patients.medical_summary` elke N berichten bijgewerkt via BackgroundTask
- **Issue #29** — Medische samenvatting geïnjecteerd in system prompt als apart blok boven RAG-dossier
- **Issue #32** — Samenvatting omgezet van Markdown naar compact JSON (`sym/med/wgt/bhv/ovr`); `DossierCard` in frontend
- **Issue #44** — TTS integratie: Piper + XTTS via backend, audio playback in chat
- **Issue #45** — STT + avatar: Web Speech API microfooninvoer, 3D avatar (Three.js + GLB), lip sync met ARKit visemes
- **TTS provider toggle** — settings page Select (Piper/XTTS), DB-driven routing via `tts_provider` setting, migration 0005

### MCP-server — deels klaar
- ✅ `mcp-server/services/embedding.py` — `EmbeddingProvider` ABC + `OllamaEmbeddingProvider` (bge-m3)
- ✅ `mcp-server/tools/memory.py` — `store_memory` + `recall_context` (ChromaDB)
- ✅ `mcp-server/tools/escalation.py` — `escalate_to_human` stub
- ✅ `mcp-server/main.py` — alle tools geregistreerd
- ❌ `tools/trends.py` — `get_symptom_trends` nog niet gebouwd

### Chat-pipeline + voice mode (actief, feature/tts-stt-avatar branch)
- `backend/routers/chat.py` — volledig bedraad: RAG, Postgres history, Langfuse tracing, medische samenvatting
- `backend/routers/tts.py` — TTS provider routing via `tts_provider` DB setting
- `backend/services/tts.py` — Piper (`PIPER_URL`) + XTTS (`XTTS_URL`) URL-mapping per provider
- `backend/services/llm.py` — provider-agnostisch: Ollama, Groq, Anthropic, OpenRouter
- `frontend/.../components/chat/avatar.tsx` — Three.js GLB avatar, 72 morph targets, Web Audio API FFT, ARKit visemes
- `frontend/.../components/settings/settings-screen.tsx` — TTS provider Select + Twilio toggle

### Open
- **Issue #13** — `get_symptom_trends` (PostgreSQL week-aggregatie) — nog niet gebouwd
- **Issue #4** — Frontend dashboard volledig wiren (trends + escalaties live)
- **Issue #47** — Offline STT (Whisper) — lage prioriteit, known limitation
- **Issue #48** — Voice sample upload via settings — medium prioriteit
- Gesimuleerde patiënten (10 sessies elk) draaien
- Decision logs DL3+ afronden voor portfolio

### LLM-providers
- **Groq** (aanbevolen voor demo): `LLM_PROVIDER=groq`, gratis tier, llama-3.3-70b-versatile, ~1-3s
- **Ollama lokaal**: `LLM_PROVIDER=ollama`, gemma4:e2b past in 6 GiB VRAM, ~5-20s
- **Anthropic / OpenRouter**: beschikbaar, API key vereist

---

## Start van een nieuwe werksessie

Als ik een nieuwe sessie start, doe dan het volgende:
1. Lees portfolio/STAPPEN.md om te weten waar we gebleven zijn
2. Geef een korte samenvatting: wat was de laatste stap en waar waren we mee bezig
3. Vraag wat ik vandaag wil doen
4. Begin pas dan met werken
