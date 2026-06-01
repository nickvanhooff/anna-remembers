# Decision Log — Anna Remembers

**Naam:** Nick van Hooff  
**Klas:** MA-AAI1  
**Rol:** GenAI Engineer

---

## Entry #4: Hoe detecteer ik betrouwbaar en kostenefficiënt of een patiëntbericht escalatie vereist?

### Onderzoeksvraag

> Welke aanpak gebruik ik om te bepalen of Anna een zorgverlener moet waarschuwen, zodat kritieke situaties altijd worden opgevangen zonder onnodige cloud-tokenkosten?

**Deelvragen:**
- Kan de hoofd-LLM zelf het escalatiesignaal meegeven in zijn antwoord?
- Hoe doen professionele systemen medische triage-detectie?
- Kan een lokaal klein model (qwen2.5:3b) betrouwbaar een escalatiebeslissing nemen?
- Hoe voorkom ik dat snelle berichten leiden tot dubbele of gemiste escalaties?

---

### 1. Context

**Project:** Anna Remembers — AI-gezondheidsassistent voor hartfalenpatiënten

**Waarom dit nu belangrijk is:**  
Anna voert gesprekken met hartfalenpatiënten. Als een patiënt een acuut symptoom of gevaarlijke situatie meldt — bewustzijnsverlies, pijn op de borst, zelfbeschadiging — moet het systeem automatisch een zorgverlener waarschuwen via `escalate_to_human`. Dit mag niet afhangen van de patiënt die zelf op een knop drukt.

**Hoe ik hier tegenaan liep:**  
Ik heb als eerste poging de detectie in de system prompt gezet: Anna kreeg de instructie om `[ESCALATE:high:reden]` aan het einde van haar antwoord toe te voegen als een situatie escalatie vereist. In de praktijk bleek dit onbetrouwbaar — het model voegde het signaal soms niet toe, ook bij berichten als *"ik ga dood"* of *"ik val steeds flauw"*. In testgesprekken werden meerdere duidelijke urgente situaties volledig gemist.

De oorzaak is structureel: het model is getraind om vloeiende gesprekstekst te genereren, niet om een machine-leesbaar formaat-signaal te onthouden middenin een complexe system prompt. Kleinere modellen (llama-3.1-8b, gemma4:e2b) zijn hier gevoeliger voor dan grote modellen.

Daarna heb ik onderzocht hoe dit in een professionele setting wordt opgelost. Mijn bevinding: de standaardaanpak is een **aparte classificatiestap** met een eigen prompt en model — los van de conversatiestap. Dit wordt ook wel een *guardrail* (een veiligheidslaag die LLM-output controleert of filtert) of *intent classifier* (een model dat alleen bepaalt wat de intentie of urgentie van een bericht is) genoemd. De conversatie-LLM doet zijn ding; de classificatie-LLM doet het zijne.

Het probleem met een aparte cloud-classificatieaanroep is dat het per bericht extra tokens kost — voor Groq of Anthropic betekent dat kosten bij elk gespreksbericht, ook als er niks aan de hand is. Ik heb daarom gezocht naar een manier om de classificatie lokaal te draaien, zonder cloudkosten.

**Aangetoonde leeruitkomsten:**

- [x] LO1: Analyseren — drie aanpakken vergeleken op betrouwbaarheid, latency en kosten
- [x] LO2: Adviseren — onderbouwde keuze voor gelaagde aanpak op basis van onderzoek
- [x] LO3: Ontwerpen — gelaagde detectiearchitectuur ontworpen (keywords → lokaal model)
- [x] LO4: Realiseren — geïmplementeerd in `backend/routers/chat.py` en `services/mcp_client.py`
- [ ] LO5: Beheren & Controleren
- [ ] LO6: Professioneel Leiderschap
- [x] LO7: Professionele Standaard — DOT-methode toegepast, professionele guardrail-patronen onderzocht [1]

---

### 2. Succescriteria

| Criterium | Doel | Redenering achter de norm |
|---|---|---|
| **Betrouwbaarheid kritieke gevallen** | Acute situaties (bewustzijnsverlies, pijn op de borst, zelfbeschadiging) worden altijd gedetecteerd | Bij hartfalenpatiënten kan een gemiste escalatie levensgevaarlijk zijn. Nul false negatives (gemiste detecties) op kritieke termen is vereist. |
| **Latency voor de gebruiker** | Nul extra wachttijd op de chat-response | De escalatiedetectie mag de chat-response niet vertragen. Patiënten moeten direct antwoord krijgen. |
| **Cloudtokenkosten** | Geen extra cloud-tokens per bericht voor escalatiedetectie | De chat-LLM (Groq) kost al tokens. Een aparte cloud-classificatieaanroep per bericht verdubbelt effectief de kosten — onnodig als er een lokaal alternatief is. |
| **Observeerbaarheid** | Elke escalatiebeslissing is traceerbaar in Langfuse (cloud-platform voor het loggen en analyseren van LLM-aanroepen) | Medische beslissingen moeten auditeerbaar zijn — wie werd geëscaleerd, wanneer, op basis van wat, welke laag triggerde het. |

---

### 3. Wat ik heb besloten

**Gekozen: gelaagde escalatiedetectie — hardcoded keywords als vangvloer, asynchroon lokaal model (qwen2.5:3b) voor nuancedetectie**

De architectuur bestaat uit twee lagen:

**Laag 0 — Hardcoded kritieke termen (synchroon, vóór LLM-aanroep)**  
Een vaste set medische alarmsignalen die altijd `high`- of `medium`-escalatie triggeren, ongeacht context. Voorbeelden: *"bewusteloos"*, *"pijn op de borst"*, *"coma"*, *"ik ga dood"*, *"flauw"*. Geen AI nodig — als het woord erin zit, is de beslissing gemaakt. Dit is de absolute vangvloer en kost nul extra tokens en nul extra latency.

**Laag 1 — qwen2.5:3b classificatie (asynchroon, BackgroundTask na chat-response)**  
Als laag 0 niet triggert, wordt qwen2.5:3b lokaal gevraagd om te beoordelen of het bericht escalatie vereist. Dit draait als `BackgroundTask` (FastAPI's mechanisme voor taken die na het versturen van de response nog doorlopen — de gebruiker hoeft er niet op te wachten) — de chat-response is al verstuurd als deze analyse begint. De gebruiker wacht nergens op. qwen2.5:3b draait in de bestaande Ollama Docker container; er is geen extra service of cloudverbinding nodig.

**Modelkeuze-iteraties:**  
1. *Gemma 4 e2b* viel af: multimodaal model met vision-encoder (~7 GiB totaal), botste met bge-m3 in VRAM bij gelijktijdige aanroepen → cold-start (het moment waarop een model voor het eerst in VRAM geladen wordt) >30 seconden, gemeten tijdens implementatie.
2. *qwen2.5:0.5b* werkte technisch maar bleek te klein voor Nederlandse causale redenering: hallucineerde redenen ("ik ben vermoeid" → "pijn op de borst gemeld") en miste duidelijke escalaties.
3. *qwen2.5:3b* (huidige keuze) — 6× groter dan 0.5b (3 miljard vs 0.5 miljard parameters), betrouwbaar op Nederlands, classificatielatency ~3–5 seconden in BackgroundTask (gemeten tijdens implementatie). Past nog in beschikbare VRAM naast bge-m3.

Voor burst-berichten (meerdere berichten snel achter elkaar van dezelfde patiënt) wordt een asyncio-semaphore (asyncio is Python's raamwerk voor asynchrone code; een semaphore begrenst het aantal gelijktijdige toegangen tot een gedeelde resource) per patiënt gebruikt. Dit begrenst het aantal gelijktijdige Laag 1-aanroepen per patiënt tot één, zonder dat er een complexe wachtrij nodig is. Een optionele cooldown (`ESCALATION_COOLDOWN_MINUTES`) onderdrukt dubbele escalaties.

---

### 4. Hoe ik dit heb onderzocht (DOT-framework)

**Eigen ervaring (Field):**  
Eerste implementatie als system prompt-signaal (`[ESCALATE:high:reden]` in Anna's antwoord). Getest met echte gesprekken. Bevinding: het model miste escalaties consequent bij berichten als *"ik val steeds flauw"* en *"pijn op de borst"*. De oorzaak is dat format-instructies voor LLMs lager prioriteit hebben dan conversationele output — zeker bij kleinere modellen.

→ Implementatie-iteraties en testresultaten: [evidence_08_escalatie_implementatie.md](../evidence/evidence_08_escalatie_implementatie.md)

**Beschikbaar product analyseren (Library):**  
Onderzocht hoe guardrails en intent classification in productiesystemen worden ingezet. Bevinding: de standaardaanpak is een dedicated classificatie-LLM met een eigen beknopte prompt, los van de conversatie-LLM [1]. Bron: NeMo Guardrails (NVIDIA) [1].

**Prototyping (Workshop):**  
Drie aanpakken uitgewerkt en vergeleken:
- Optie A: aparte cloud-LLM classificatieaanroep (Groq)
- Optie B: prompt-signaal in Anna's antwoord
- Optie C: lokaal model asynchroon + hardcoded vangvloer

Beslissingsmatrix uitgewerkt op betrouwbaarheid, latency, kosten en complexiteit.

→ C3/C4 architectuurdiagrammen van de geïmplementeerde pipeline: [evidence_07_c3_c4_chat_pipeline.md](../evidence/evidence_07_c3_c4_chat_pipeline.md)

---

### 5. Wat ik heb gevonden

| Aanpak | Betrouwbaarheid | Latency gebruiker | Cloudkosten | Complexiteit |
|---|---|---|---|---|
| **Optie B — Prompt-signaal** | Laag (model vergeet het) | Geen extra | Geen extra | Laag |
| **Optie A — Aparte cloud-call** | Hoog | Geen (async) | +tokens per bericht | Middel |
| **Optie C — Lokaal model + keywords** | Hoog (keywords = vangvloer) | Geen (async) | Geen extra | Middel |

Optie B valt af op betrouwbaarheid — aangetoond in testgesprekken.  
Optie A valt af op kosten — structureel duurder per bericht voor een classificatietaak die lokaal kan.  
Optie C combineert de voordelen: betrouwbaar via keywords, nuancedetectie via lokaal model, nul extra cloudkosten.

---

### 6. Voldoet dit aan mijn criteria?

| Criterium | Doel | Gehaald? |
|---|---|---|
| **Betrouwbaarheid kritieke gevallen** | Altijd gedetecteerd | ✅ Laag 0 keywords zijn deterministisch — geen LLM-afhankelijkheid voor kritieke termen |
| **Latency voor de gebruiker** | Nul extra wachttijd | ✅ Laag 0 is sub-milliseconde; Laag 1 draait als BackgroundTask ná de chat-response |
| **Cloudtokenkosten** | Geen extra tokens | ✅ Beide lagen draaien lokaal — zie kostenberekening §6a |
| **Observeerbaarheid** | Traceerbaar in Langfuse | ✅ Volledige trace-structuur per chat-turn — zie §6b |

---

### 6a. Kosten: lokaal vs cloud-classificatie

| Strategie | Extra cloud-tokens/bericht | Extra kosten/maand (100 patiënten, hypothetische schaal) |
|---|---|---|
| Optie A — Cloud-classificatie | +660 input + 30 output | ~$1 op Groq gratis tier; schaalt lineair met patiëntaantal |
| Optie B — Prompt-signaal | +0 | $0 — maar onbetrouwbaar (zie §1) |
| **Optie C — Lokaal + keywords (gekozen)** | **0** | **$0** — ongeacht patiëntvolume |

Toelichting tokenschatting Optie A: ~600 tokens system prompt + patiëntbericht (input) + ~60 tokens JSON-classificatieoutput = ~660 input + 60 output per aanroep.  
Hypothetische schaal van 100 patiënten: scenario gebruikt voor vergelijkbaarheid; het project heeft 3 gesimuleerde patiënten.

Lokale tradeoff: ~250 MB extra VRAM voor qwen2.5:3b + ~3–5 seconden GPU per classificatie. Acceptabel op RTX 4050 die sowieso draait voor bge-m3.

---

### 6b. Langfuse-tracing: wat wordt vastgelegd

Elke escalatiebeslissing is auditeerbaar via Langfuse. Per chat-bericht:

```
chat-turn (root span)
├── rag-retrieval
├── escalation-layer0  → {"triggered": bool, "urgency": "high"|"medium"|"none", "reason": "..."}
└── llm-generation

[BackgroundTask] escalation-layer1
└── escalation-layer1-classify  (model=qwen2.5:3b, input, raw JSON output, patient_id, session_id)
```

Vastgelegd per beslissing: welke laag triggerde, welk model, volledige input + output (false-positives inspecteerbaar), latency per span, token-usage. Implementatie: `chat/_routes.py:289-325` + `chat/_escalation.py:144-196`.

---

### 7. Aannames

- qwen2.5:3b kan classificatietaken met strak JSON-formaat betrouwbaar uitvoeren. Dit is aannemelijk — classificatie is fundamenteel eenvoudiger dan generatie — maar nog niet kwantitatief gevalideerd op dit domein.
- De Ollama container is beschikbaar als de BackgroundTask start. Als Ollama tijdelijk niet reageert (bijv. bij hoge GPU-belasting), faalt de classificatie stil. Laag 0 keywords blijven dan de enige detectie.
- Bij productiegebruik met veel gelijktijdige patiënten kan de asyncio-semaphore een bottleneck worden. Voor drie gesimuleerde patiënten is dit niet verwacht.

---

### 8. Bronnen

**(1)** Rebedea, T. et al. (2023). *NeMo Guardrails: A Toolkit for Controllable and Safe LLM Applications with Programmable Rails.* arXiv:2310.10501.  
[https://arxiv.org/abs/2310.10501](https://arxiv.org/abs/2310.10501)  
Architectuurpatroon: classificatie en conversatie als losse componenten — aparte rail voor intent-classificatie los van de conversatie-LLM.

---

### 9. Implementatiebewijs

| Wat | Bewijs |
|---|---|
| Eerste poging: system prompt-signaal | [Stap 37 in STAPPEN.md](../STAPPEN.md) — `[ESCALATE:high:reden]` geïmplementeerd en getest |
| Implementatie gelaagde detectie | Commits `5aef9ce`, `6efeb85` — Laag 0 keywords + Laag 1 qwen2.5:3b als BackgroundTask |
| Iteraties: modelswitch, prompt fix, timeout | [evidence_08_escalatie_implementatie.md](../evidence/evidence_08_escalatie_implementatie.md) — 5 iteraties gedocumenteerd |
| Architectuurdiagrammen (C3/C4) | [evidence_07_c3_c4_chat_pipeline.md](../evidence/evidence_07_c3_c4_chat_pipeline.md) — componentdiagram + sequentiediagram |
| Refactor `chat.py` → `chat/` package | [Stap 42 in STAPPEN.md](../STAPPEN.md) — 794 regels opgesplitst in 4 modules |

---

### 10. Wat dit oplevert

**Geïmplementeerd en werkend** — commits `5aef9ce` en `6efeb85`.

De gelaagde detectie draait in de `feature/patient-summary` branch. Alle succescriteria zijn gehaald. De codebase is gelijktijdig gerefactord: `backend/routers/chat.py` (794 regels — het bestand was te groot geworden om goed te onderhouden) is opgesplitst in een Python-package `chat/` met vier afzonderlijke modules (`_routes.py`, `_escalation.py`, `_prompts.py`, `_summary.py`).

Dit besluit raakt direct aan de portfolio-deliverable *"correct herkennen wanneer patronen risico vormen"* — één van de drie kernvereisten voor de gesimuleerde patiënten.
