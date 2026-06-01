# Evidence 01b — ChromaDB vs pgvector vergelijking

**Type:** vergelijkingstabel + schaalberekening  
**Datum:** 2026-05-05  
**Hoort bij:** Decision log DL1_vector_database_keuze.md, Stap 8 in STAPPEN.md  

---

## Vergelijkingstabel

| Criterium | ChromaDB | pgvector |
|---|---|---|
| Similarity search | `collection.query()` — expliciete methode | `SELECT ... ORDER BY embedding <=> $1` — verborgen in SQL |
| RAG-pipeline zichtbaarheid | Elke stap apart: embed → add → query → inject | Pipeline opgegaan in SQL-laag |
| Prestaties op projectschaal (~45.000 vectoren, HNSW) | Verwaarloosbaar verschil | Verwaarloosbaar verschil |
| Extra infrastructuur | Aparte Docker-container (chromadb service) | Geen — PostgreSQL extensie |
| Metadata-filtering | Ingebouwd via `where={}` parameter | Via SQL `WHERE` clause |
| Leerbaarheid RAG-concepten | Hoog — elke stap is een aanraakbaar codepunt | Laag — RAG-logica verstopt achter operator |
| Portfoliowaarde (LO1/LO4) | Hoog — aantoonbaar bewust geïmplementeerd | Laag — niet zichtbaar als aparte pipeline |

---

## Schaalberekening

| Factor | Schatting |
|---|---|
| Aantal patiënten | 20–30 |
| Sessies per patiënt | ~100 (langlopend systeem) |
| Geheugenblokken per sessie | ~15 fragmenten |
| Totaal vectoren | 20 × 100 × 15 = **30.000** (worst case ~45.000) |

Conclusie: beide databases presteren identiek bij HNSW-indexering op deze schaal. Prestatieverschil is geen doorslaggevend criterium.

---

## Bronnen

1. Chroma Research. (z.d.). *Chroma documentation — Getting started*. Geraadpleegd op 2026-05-05 van https://docs.trychroma.com/getting-started
2. pgvector contributors. (z.d.). *pgvector: Open-source vector similarity search for Postgres* [GitHub repository]. Geraadpleegd op 2026-05-05 van https://github.com/pgvector/pgvector
3. Douze, M., et al. (2024). *The FAISS library*. arXiv. https://arxiv.org/abs/2401.08281 — achtergrond HNSW-indexering en schaalgedrag van vector databases
