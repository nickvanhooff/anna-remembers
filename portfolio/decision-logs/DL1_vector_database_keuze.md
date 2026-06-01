# Decision Log — Anna Remembers

**Naam:** Nick van Hooff  
**Klas:** MA-AAI1  
**Rol:** GenAI Engineer

---

## Entry #1: Welke vector database gebruik ik voor het semantisch geheugen van Anna?

### Onderzoeksvraag

> Welke vector database past het beste bij Anna Remembers: ChromaDB (dedicated vector database) of pgvector (PostgreSQL extensie die vector search toevoegt aan een bestaande relationele database)?

---

### 1. Context

**Project:** Anna Remembers — AI-gezondheidsassistent voor hartfalenpatiënten

**Waarom dit nu belangrijk is:**  
Anna Remembers gebruikt RAG (Retrieval-Augmented Generation — het ophalen van semantisch vergelijkbare herinneringen als context bij elke LLM-aanroep) om symptomen en uitspraken van patiënten over meerdere sessies te onthouden. Het project draait al met PostgreSQL 16. De keuze moest vóór issue #3 vastliggen, omdat de vectordimensie (1024-dim — een vector van 1024 getallen die de betekenis van een tekst vastlegt) per ChromaDB-collectie vast is: later wisselen betekent de volledige collectie leegmaken en alle herinneringen opnieuw genereren.

**Aangetoonde leeruitkomsten:**

- [x] LO1: Analyseren — technische haalbaarheid van beide opties onderzocht op projectschaal en leerdoelen
- [ ] LO2: Adviseren
- [x] LO3: Ontwerpen — architectuur met aparte vector store naast PostgreSQL uitgewerkt
- [x] LO4: Realiseren — ChromaDB geïmplementeerd in MCP-server (issue #3)
- [ ] LO5: Beheren & Controleren
- [ ] LO6: Professioneel Leiderschap
- [x] LO7: Professionele Standaard — DOT-methode toegepast, keuze verdedigbaar op basis van leeruitkomsten

---

### 2. Succescriteria

| Criterium | Doel | Redenering achter de norm |
|---|---|---|
| **RAG-pipeline zichtbaar** | Embedding, opslag, zoeken en context-injectie zijn elk aparte stappen in de code | LO4 vraagt om aantoonbaar begrip van de pipeline — één SQL-operator die alles verbergt maakt de werking niet inzichtelijk voor een beoordelaar |
| **Verdedigbare keuze op schaal** | Keuze onderbouwd voor de werkelijke projectschaal | De keuze moet houdbaar zijn voor de daadwerkelijke omvang van het project, niet alleen voor een hypothetisch grote deployment |
| **Extra tooling acceptabel** | Maximaal één extra Docker-container boven de bestaande stack | Elke extra container verhoogt beheer-overhead. Meer dan één extra service is niet gerechtvaardigd voor een feature die ook zonder extra tooling gebouwd kan worden |

---

### 3. Wat ik heb besloten

**ChromaDB** — bewust gekozen als dedicated vector database naast PostgreSQL 16.

De RAG-pipeline wordt expliciet gebouwd in vier aparte stappen in `mcp-server/tools/memory.py`:

1. `embed(content)` → POST naar Ollama, retourneert 1024-dim vector
2. `collection.add()` → vector + metadata (patiënt-ID, bron-tag) opgeslagen in ChromaDB
3. `collection.query()` → cosine similarity search (maat voor gelijkenis tussen twee vectoren; score tussen 0 en 1, waarbij 1 identiek is) met metadata-filter op `patient_id`
4. Resultaten geïnjecteerd als context in het system-prompt

---

### 4. Hoe ik dit heb onderzocht (DOT-framework)

**Beschikbaar product analyseren (Library):**  
ChromaDB-documentatie [1] en pgvector README [2] vergeleken, aangevuld met technische artikelen over vector database keuzes bij kleine projectschalen.

**Bevinding:** pgvector voert similarity search uit via één SQL-operator (`<=>`). ChromaDB heeft aparte methoden voor opslaan (`add()`), zoeken (`query()`) en metadata-filtering. Op projectschaal zijn de prestatieverschillen bij HNSW-indexering (Hierarchical Navigable Small World — een index-algoritme dat vectorzoeken versnelt van lineair doorzoeken naar logaritmische complexiteit) verwaarloosbaar [1]. De keuze zit hem niet in performance maar in zichtbaarheid van de pipeline.

Schatting projectschaal: 3 gesimuleerde patiënten × 10 sessies × ~15 herinneringen per sessie ≈ **450 vectoren**. Voor een hypothetische productie-deployment (30 patiënten × 100 sessies × 15 herinneringen) zou dit ~**45.000 vectoren** zijn — nog steeds ruim binnen het bereik waarbij ChromaDB en pgvector identiek presteren [1].

**Lab — implementatie en observatie:**  
ChromaDB geïmplementeerd in `mcp-server/tools/memory.py`. Tijdens de bouw bleek in de praktijk dat elke RAG-stap een aparte, aanraakbare plek heeft in de code. Bij pgvector zou stap 3 opgaan in één SQL-query — de pipeline-logica verdwijnt achter een database-operator. Dat is minder verdedigbaar voor LO1 en LO4.

→ Vergelijkingsdetails: [evidence_01b_chromadb_vs_pgvector.md](../evidence/evidence_01b_chromadb_vs_pgvector.md)

---

### 5. Wat ik heb gevonden

| Optie | Pipeline-zichtbaarheid | Prestatie op projectschaal | Extra tooling | Voldoet |
|---|---|---|---|---|
| **ChromaDB (gekozen)** | ✅ Vier aparte stappen in code | ✅ Identiek aan pgvector bij HNSW [1] | +1 Docker container | ✅ |
| pgvector | ❌ Verdwijnt achter `<=>` operator | ✅ Identiek bij HNSW | Geen — al in PostgreSQL | ❌ pipeline niet zichtbaar |

Volledige vergelijking: → [evidence_01b_chromadb_vs_pgvector.md](../evidence/evidence_01b_chromadb_vs_pgvector.md)

---

### 6. Voldoet dit aan mijn criteria?

| Criterium | Doel | Gehaald? | Bewijs |
|---|---|---|---|
| **RAG-pipeline zichtbaar** | Vier aparte stappen in code | ✅ embed → add → query → inject elk apart implementeerbaar en testbaar | [Commit `d6b6763`](https://github.com/nickvanhooff/anna-remembers/commit/d6b6763763cb850c9a760c3fccc2deb1a22be9c4) — `tools/memory.py` + 99 regels tests |
| **Verdedigbare keuze op schaal** | Onderbouwd voor werkelijke projectschaal (~450 vectoren) | ✅ Prestatieverschil verwaarloosbaar op deze schaal; keuze drijft op leervoordeel | [evidence_01b](../evidence/evidence_01b_chromadb_vs_pgvector.md) |
| **Extra tooling acceptabel** | Max. één extra container | ✅ Eén ChromaDB service in docker-compose | [Commit `8a1ce68`](https://github.com/nickvanhooff/anna-remembers/commit/8a1ce68d6f5439f772ca292c30c621a2c1b53025) |

---

### 7. Aannames

- Het project blijft onder de ~100.000 vectoren. Bij opschaling naar productie zou pgvector opnieuw overwogen worden voor de eenvoud van één datastore.
- HNSW-indexering in ChromaDB presteert goed genoeg op projectschaal. Bij datasets boven ~1 miljoen vectoren kan een gespecialiseerde vector database zoals Qdrant of Weaviate relevanter worden [1].

---

### 8. Bronnen

**(1)** ChromaDB Documentation. (2024).  
[https://docs.trychroma.com](https://docs.trychroma.com)  
Gebruikt voor vergelijking van HNSW-indexering, similarity search en prestatie op kleine schaal.

**(2)** pgvector GitHub Repository. (2024).  
[https://github.com/pgvector/pgvector](https://github.com/pgvector/pgvector)  
Gebruikt voor vergelijking van similarity search via SQL-operator en architectuurverschillen.

---

### 9. Implementatiebewijs

| Commit | Beschrijving |
|---|---|
| [`8a1ce68`](https://github.com/nickvanhooff/anna-remembers/commit/8a1ce68d6f5439f772ca292c30c621a2c1b53025) | Docker Compose setup — ChromaDB service opgenomen naast PostgreSQL, MCP-server en backend |
| [`d6b6763`](https://github.com/nickvanhooff/anna-remembers/commit/d6b6763763cb850c9a760c3fccc2deb1a22be9c4) | `store_memory` en `recall_context` geïmplementeerd in `mcp-server/tools/memory.py` + 99 regels tests |
| [`1402e6b`](https://github.com/nickvanhooff/anna-remembers/commit/1402e6bfa69d72b62e82643d2a4806f53bb81d2d) | DL1 decision log aangemaakt |

Kernbestand: `mcp-server/tools/memory.py` — RAG-pipeline expliciet in vier stappen (embed → add → query → inject).

---

### 10. Wat dit oplevert

- Implementatie van `store_memory()` en `recall_context()` in MCP-server (issue #3) ✅
- Evidence: [evidence_01b_chromadb_vs_pgvector.md](../evidence/evidence_01b_chromadb_vs_pgvector.md)
- Volgende vraag: welk embedding model gebruiken voor de vectoren? → DL2
