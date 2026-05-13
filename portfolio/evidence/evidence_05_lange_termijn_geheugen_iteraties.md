# Evidence 05 — Lange-termijn geheugen: iteratietraject van RAG-only naar periodieke medische samenvatting

**Type:** Iteratieoverzicht met bugrapporten en architectuurbeslissing
**Datum:** 2026-05-13
**Hoort bij:** Issue #28 (periodieke patiëntsamenvatting), Issue #29 (injectie in system prompt)
**Stappen:** Stap 22, 25, 26, 27, 28, 30 in STAPPEN.md

---

## Probleemstelling

Het systeem gebruikt PostgreSQL voor gesprekshistorie (korte-termijn, per sessie) en ChromaDB RAG voor semantisch zoeken over eerder gemelde feiten (lange-termijn, cross-sessie). Na testen bleek dat deze combinatie onvoldoende is voor een hartpatiënt-companion die weken tot maanden meegaat. Er zijn twee afzonderlijke problemen gevonden:

1. **RAG-kwaliteitsproblemen** — RAG werkte technisch, maar de hits waren ruis of werden genegeerd door het model
2. **Architectuurprobleem** — RAG én gesprekshistorie samen geven het model geen holistisch beeld van *wie de patiënt is* over meerdere weken

---

## Deel 1 — RAG-kwaliteitsiteraties (stap 25–28)

### Iteratie 1 — Anna herinnert geen feiten die wél in RAG staan
**Symptoom:** "Waar woon ik?" → Anna antwoordt "Ik heb geen toegang tot je persoonlijke locatiegegevens", terwijl `context_proof` toont: `system_prompt_includes_rag_block: true`, RAG-hit op "ik woon in eindhoven" aanwezig.

**Oorzaak gevonden via `context_proof`:**
```json
"hits": [
  { "content": "waar woon ik",  "distance": 1.19e-7 },
  { "content": "waar woon ik?", "distance": 1.19e-7 }
]
```
De vraag zelf werd opgeslagen in ChromaDB. Bij recall matcht de vraag zichzelf perfect — het feit ("ik woon in eindhoven") staat er niet in.

**Fix:** `store_memory` roept na elke assistant-response óók `store_memory(source="ai_inferred")` aan. Anna's antwoord ("Je woont in Eindhoven") heeft semantische overlap met de vraag én het feit.
**Commit:** `d016d07` — fix(chat): also store Anna response in ChromaDB for cross-session RAG recall

---

### Iteratie 2 — Duplicaten en self-hits
**Symptoom:** Dezelfde uitspraak meerdere keren opgeslagen; RAG-hits bij laag distance waren altijd het huidige bericht zelf, niet historische feiten.

**Fix:** Deterministische content-hash als ChromaDB document-ID (deduplicatie). Noise-filter `ai_inferred` en distance < 0.01 uitgesloten.
**Commit:** `3d191b3` — fix(mcp): deduplicate ChromaDB entries with deterministic content hash ID
**Commit:** `d6133f6` — fix(chat): filter RAG self-hits and ai_inferred noise, strengthen memory instruction

---

### Iteratie 3 — Vragen veroorzaken self-hits, weigeringsantwoorden leren het model door te weigeren
**Symptoom:** Na meerdere "waar woon ik?" vragen stapelde ChromaDB vragen op. Bij de volgende sessie kwamen de vragen hoger terug dan de feiten. Anna's weigeringsantwoorden ("Ik heb geen toegang als AI") in de conversation history leerden het model dit patroon voort te zetten.

**Bevinding via NotebookLM (Lost in the Middle, Liu et al. 2023):**
Feiten die in het midden van de prompt staan worden door LLMs onderpresteerend verwerkt. Weigeringstekst in de history werkt als negatief in-context voorbeeld.

**Fixes:**
- `_is_question()`: Nederlandse vraagsignalen (`waar`, `wat`, `wie`, `hoe` etc.) en vraagtekens → niet opslaan in ChromaDB
- `_is_refusal()`: weigeringspatronen gefilterd uit conversation history vóór LLM-aanroep
- RAG-blok verplaatst naar einde van de system prompt (Lost in the Middle)
- Noise-drempel verhoogd van 0.01 naar 0.08

**Commits:**
- `d7b7d23` — fix(chat): store only facts not questions, move RAG block to end of prompt
- `c0a666f` — fix(chat): detect Dutch questions without ?, filter refusal turns from LLM history
- `38d0d02` — fix(chat): raise noise floor to 0.08, reframe RAG as patient dossier

---

### Iteratie 4 — RAG-blok omgeformuleerd als patiëntendossier
**Symptoom:** Na alle fixes werkte RAG correct voor de meeste vragen, maar voor locatie/persoonsgegevens bleef gemma4:e2b weigeren. Analyse via `context_proof` toonde aan dat `system_prompt_char_length` en `system_prompt_includes_rag_block` identiek waren in werkende en falende sessies.

**Definitieve diagnose:**
gemma4:e2b (~2B effectieve parameters, grotendeels CPU-inferentie op RTX 4050 Laptop) heeft een RLHF-trained reflex op "locatievragen = geen toegang". Die override is sterker dan de system prompt. De RAG-pipeline zelf is aantoonbaar correct.

**Fix:** RAG-blok omgeformuleerd van "Wat de patiënt eerder heeft verteld" naar "PATIËNTENDOSSIER (geautoriseerde medische informatie, altijd beschikbaar)". De framing als dossier reduceert de kans dat het model het als "persoonlijke data zonder autorisatie" behandelt.

Aansluitend: cloud LLM-providers toegevoegd (Anthropic, OpenRouter, Groq). Eerste Groq-test (llama-3.3-70b-versatile) bevestigt dat de pipeline correct is:
```json
"content": "Je woont in Eindhoven. Wil je praten over je planning om te verhuizen naar Londen?"
"hits": [
  { "content": "ik woon in eindhoven", "distance": 0.297 },
  { "content": "ik wil verhuizen naar londn", "distance": 0.381 }
]
```
Anna haalt twee feiten correct op uit een andere sessie en verwerkt ze in één antwoord. Bottleneck was het lokale model, niet de architectuur.

**Commits:**
- `38d0d02` — fix(chat): raise noise floor to 0.08, reframe RAG as patient dossier
- `f08e259` — feat(llm): add Anthropic, OpenRouter, Groq providers

---

## Deel 2 — Architectuurprobleem: RAG is geen dossier

### Bevinding na werkende RAG-pipeline
Na de fixes werkt RAG goed voor semantisch zoeken op specifieke uitspraken. Maar bij langdurige begeleiding (10+ sessies, weken) ontstaat een fundamenteel probleem: RAG haalt per query de 5 meest relevante fragmenten op. Dit geeft geen holistisch beeld van de patiënt. Het model weet niet:

- Welke symptomen *terugkeren* over weken
- Hoe de medicatietrouw zich *ontwikkelt*
- Wat de meest *klinisch relevante patronen* zijn

Een hartpatiënt-companion moet na 20 sessies weten *wie* de patiënt is, niet alleen een reeks losse herinneringen opzoeken.

### Architectuuranalyse (stap 22)
Op basis van een externe analyse (ChatGPT, bewaard als gespreksexport) zijn drie verbeterpunten geïdentificeerd. Twee zijn als issues aangemaakt:

| Punt | Beslissing |
|---|---|
| Selectief opslaan vóór ChromaDB | Uitgesteld — brede opslag met aparte samenvatting heeft de voorkeur |
| Periodieke medische samenvatting per patiënt (Issue #28) | Geïmplementeerd |
| Samenvatting als apart blok in system prompt naast RAG (Issue #29) | Geïmplementeerd als onderdeel van #28 |

### Gekozen oplossing (issue #28)
Een `medical_summary TEXT`-kolom in de `patients`-tabel die elke 10 berichten opnieuw gegenereerd wordt door de LLM. De samenvatting bevat alleen patiënt-gemelde feiten (geen aannames), gestructureerd per categorie: symptomen, medicatietrouw, gewicht, gedrag.

De samenvatting wordt als apart blok (`MEDISCHE SAMENVATTING`) geïnjecteerd boven het RAG-blok in de system prompt — stabiele achtergrondinformatie vs. query-specifieke RAG-hits.

---

## Implementatie — issue #28

| Bestand | Wijziging |
|---|---|
| `backend/alembic/versions/0002_add_medical_summary.py` | Migratie: `ALTER TABLE patients ADD COLUMN medical_summary TEXT` |
| `backend/models/patient.py` | `medical_summary: Mapped[str \| None]` toegevoegd |
| `backend/routers/chat.py` | `_build_summary_prompt()`, `_trigger_summary_update()`, `_async_summary_update()`, trigger in `chat()` endpoint |
| `backend/routers/chat.py` | `_build_system_prompt()` injecteert samenvatting als `MEDISCHE SAMENVATTING`-blok |

**Technische keuze — BackgroundTasks:**
De samenvatting-LLM-aanroep blokkeert de HTTP-response niet. FastAPI's `BackgroundTasks` beheert de levenscyclus; de taak gebruikt een eigen `SessionLocal`-instantie omdat de request-DB-sessie al gesloten is op het moment dat de achtergrondtaak start.

**Commits:**
- `46f6697` — feat(memory): periodic medical summary — update patients.medical_summary every N messages
- `d78e84b` — docs(portfolio): stap 30 — periodieke medische samenvatting (issue #28)

---

## Conclusie

RAG en gesprekshistorie zijn complementair, niet uitwisselbaar:

| Mechanisme | Waarvoor geschikt |
|---|---|
| PostgreSQL history (6 berichten) | Conversatieflow binnen een sessie |
| ChromaDB RAG (5 hits) | Semantisch zoeken op specifieke uitspraken cross-sessie |
| `medical_summary` (elke 10 berichten) | Holistisch beeld van de patiënt over weken; terugkerende patronen; klinische continuïteit |

De iteraties tonen aan dat het RAG-kwaliteitsprobleem (Deel 1) en het architectuurprobleem (Deel 2) onafhankelijk zijn. RAG kon worden gefixed zonder de samenvatting; maar zelfs perfect werkende RAG lost het probleem van ontbrekende patroonherkenning over weken niet op.
