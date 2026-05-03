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

| Laag | Technologie |
|---|---|
| Frontend | Next.js 15 (App Router) |
| Backend API | FastAPI (Python) |
| MCP Server | fastmcp (Python, apart proces) |
| Relationele DB | PostgreSQL 16 |
| Vector DB | ChromaDB (RAG geheugen) |
| LLM | Nog te bepalen — afhankelijk van school API keys |
| Notificaties | Email / Slack (escalatie) |
| Omgeving | Docker Compose (alle lokale services) |

De LLM-provider is nog niet vastgesteld. Houd de LLM-aanroepen in
`backend/services/llm.py` daarom provider-agnostisch — gebruik een abstracte
klasse zodat wisselen alleen die ene file raakt.

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

| Beslissing | Keuze | Evidence bestand |
|---|---|---|
| Frontend framework | Next.js 15 | evidence_frontend_framework.docx |
| Backend taal | Python + FastAPI | Nog te documenteren |
| MCP server positie | Los draaiend proces op poort 8001 | Nog te documenteren |
| Vector database | ChromaDB lokaal in Docker | Nog te documenteren |
| Relationele database | PostgreSQL 16 | Nog te documenteren |

---

## Start van een nieuwe werksessie

Als ik een nieuwe sessie start, doe dan het volgende:
1. Lees portfolio/STAPPEN.md om te weten waar we gebleven zijn
2. Geef een korte samenvatting: wat was de laatste stap en waar waren we mee bezig
3. Vraag wat ik vandaag wil doen
4. Begin pas dan met werken
