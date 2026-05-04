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

**Commit:** zie volgende commit
