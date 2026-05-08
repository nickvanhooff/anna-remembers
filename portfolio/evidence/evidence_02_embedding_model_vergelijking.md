# Evidence 02 — Embedding model vergelijking

**Type:** Vergelijkingstabel + DOT-onderzoeksverantwoording  
**Datum:** 2026-05-08  
**Hoort bij:** Decision log DL2 — Embedding model keuze, Stap 10 in STAPPEN.md  
**Commit:** `b30feef` (design spec), `a33ca43` (implementatie)

---

## DOT-methode verantwoording

### Wat ik onderzocht heb

Ik moest een embedding model kiezen voor de RAG-pipeline in de MCP-server. Het model bepaalt hoe goed Anna semantisch vergelijkbare herinneringen terugvindt bij een patiëntvraag — en daarmee of ze correcte context teruggeeft of hallucinaties produceert.

De twee bronnen die ik heb geraadpleegd:

**1. MTEB Multilingual BEIR Leaderboard (Hugging Face)**  
De Massive Text Embedding Benchmark is de standaard voor het vergelijken van embedding modellen op retrieval. De Multilingual BEIR-sectie bevat scores voor niet-Engelse talen inclusief Nederlands. Ik heb de leaderboard gefilterd op modellen die beschikbaar zijn via Ollama.

**2. Ollama Model Library**  
Per model: modelgrootte (VRAM-gebruik), contextlengte, beschikbaarheid via `ollama pull`.

**3. bge-m3 paper (arXiv:2402.03216)**  
Technisch document van de BAAI-onderzoekers over het trainingsproces van bge-m3. Bevestigt: getraind op 100+ talen, inclusief Dutch Common Crawl en Wikipedia. Verklaart waarom de meertalige scores hoger zijn dan bij nomic-embed-text.

---

## Vergelijkingstabel

| Criterium | bge-m3 | mxbai-embed-large | nomic-embed-text |
|---|---|---|---|
| **MTEB Multilingual BEIR** | Top-5 (incl. NL) | Niet in top-5 voor NL | Primair Engels, laag voor NL |
| **VRAM geladen** | ~1.5 GB | ~670 MB | ~270 MB |
| **Contextlengte** | 8192 tokens | 512 tokens | 2048 tokens |
| **Vectordimensies** | 1024 | 1024 | 768 |
| **Beschikbaar via Ollama** | ✅ | ✅ | ✅ |
| **Voldoet aan alle criteria** | ✅ | ❌ (context te kort) | ❌ (niet meertalig) |

---

## Redenering per afgevallen kandidaat

**nomic-embed-text:**  
Het model is getraind op een corpus dat primair uit Engelstalige data bestaat. Op de MTEB Multilingual BEIR leaderboard scoort het voor Nederlandse retrieval-taken significant lager dan bge-m3. Patiëntten als "kortademig", "enkelvoetoedeem" en "medicatietrouw" zijn zorgdomein-specifieke Nederlandse termen — een model dat Nederlands slecht begrijpt geeft hiervoor minder relevante semantische matches terug. Dat verhoogt het risico dat Anna relevante herinneringen mist.

**mxbai-embed-large:**  
512-token contextlimiet. Een sessiesamenvatting van ~250 woorden is ~350 tokens. Dat haalt de grens, maar een samenvatting plus een symptoomnotitie in één geheugenblok gaat al over de limiet. Tekst die de limiet overschrijdt wordt stilletjes afgeknipt — dan embedden twee vergelijkbare herinneringen met verschillende vectoren omdat de ene afgeknipt is en de andere niet. Dat ondermijnt de retrieval-kwaliteit juist bij langere, informatierijke geheugens.

---

## VRAM-berekening

| Component | VRAM bij gebruik |
|---|---|
| gemma4:e4b (chat) | ~4.0 GB |
| bge-m3 (embed) | ~1.5 GB |
| Tegelijk geladen | ~5.5 GB — past niet in RTX 4050 (6 GB) |
| Via model-swapping | Ollama wisselt op aanvraag, nooit tegelijk |

Ollama laadt het gevraagde model en ontlaadt het vorige als het VRAM vol raakt. Op projectschaal (geen simultane chat- en embed-aanroepen) is dit geen merkbaar probleem.

---

## Bronnen

**(1)** MTEB Leaderboard — Massive Text Embedding Benchmark. Hugging Face.  
[https://huggingface.co/spaces/mteb/leaderboard](https://huggingface.co/spaces/mteb/leaderboard)

**(2)** Ollama Model Library.  
[https://ollama.com/library](https://ollama.com/library)

**(3)** Xiao, S. et al. (2024). *M3-Embedding: Multi-Linguality, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation.* arXiv:2402.03216.  
[https://arxiv.org/abs/2402.03216](https://arxiv.org/abs/2402.03216)
