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
De MCP-server implementeert `store_memory` en `recall_context`. Beide tools draaien op semantische vector search in ChromaDB: inkomende patiënttekst wordt omgezet naar een vector en opgeslagen; bij een volgende sessie zoekt het systeem naar semantisch vergelijkbare herinneringen. De keuze van het embedding model bepaalt de kwaliteit van die match — en dus of Anna eerder gemelde symptomen correct oppikt of niet.

De keuze moest vóór de implementatie van issue #3 vastliggen, omdat ChromaDB één vaste vectordimensie per collectie heeft. Later wisselen betekent de collectie leegmaken.

**Aangetoonde leeruitkomsten:**

- [x] LO1: Analyseren — drie kandidaten vergeleken op kwantificeerbare criteria
- [ ] LO2: Adviseren
- [x] LO3: Ontwerpen — provider-agnostisch embedding patroon ontworpen (EmbeddingProvider ABC)
- [x] LO4: Realiseren — model geïmplementeerd in MCP-server, 7 tests groen
- [ ] LO5: Beheren & Controleren
- [ ] LO6: Persoonlijk Leiderschap
- [x] LO7: Professionele Standaard — DOT-methode expliciet benoemd, keuze onderbouwd met MTEB-benchmarkdata

---

### 2. Succescriteria

| Criterium | Doel | Redenering achter de norm |
|---|---|---|
| **Meertalige kwaliteit** | In de top-5 van MTEB Multilingual BEIR ranking | Patiënten schrijven in het Nederlands. MTEB is de standaard benchmark voor retrieval; top-5 betekent bewezen betere Nederlandse semantische overeenkomsten dan de middenmoot. |
| **VRAM-gebruik** | ≤ 2 GB geladen | De RTX 4050 heeft 6 GB VRAM. gemma4:e4b vraagt ~4 GB bij chat-aanroepen. Als het embedding model meer dan 2 GB vraagt, moeten ze tegelijk in VRAM — dat past niet. |
| **Contextlengte** | ≥ 512 tokens | Een sessiesamenvatting van ~250 woorden is ~350 tokens. Bij 512 past één volledige samenvatting in één embed-aanroep. |
| **Beschikbaar via Ollama** | `ollama pull <model>` werkt, geen extra tooling | De Ollama-container draait al. Een model dat niet via Ollama beschikbaar is, vereist een nieuwe Docker-service en extra beheer. |

---

### 3. Wat ik heb besloten

**Gekozen: `bge-m3` via Ollama**

bge-m3 is het enige van de drie kandidaten dat aan alle vier de criteria voldoet. De twee alternatieven vielen af op fundamentele punten:

- **nomic-embed-text** is primair op Engels getraind. Op de MTEB Multilingual BEIR benchmark scoort het significant lager dan bge-m3 op niet-Engelse talen. Voor patiënttermen als "kortademig" of "enkelvoetoedeem" is die kwaliteitsverschil direct zichtbaar in minder relevante RAG-resultaten.
- **mxbai-embed-large** heeft een contextlimiet van 512 tokens — dit haalt de grens maar geeft geen marge. Langere herinneringen (sessiesamenvatting + symptoomnotitie in één blok) worden afgeknipt. Daarnaast is het minder uitgebreid getest op meertalige retrieval dan bge-m3.

bge-m3 draait in de bestaande Ollama-container via model-swapping: Ollama laadt gemma4:e4b bij chat-aanroepen en bge-m3 bij embed-aanroepen. Ze hoeven niet tegelijk in VRAM. Op projectschaal (~300 geheugenblokken totaal voor 3 gesimuleerde patiënten) is het wisselen geen merkbare bottleneck.

Het provider-agnostische patroon (`EmbeddingProvider` ABC) zorgt dat wisselen van model later alleen `embedding.py` raakt — de rest van de MCP-server hoeft niet te veranderen.

---

### 4. Hoe ik dit heb onderzocht (DOT-framework)

**Beschikbaar product analyseren (Library):**  
MTEB Multilingual BEIR leaderboard geraadpleegd voor de drie kandidaten. bge-m3 staat consistent in de top-5, nomic-embed-text niet. Specifiek gekeken naar Nederlandse retrieval-scores.

**Beschikbaar product analyseren (Library):**  
Ollama model library geraadpleegd voor VRAM-gebruik per model. bge-m3: ~1.5 GB, mxbai-embed-large: ~670 MB, nomic-embed-text: ~270 MB. In combinatie met gemma4:e4b (~4 GB) passen alle drie theoretisch via model-swapping.

Details van het vergelijkingsonderzoek: → [evidence_02_embedding_model_vergelijking.md](../evidence/evidence_02_embedding_model_vergelijking.md)

---

### 5. Wat ik heb gevonden

| Model | MTEB Multilingual BEIR | VRAM | Context | Ollama |
|---|---|---|---|---|
| bge-m3 | Top-5, o.a. Nederlands ✅ | ~1.5 GB ✅ | 8192 tokens ✅ | ✅ |
| mxbai-embed-large | Niet top-5 voor NL ⚠️ | ~670 MB ✅ | 512 tokens ❌ | ✅ |
| nomic-embed-text | Primair Engels ❌ | ~270 MB ✅ | 2048 tokens ✅ | ✅ |

bge-m3 is de enige die op alle criteria groen scoort.

---

### 6. Voldoet dit aan mijn criteria?

| Criterium | Doel | Gehaald? |
|---|---|---|
| **Meertalige kwaliteit** | Top-5 MTEB Multilingual BEIR | ✅ bge-m3 staat in de top-5 |
| **VRAM-gebruik** | ≤ 2 GB | ✅ ~1.5 GB geladen |
| **Contextlengte** | ≥ 512 tokens | ✅ 8192 tokens |
| **Beschikbaar via Ollama** | `ollama pull` werkt | ✅ `ollama pull bge-m3` |

---

### 7. Aannames

- Ollama model-swapping werkt snel genoeg op projectschaal. Bij hogere load (simultane embed- en chat-aanroepen) kan wisselen een bottleneck worden. Voor 3 gesimuleerde patiënten is dit niet verwacht.
- MTEB-scores zijn gemeten op benchmark-datasets, niet op zorgdomein-Nederlands. De werkelijke kwaliteit op patiënttermen kan iets afwijken — maar bge-m3 is het beste beschikbare alternatief binnen het VRAM-budget.

---

### 8. Bronnen

**(1)** MTEB Leaderboard — Massive Text Embedding Benchmark. Hugging Face.  
[https://huggingface.co/spaces/mteb/leaderboard](https://huggingface.co/spaces/mteb/leaderboard)  
Gebruikt voor vergelijking van meertalige retrieval-scores.

**(2)** Ollama Model Library.  
[https://ollama.com/library](https://ollama.com/library)  
Gebruikt voor VRAM-gebruik en contextlengte per model.

**(3)** Xiao, S. et al. (2024). *M3-Embedding: Multi-Linguality, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation.* arXiv:2402.03216.  
Technische specificaties bge-m3: architectuur, trainingdata, meertaligheid.

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
