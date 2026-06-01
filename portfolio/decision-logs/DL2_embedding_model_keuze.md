# Decision Log — Anna Remembers

**Naam:** Nick van Hooff  
**Klas:** MA-AAI1  
**Rol:** GenAI Engineer

---

## Entry #2: Welk embedding model gebruik ik voor de RAG-pipeline in de MCP-server?

### Onderzoeksvraag

> Welk embedding model zet ik in voor de vector search in ChromaDB, zodat Anna herinneringen van patiënten semantisch kan ophalen — ook als de patiënt in het Nederlands communiceert?

---

### 1. Context

**Project:** Anna Remembers — AI-gezondheidsassistent voor hartfalenpatiënten

**Waarom dit nu belangrijk is:**  
De MCP-server (Model Context Protocol-server — het aparte proces dat geheugen, trends en escalaties beheert op poort 8001) implementeert `store_memory` en `recall_context`. Beide tools draaien op semantische vector search in ChromaDB: inkomende patiënttekst wordt omgezet naar een embedding (numerieke vector die de betekenis van tekst vastlegt, zodat semantisch vergelijkbare teksten dicht bij elkaar liggen in de vector-ruimte) en opgeslagen; bij een volgende sessie zoekt het systeem naar semantisch vergelijkbare herinneringen. De keuze van het embedding model bepaalt de kwaliteit van die match — en dus of Anna eerder gemelde symptomen correct oppikt of niet.

De keuze moest vóór de implementatie van issue #3 vastliggen, omdat ChromaDB één vaste vectordimensie per collectie heeft. Later wisselen betekent de collectie leegmaken.

**Aangetoonde leeruitkomsten:**

- [x] LO1: Analyseren — drie kandidaten vergeleken op kwantificeerbare criteria
- [ ] LO2: Adviseren
- [x] LO3: Ontwerpen — provider-agnostisch embedding patroon ontworpen (EmbeddingProvider ABC — Abstract Base Class, een blauwdruk-klasse waarvan concrete implementaties erven)
- [x] LO4: Realiseren — model geïmplementeerd in MCP-server, 7 tests groen
- [ ] LO5: Beheren & Controleren
- [ ] LO6: Professioneel Leiderschap
- [x] LO7: Professionele Standaard — DOT-methode expliciet benoemd, keuze onderbouwd met MTEB-benchmarkdata

---

### 2. Succescriteria

| Criterium | Doel | Redenering achter de norm |
|---|---|---|
| **Meertalige kwaliteit** | Hoogst gerankt beschikbaar model op BEIR-NL [1] dat volledig lokaal draait | Patiënten schrijven in het Nederlands. MTEB BEIR-NL (Massive Text Embedding Benchmark — de standaard voor het vergelijken van embedding modellen op retrievalkwaliteit; BEIR-NL is de Nederlandstalige sectie) meet hoe goed een model relevante documenten terugvindt in het Nederlands. De modellen die hoger staan zijn óf niet beschikbaar in Ollama, óf vereisen een externe API-sleutel, óf hebben een te korte contextlengte. bge-m3 staat op positie #6, maar is de beste optie binnen de overige constraints. |
| **VRAM-gebruik** | ≤ 2 GB geladen | De RTX 4050 heeft 6 GB VRAM (Video RAM — geheugen op de grafische kaart, gebruikt voor het draaien van AI-modellen) [2]. Het chat-LLM gemma4:e4b vraagt ~4 GB bij aanroepen. Als het embedding model meer dan 2 GB vraagt, moeten ze tegelijk in VRAM — dat past niet. De grens van 2 GB laat voldoende marge voor model-swapping. |
| **Contextlengte** | ≥ 512 tokens | Een sessiesamenvatting van ~250 woorden is ~350 tokens. Bij 512 tokens past één volledige samenvatting in één embed-aanroep zonder afknippen. |
| **Beschikbaar via Ollama** | `ollama pull <model>` werkt, geen extra tooling | De Ollama-container draait al in docker-compose. Een model dat niet via Ollama beschikbaar is, vereist een nieuwe Docker-service en extra beheer. |

---

### 3. Wat ik heb besloten

**Gekozen: `bge-m3` via Ollama**

bge-m3 is het enige van de drie kandidaten dat aan alle vier de criteria voldoet. De twee alternatieven vielen af op fundamentele punten:

- **nomic-embed-text** staat niet in de top-10 van BEIR-NL [1]. Het is primair op Engels getraind, wat voor patiënttermen als "kortademig" of "enkelvoetoedeem" aantoonbaar minder relevante RAG-resultaten geeft.
- **mxbai-embed-large** heeft een contextlimiet van 512 tokens — dit haalt de grens maar geeft geen marge. Langere herinneringen (sessiesamenvatting + symptoomnotitie in één blok) worden afgeknipt. Afknippen betekent dat de vector alleen de eerste helft van de tekst vertegenwoordigt, waardoor semantisch vergelijkbare herinneringen niet meer als vergelijkbaar worden herkend.

bge-m3 draait in de bestaande Ollama-container via **model-swapping** [2]: Ollama houdt nooit meer dan één model tegelijk in VRAM geladen. Als er een aanroep binnenkomt voor een ander model, wordt het huidige model uit VRAM verwijderd en het gevraagde model ingeladen. Dat betekent: tijdens een chatgesprek staat gemma4:e4b in VRAM; bij een embed-aanroep (store_memory/recall_context) wisselt Ollama naar bge-m3. Ze hoeven niet tegelijk in VRAM. Op projectschaal (~300 geheugenblokken voor 3 gesimuleerde patiënten — 3 patiënten × 10 sessies × ~10 herinneringen per sessie) zijn die wissels seconden — verwaarloosbaar ten opzichte van de LLM-aanroep die 1–3 seconden duurt.

Het provider-agnostische patroon (`EmbeddingProvider` ABC) zorgt dat wisselen van model later alleen `embedding.py` raakt — de rest van de MCP-server hoeft niet te veranderen. Een overstap naar een cloud provider (bijv. OpenAI text-embedding-3-small) is één nieuwe subklasse en één env var. **Kanttekening:** vectoren van verschillende providers zijn niet onderling vergelijkbaar. Bij een providerwissel moeten alle bestaande vectoren in ChromaDB opnieuw gegenereerd worden met het nieuwe model. Voor gesimuleerde patiënten is dat geen probleem — de sessies worden toch opnieuw gedraaid.

---

### 4. Hoe ik dit heb onderzocht (DOT-framework)

**Beschikbaar product analyseren (Library):**  
MTEB Multilingual BEIR leaderboard [1] geraadpleegd voor de drie kandidaten. MTEB is de standaard om embedding modellen te vergelijken op retrievalkwaliteit; de Multilingual BEIR-sectie filtert specifiek op niet-Engelse talen. bge-m3 staat consistent in de top-10, nomic-embed-text niet [1]. Specifiek gekeken naar Nederlandse retrieval-scores.

**Beschikbaar product analyseren (Library):**  
Ollama model library [2] geraadpleegd voor VRAM-gebruik per model. bge-m3: ~1.5 GB, mxbai-embed-large: ~670 MB, nomic-embed-text: ~270 MB. In combinatie met gemma4:e4b (~4 GB) passen alle drie via model-swapping: Ollama wisselt modellen automatisch als een aanroep een ander model vraagt dan wat er geladen is [2].

Details van het vergelijkingsonderzoek: → [evidence_02_embedding_model_vergelijking.md](../evidence/evidence_02_embedding_model_vergelijking.md)

---

### 5. Wat ik heb gevonden

| Model | BEIR-NL positie | VRAM | Context | Ollama | Voldoet |
|---|---|---|---|---|---|
| **bge-m3** | #6 ✅ | ~1.5 GB ✅ | 8192 tokens ✅ | ✅ | ✅ alle criteria |
| mxbai-embed-large | Niet in top-10 ⚠️ | ~670 MB ✅ | 512 tokens ❌ | ✅ | ❌ context te kort |
| nomic-embed-text | Niet in top-10 ❌ | ~270 MB ✅ | 2048 tokens ✅ | ✅ | ❌ niet meertalig |

De vijf modellen die op BEIR-NL bóven bge-m3 staan (positie #1–#5) zijn ook onderzocht. Ze vallen elk af op een harde constraint: niet beschikbaar via Ollama, vereiste API-sleutel, afwijkende vectordimensies, of te korte context. Volledige exclusietabel: → [evidence_02 — BEIR-NL top-10 exclusies + VRAM-berekening](../evidence/evidence_02_embedding_model_vergelijking.md)

---

### 6. Voldoet dit aan mijn criteria?

| Criterium | Doel | Gehaald? | Bewijs |
|---|---|---|---|
| **Meertalige kwaliteit** | Hoogst gerankt lokaal model op BEIR-NL [1] | ✅ positie #6; #1–#5 vallen af op harde constraints | [evidence_02 — exclusietabel #1–#5](../evidence/evidence_02_embedding_model_vergelijking.md) |
| **VRAM-gebruik** | ≤ 2 GB | ✅ ~1.5 GB geladen [2] | [evidence_02 — VRAM-berekening + model-swapping](../evidence/evidence_02_embedding_model_vergelijking.md) |
| **Contextlengte** | ≥ 512 tokens | ✅ 8192 tokens — 16× de minimumvereiste [3] | [evidence_02 — vergelijkingstabel](../evidence/evidence_02_embedding_model_vergelijking.md) |
| **Beschikbaar via Ollama** | `ollama pull` werkt | ✅ `ollama pull bge-m3` | [Commit `3b5c047`](https://github.com/nickvanhooff/anna-remembers/commit/3b5c047) — ollama-init in docker-compose |

---

### 7. Aannames

- Ollama model-swapping [2] werkt snel genoeg op projectschaal. Bij hogere load (simultane embed- en chat-aanroepen) kan wisselen een bottleneck worden. Voor 3 gesimuleerde patiënten is dit niet verwacht — er is nooit meer dan één actieve chat tegelijk.
- MTEB-scores [1] zijn gemeten op benchmark-datasets, niet op zorgdomein-Nederlands. De werkelijke kwaliteit op patiënttermen kan iets afwijken — maar bge-m3 is het beste beschikbare alternatief binnen het VRAM-budget.

---

### 8. Bronnen

**(1)** MTEB Leaderboard — Massive Text Embedding Benchmark. Hugging Face.  
[https://huggingface.co/spaces/mteb/leaderboard](https://huggingface.co/spaces/mteb/leaderboard)  
Gebruikt voor vergelijking van meertalige retrieval-scores (BEIR-NL sectie).

**(2)** Ollama Model Library.  
[https://ollama.com/library](https://ollama.com/library)  
Gebruikt voor VRAM-gebruik en contextlengte per model.

**(3)** Xiao, S. et al. (2024). *M3-Embedding: Multi-Linguality, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation.* arXiv:2402.03216.  
Technische specificaties bge-m3: architectuur, trainingdata, meertaligheid, contextlengte 8192 tokens.

---

### 9. Implementatiebewijs

| Wat | Bewijs |
|---|---|
| EmbeddingProvider ABC + OllamaEmbeddingProvider | [Commit `a33ca43`](https://github.com/nickvanhooff/anna-remembers/commit/a33ca43) — `services/embedding.py` + 4 tests |
| store_memory + recall_context tools | [Commit `d6b6763`](https://github.com/nickvanhooff/anna-remembers/commit/d6b6763) — `tools/memory.py` + 3 tests |
| MCP tools geregistreerd in main.py | [Commit `63a14d7`](https://github.com/nickvanhooff/anna-remembers/commit/63a14d7) |
| ollama-init service in docker-compose | [Commit `3b5c047`](https://github.com/nickvanhooff/anna-remembers/commit/3b5c047) — `ollama pull bge-m3` bij eerste opstart |
| Vergelijkingsonderzoek kandidaten | [evidence_02_embedding_model_vergelijking.md](../evidence/evidence_02_embedding_model_vergelijking.md) |

**Stap in STAPPEN.md:** Stap 10

---

### 10. Wat dit oplevert

**Volgende LO-fase:** Realiseren — issue #3 vervolg

Nu het embedding model vastligt en `store_memory` + `recall_context` werken, kan de rest van issue #3 gebouwd worden: `get_symptom_trends` (PostgreSQL) en `escalate_to_human` (email/Slack stub). Daarna kan de backend chat-router worden gewired met echte MCP-context.
