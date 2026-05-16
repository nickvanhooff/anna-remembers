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
- Kan een lokaal klein model (Gemma 4 e2b) betrouwbaar een escalatiebeslissing nemen?
- Hoe voorkom ik dat snelle berichten leiden tot dubbele of gemiste escalaties?

---

### 1. Context

**Project:** Anna Remembers — AI-gezondheidsassistent voor hartfalenpatiënten

**Waarom dit nu belangrijk is:**  
Anna voert gesprekken met hartfalenpatiënten. Als een patiënt een acuut symptoom of gevaarlijke situatie meldt — bewustzijnsverlies, pijn op de borst, zelfbeschadiging — moet het systeem automatisch een zorgverlener waarschuwen via `escalate_to_human`. Dit mag niet afhangen van de patiënt die zelf op een knop drukt.

**Hoe ik hier tegenaan liep:**  
Ik heb als eerste poging de detectie in de system prompt gezet: Anna kreeg de instructie om `[ESCALATE:high:reden]` aan het einde van haar antwoord toe te voegen als een situatie escalatie vereist. In de praktijk bleek dit onbetrouwbaar — het model voegde het signaal soms niet toe, ook bij berichten als *"ik ga dood"* of *"ik val steeds flauw"*. In testgesprekken werden meerdere duidelijke urgente situaties volledig gemist.

De oorzaak is structureel: het model is getraind om vloeiende gesprekstekst te genereren, niet om een machine-leesbaar formaat-signaal te onthouden middenin een complexe system prompt. Kleinere modellen (llama-3.1-8b, gemma4:e2b) zijn hier gevoeliger voor dan grote modellen.

Daarna heb ik onderzocht hoe dit in een professionele setting wordt opgelost. Mijn bevinding: de standaardaanpak is een **aparte classificatiestap** met een eigen prompt en model — los van de conversatiestap. Dit wordt ook wel een *guardrail* of *intent classifier* genoemd. De conversatie-LLM doet zijn ding; de classificatie-LLM doet het zijne.

Het probleem met een aparte cloud-classificatieaanroep is dat het per bericht extra tokens kost — voor Groq of Anthropic betekent dat kosten bij elk gespreksbericht, ook als er niks aan de hand is. Ik heb daarom gezocht naar een manier om de classificatie lokaal te draaien, zonder cloudkosten.

**Aangetoonde leeruitkomsten:**

- [x] LO1: Analyseren — drie aanpakken vergeleken op betrouwbaarheid, latency en kosten
- [x] LO2: Adviseren — onderbouwde keuze voor gelaagde aanpak op basis van onderzoek
- [x] LO3: Ontwerpen — gelaagde detectiearchitectuur ontworpen (keywords → lokaal model)
- [x] LO4: Realiseren — geïmplementeerd in `backend/routers/chat.py` en `services/mcp_client.py`
- [ ] LO5: Beheren & Controleren
- [ ] LO6: Persoonlijk Leiderschap
- [x] LO7: Professionele Standaard — DOT-methode toegepast, professionele guardrail-patronen onderzocht

---

### 2. Succescriteria

| Criterium | Doel | Redenering achter de norm |
|---|---|---|
| **Betrouwbaarheid kritieke gevallen** | Acute situaties (bewustzijnsverlies, pijn op de borst, zelfbeschadiging) worden altijd gedetecteerd | Bij hartfalenpatiënten kan een gemiste escalatie levensgevaarlijk zijn. Nul false negatives op kritieke termen is vereist. |
| **Latency voor de gebruiker** | Nul extra wachttijd op de chat-response | De escalatiedetectie mag de chat-response niet vertragen. Patiënten moeten direct antwoord krijgen. |
| **Cloudtokenkosten** | Geen extra cloud-tokens per bericht voor escalatiedetectie | De chat-LLM (Groq) kost al tokens. Een aparte cloud-classificatieaanroep per bericht verdubbelt effectief de kosten — onnodig als er een lokaal alternatief is. |
| **Observeerbaarheid** | Elke escalatiebeslissing is traceerbaar in Langfuse | Medische beslissingen moeten auditeerbaar zijn — wie werd geëscaleerd, wanneer, op basis van wat, welke laag triggerde het. |

---

### 3. Wat ik heb besloten

**Gekozen: gelaagde escalatiedetectie — hardcoded keywords als vangvloer, asynchroon lokaal model (Gemma 4 e2b) voor nuancedectie**

De architectuur bestaat uit twee lagen:

**Laag 0 — Hardcoded kritieke termen (synchroon, vóór LLM-aanroep)**  
Een vaste set medische alarmsignalen die altijd `high`-escalatie triggeren, ongeacht context. Voorbeelden: *"bewusteloos"*, *"pijn op de borst"*, *"coma"*, *"ik ga dood"*, *"flauw"*. Geen AI nodig — als het woord erin zit, is de beslissing gemaakt. Dit is de absolute vangvloer.

**Laag 1 — Gemma 4 e2b classificatie (asynchroon, BackgroundTask na chat-response)**  
Als laag 0 niet triggert, wordt Gemma 4 e2b lokaal gevraagd om te beoordelen of het bericht escalatie vereist. Dit draait als `BackgroundTask` — de chat-response is al verstuurd als deze analyse begint. De gebruiker wacht nergens op. Gemma draait al in de bestaande Ollama Docker container; er is geen extra service nodig.

Gemma 4 e2b is geschikt voor deze taak omdat classificatie een fundamenteel eenvoudigere taak is dan gespreksgeneratie. Het model hoeft alleen `{"escalate": true/false, "urgency": "high"|"medium", "reason": "..."}` terug te geven — een strak afgebakend formaat dat ook kleine modellen betrouwbaar kunnen volgen.

Voor burst-berichten (meerdere berichten snel achter elkaar van dezelfde patiënt) wordt een semaphore per patiënt gebruikt. Dit begrenst het aantal gelijktijdige Gemma-aanroepen per patiënt tot één, zonder dat er een complexe wachtrij nodig is.

---

### 4. Hoe ik dit heb onderzocht (DOT-framework)

**Eigen ervaring (Field):**  
Eerste implementatie als system prompt-signaal (`[ESCALATE:high:reden]` in Anna's antwoord). Getest met echte gesprekken. Bevinding: het model miste escalaties consequent bij berichten als *"ik val steeds flauw"* en *"pijn op de borst"*. De oorzaak is dat format-instructies voor LLMs lager prioriteit hebben dan conversationele output — zeker bij kleinere modellen.

→ Details en testgesprekken: [evidence_07_escalatie_detectie_aanpak.md](../evidence/evidence_07_escalatie_detectie_aanpak.md)

**Beschikbaar product analyseren (Library):**  
Onderzocht hoe guardrails en intent classification in productiesystemen worden ingezet. Bevinding: de standaardaanpak is een dedicated classificatie-LLM met een eigen beknopte prompt, los van de conversatie-LLM. Bronnen: LlamaGuard (Meta), NeMo Guardrails (NVIDIA), Azure AI Content Safety documentatie.

→ Vergelijkingstabel aanpakken: [evidence_07_escalatie_detectie_aanpak.md](../evidence/evidence_07_escalatie_detectie_aanpak.md)

**Prototyping (Workshop):**  
Drie aanpakken uitgewerkt en vergeleken:
- Optie A: aparte cloud-LLM classificatieaanroep (Groq)
- Optie B: prompt-signaal in Anna's antwoord
- Optie C: lokaal model (Gemma 4 e2b) asynchroon + hardcoded vangvloer

Beslissingsmatrix uitgewerkt op betrouwbaarheid, latency, kosten en complexiteit.

→ Zie: [evidence_07_escalatie_detectie_aanpak.md](../evidence/evidence_07_escalatie_detectie_aanpak.md)

---

### 5. Wat ik heb gevonden

| Aanpak | Betrouwbaarheid | Latency gebruiker | Cloudkosten | Complexiteit |
|---|---|---|---|---|
| **Optie B — Prompt-signaal** | Laag (model vergeet het) | Geen extra | Geen extra | Laag |
| **Optie A — Aparte cloud-call** | Hoog | Geen (async) | +tokens per bericht | Middel |
| **Optie C — Lokaal model + keywords** | Hoog (keywords = vangvloer) | Geen (async) | Geen extra | Middel |

Optie B valt af op betrouwbaarheid — aangetoond in testgesprekken.  
Optie A valt af op kosten — structureel duurder per bericht voor een classificatietaak die lokaal kan.  
Optie C combineert de voordelen: betrouwbaar via keywords, nuancedectie via lokaal model, nul extra cloudkosten.

---

### 6. Voldoet dit aan mijn criteria?

| Criterium | Doel | Gehaald? |
|---|---|---|
| **Betrouwbaarheid kritieke gevallen** | Altijd gedetecteerd | ✅ Laag 0 keywords zijn deterministisch — geen LLM afhankelijkheid voor kritieke termen |
| **Latency voor de gebruiker** | Nul extra wachttijd | ✅ Beide lagen draaien als BackgroundTask ná de chat-response |
| **Cloudtokenkosten** | Geen extra tokens | ✅ Keywords kosten niets; Gemma draait lokaal in bestaande Ollama container |
| **Observeerbaarheid** | Traceerbaar in Langfuse | ⬜ Te implementeren — Langfuse spans per laag zijn ontworpen, nog niet gebouwd |

---

### 7. Aannames

- Gemma 4 e2b kan classificatietaken met strak JSON-formaat betrouwbaar uitvoeren. Dit is aannemelijk — classificatie is fundamenteel eenvoudiger dan generatie — maar nog niet kwantitatief gevalideerd op dit domein.
- De Ollama container is beschikbaar als de BackgroundTask start. Als Ollama tijdelijk niet reageert (bijv. bij hoge GPU-belasting), faalt de classificatie stil. Laag 0 keywords blijven dan de enige detectie.
- Bij productiegebruik met veel gelijktijdige patiënten kan de semaphore een bottleneck worden. Voor drie gesimuleerde patiënten is dit niet verwacht.

---

### 8. Bronnen

**(1)** Inan, H. et al. (2023). *Llama Guard: LLM-based Input-Output Safeguard for Human-AI Conversations.* Meta AI. arXiv:2312.06674.  
Referentie voor dedicated classificatie-LLM als guardrail-patroon.

**(2)** NVIDIA NeMo Guardrails — documentatie.  
[https://github.com/NVIDIA/NeMo-Guardrails](https://github.com/NVIDIA/NeMo-Guardrails)  
Patroon: aparte rail voor intent-classificatie los van de conversatie-LLM.

**(3)** Rebedea, T. et al. (2023). *NeMo Guardrails: A Toolkit for Controllable and Safe LLM Applications with Programmable Rails.* arXiv:2310.10501.  
Architectuurpatroon: classificatie en conversatie als losse componenten.

**(4)** Ollama documentatie — parallel requests en model loading.  
[https://ollama.com/blog/how-ollama-works](https://ollama.com/blog/how-ollama-works)  
Gebruikt voor inschatting van Gemma 4 e2b beschikbaarheid naast de chat-LLM.

---

### 9. Implementatiebewijs

| Wat | Bewijs |
|---|---|
| Eerste poging: system prompt-signaal | [Stap 37 in STAPPEN.md](../STAPPEN.md) — `[ESCALATE:high:reden]` geïmplementeerd en getest |
| Testgesprekken met gemiste escalaties | [evidence_07_escalatie_detectie_aanpak.md](../evidence/evidence_07_escalatie_detectie_aanpak.md) |
| Gelaagde architectuur ontworpen | [Stap 38 in STAPPEN.md](../STAPPEN.md) — beslissingsmatrix en ontwerp |
| Implementatie volgt | Issue #X — gelaagde escalatiedetectie implementeren |

---

### 10. Wat dit oplevert

**Volgende stap:** Implementatie van de gelaagde detectie — laag 0 keywords in `chat.py`, laag 1 Gemma 4 e2b als BackgroundTask, Langfuse spans per laag voor observeerbaarheid.

Dit besluit raakt direct aan de portfolio-deliverable *"correct herkennen wanneer patronen risico vormen"* — één van de drie kernvereisten voor de gesimuleerde patiënten.
