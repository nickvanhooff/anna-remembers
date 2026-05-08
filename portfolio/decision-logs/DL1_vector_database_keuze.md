# DL1 — Vector database keuze: ChromaDB vs pgvector

**Datum:** 2026-05-05
**LO-fase:** LO1 Analyseren → LO3 Ontwerpen

---

## 0. Context

Anna Remembers slaat gespreksfragmenten op als vectoren voor semantisch geheugen (RAG). Het project draait al met PostgreSQL 16. De vraag was of een aparte vector database nodig is, of dat pgvector volstaat.

---

## 1. Onderzoeksvraag

Welke vector database past het beste bij Anna Remembers: ChromaDB (dedicated) of pgvector (PostgreSQL extensie)?

---

## 2. LO-fase

LO1 Analyseren — technische haalbaarheid van beide opties onderzocht op basis van projectschaal en leerdoelen.

---

## 3. Succescriteria

- RAG-pipeline is aantoonbaar bewust geïmplementeerd (niet verstopt achter SQL)
- Keuze is verdedigbaar op basis van projectschaal én leerdoel
- Embedding, similarity search en context-injectie zijn elk zichtbare stappen in de code

---

## 4. Beslissing

**ChromaDB** — bewust gekozen als dedicated vector database naast PostgreSQL.

---

## 5. Waarom

pgvector is bij 20-30 patiënten en 100+ sessies technisch voldoende. Bij die schaal (~45.000 vectoren) presteert pgvector met HNSW-index identiek aan ChromaDB.

De doorslag gaf het leerdoel: pgvector verstopt RAG achter een SQL-operator (`<=>`). ChromaDB maakt elke stap van de RAG-pipeline expliciet zichtbaar — embeddings genereren, opslaan met metadata, similarity search uitvoeren, resultaten als context injecteren. Dat is precies wat LO1 en LO4 vragen.

Nadeel: extra Docker container en twee losse datastores. Geaccepteerd omdat de voordelen voor het leerproces zwaarder wegen.

---

## 6. Houdt dit stand?

**Aanname:** het project blijft onder de ~100.000 vectoren. Bij opschaling naar productie zou pgvector opnieuw overwogen worden voor de eenvoud van één datastore.

**Criteria check:** RAG-pipeline is aantoonbaar zichtbaar in `mcp-server/tools/memory.py` — elke stap apart implementeerbaar en testbaar.

---

## 7. Wat dit ontsluit

- Implementatie van `store_memory()` en `recall_context()` in MCP-server (issue #3)
- Evidence: vergelijkingstabel ChromaDB vs pgvector op projectschaal
- Volgende vraag: welk embedding model gebruiken voor de vectoren?
