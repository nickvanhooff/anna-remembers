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
De MCP-server implementeert `store_memory` en `recall_context`. Beide tools zetten patiënttekst om naar een embedding (een numerieke vector die de betekenis van tekst vastlegt — semantisch vergelijkbare teksten liggen dicht bij elkaar in de vectorruimte) en slaan die op in ChromaDB. Bij een volgende sessie zoekt het systeem naar herinneringen die semantisch lijken op wat de patiënt nu zegt. Hoe goed dat werkt hangt volledig af van het embedding model.

De keuze moest vóór issue #3 vastliggen: ChromaDB heeft één vaste vectordimensie per collectie. Later wisselen van model betekent de hele collectie leegmaken en opnieuw opbouwen.

**Aangetoonde leeruitkomsten:**

- [x] LO1: Analyseren — drie kandidaten vergeleken op kwantificeerbare criteria
- [ ] LO2: Adviseren
- [x] LO3: Ontwerpen — provider-agnostisch embedding patroon ontworpen (EmbeddingProvider ABC — Abstract Base Class, een blauwdruk-klasse waarvan concrete implementaties erven)
- [x] LO4: Realiseren — model geïmplementeerd in MCP-server, 7 tests groen
- [ ] LO5: Beheren & Controleren
- [ ] LO6: Professioneel Leiderschap
- [x] LO7: Professionele Standaard — DOT-methode toegepast, keuze onderbouwd met MTEB-benchmarkdata

---

### 2. Succescriteria

| Criterium | Doel | Waarom deze norm |
|---|---|---|
| **Meertalige kwaliteit** | Hoogst gerankt lokaal model op BEIR-NL [1] | Patiënten schrijven in het Nederlands. Een model dat primair op Engels is getraind geeft slechtere semantische matches op termen als "kortademig" of "enkelvoetoedeem" |
| **VRAM-gebruik** | ≤ 2 GB | De RTX 4050 heeft 6 GB VRAM (Video RAM — geheugen op de grafische kaart). Het chat-LLM gebruikt ~4 GB. Meer dan 2 GB voor embeddings past niet naast elkaar in VRAM |
| **Contextlengte** | ≥ 512 tokens | Een sessiesamenvatting van ~250 woorden is ~350 tokens. Onder de 512 tokens worden langere herinneringen afgeknipt, wat de retrieval-kwaliteit verslechtert |
| **Beschikbaar via Ollama** | `ollama pull <model>` werkt | De Ollama-container draait al. Een model buiten Ollama betekent een extra Docker-service |

---

### 3. Wat ik heb besloten

**Gekozen: `bge-m3` via Ollama**

bge-m3 is de enige kandidaat die aan alle vier criteria voldoet:

- **nomic-embed-text** staat niet in de top-10 van BEIR-NL [1] en is primair op Engels getraind — voor Nederlandstalige medische termen geeft dat  minder relevante RAG-resultaten (vermoeden).
- **mxbai-embed-large** heeft een contextlimiet van 512 tokens. Dat haalt net de grens, maar een sessiesamenvatting plus een symptoomnotitie in één geheugenblok gaat al over de limiet. Tekst die wordt afgeknipt embedt anders dan de volledige versie — dan herkent het systeem twee vergelijkbare herinneringen niet meer als vergelijkbaar.

bge-m3 draait in de bestaande Ollama-container via **model-swapping** [2]: Ollama houdt nooit meer dan één model tegelijk in VRAM (Video RAM — geheugen op de grafische kaart). Bij een embed-aanroep wisselt het automatisch van het chat-LLM naar bge-m3. Op projectschaal (~300 geheugenblokken voor 3 patiënten) duurt dat wisselen een paar seconden — dat valt weg in de LLM-aanroeptijd van 1–3 seconden.

Het provider-agnostische patroon (`EmbeddingProvider` ABC) zorgt dat wisselen van model later alleen `embedding.py` raakt. **Kanttekening:** vectoren van verschillende modellen zijn niet uitwisselbaar. Bij een modelwissel moeten alle bestaande vectoren opnieuw gegenereerd worden — voor gesimuleerde patiënten geen probleem, die sessies worden toch opnieuw gedraaid.

---

### 4. Hoe ik dit heb onderzocht (DOT-framework)

**Beschikbaar product analyseren (Library):**  
MTEB BEIR-NL leaderboard [1] geraadpleegd. MTEB (Massive Text Embedding Benchmark — de standaard voor het vergelijken van embedding modellen op retrievalkwaliteit) heeft een aparte Nederlandstalige sectie. bge-m3 staat op positie #6; nomic-embed-text staat er niet in.

**Beschikbaar product analyseren (Library):**  
Ollama model library [2] geraadpleegd voor VRAM-gebruik per model. In combinatie met het chat-LLM passen alle drie kandidaten via model-swapping.

Details: → [evidence_02_embedding_model_vergelijking.md](../evidence/evidence_02_embedding_model_vergelijking.md)

---

### 5. Wat ik heb gevonden

| Model | BEIR-NL positie | VRAM | Context | Ollama | Voldoet |
|---|---|---|---|---|---|
| **bge-m3** | #6 ✅ | ~1.5 GB ✅ | 8192 tokens ✅ | ✅ | ✅ alle criteria |
| mxbai-embed-large | Niet in top-10 ⚠️ | ~670 MB ✅ | 512 tokens ❌ | ✅ | ❌ context te kort |
| nomic-embed-text | Niet in top-10 ❌ | ~270 MB ✅ | 2048 tokens ✅ | ✅ | ❌ niet meertalig |

De vijf modellen bóven bge-m3 (#1–#5) zijn ook onderzocht en vallen elk af op een harde constraint: niet beschikbaar via Ollama, vereiste API-sleutel, afwijkende vectordimensies of te korte context. Volledige exclusietabel: → [evidence_02](../evidence/evidence_02_embedding_model_vergelijking.md)

---

### 6. Voldoet dit aan mijn criteria?

| Criterium | Doel | Gehaald? | Bewijs |
|---|---|---|---|
| **Meertalige kwaliteit** | Hoogst gerankt lokaal model op BEIR-NL [1] | ✅ positie #6; #1–#5 vallen af op harde constraints | [evidence_02 — exclusietabel #1–#5](../evidence/evidence_02_embedding_model_vergelijking.md) |
| **VRAM-gebruik** | ≤ 2 GB | ✅ ~1.5 GB geladen [2] | [evidence_02 — VRAM-berekening](../evidence/evidence_02_embedding_model_vergelijking.md) |
| **Contextlengte** | ≥ 512 tokens | ✅ 8192 tokens — 16× de minimumvereiste [3] | [evidence_02 — vergelijkingstabel](../evidence/evidence_02_embedding_model_vergelijking.md) |
| **Beschikbaar via Ollama** | `ollama pull` werkt | ✅ `ollama pull bge-m3` | [Commit `3b5c047`](https://github.com/nickvanhooff/anna-remembers/commit/3b5c047) — ollama-init in docker-compose |

---

### 7. Aannames

- Ollama model-swapping werkt snel genoeg op projectschaal. Bij gelijktijdige embed- en chat-aanroepen kan wisselen een bottleneck worden — voor 3 gesimuleerde patiënten is dat niet verwacht.
- MTEB-scores zijn gemeten op benchmark-datasets, niet op zorgdomein-Nederlands. De werkelijke kwaliteit op patiënttermen kan iets afwijken, maar bge-m3 is het beste beschikbare alternatief binnen het VRAM-budget.

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

Nu het embedding model vastligt en `store_memory` + `recall_context` werken, kan de rest van issue #3 gebouwd worden: `get_symptom_trends` en `escalate_to_human`. Daarna kan de backend chat-router worden gekoppeld aan echte MCP-context.
