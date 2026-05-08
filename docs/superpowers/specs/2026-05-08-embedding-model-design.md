# Design Spec — Embedding Model Keuze (bge-m3 via Ollama)

**Datum:** 2026-05-08  
**Status:** Goedgekeurd  
**Blokkeert:** Issue #3 (MCP Server / ChromaDB RAG implementatie)  
**Portfolio:** DL2 — Architectuurkeuzes embedding model

---

## Probleemstelling

De MCP-server implementeert `store_memory` en `recall_context` — twee tools die tekst opslaan in en ophalen uit ChromaDB via semantische vector search. Hiervoor is een embedding model nodig dat Nederlandse patiëntteksten omzet naar vectoren. De keuze raakt ChromaDB-dimensies, VRAM-budget (RTX 4050, 6 GB), en RAG-kwaliteit.

---

## Keuze

**Model:** `bge-m3` (BAAI/bge-m3)  
**Hosting:** bestaande Ollama-container (`ollama/ollama`)  
**API-endpoint:** `POST http://ollama:11434/api/embed`  
**Dimensies:** 1024  
**Context:** 8192 tokens  
**VRAM:** ~1.5 GB geladen

### Afgewezen alternatieven

| Model | Reden afgewezen |
|---|---|
| `nomic-embed-text` | Primair Engels getraind, minder sterk voor Nederlandse zorgdomein-teksten |
| `mxbai-embed-large` | 512-token contextlimiet is te krap voor sessiesamenvattingen; minder meertalig |

### Redenering voor bge-m3

1. **Meertalig state-of-the-art** — expliciet getraind op 100+ talen inclusief Nederlands; betere semantische overeenkomsten voor termen als "kortademig", "enkelvoetoedeem", "medicatietrouw"
2. **Past naast gemma4:e4b** — Ollama swapped modellen op aanvraag; ze hoeven niet tegelijk in VRAM
3. **8192-token context** — past op volledige sessiesamenvattingen en langere geheugenblokken
4. **Portfolio-waarde (LO1/LO4)** — meertalige keuze is technisch onderbouwbaar in DL2

---

## Architectuur

```
patiënt-bericht
     │
     ▼
MCP store_memory(content, source, patient_id, session_id)
     │  POST /api/embed {"model": "bge-m3", "input": content}
     ▼
Ollama container  →  [1024-dim float vector]
     │
     ▼
ChromaDB "patient_memories" collection
     │  metadata: patient_id, session_id, source, timestamp
     ▼
opgeslagen

recall_context(query, patient_id, limit):
  query → Ollama embed → ChromaDB .query(where={patient_id}) → top-k resultaten
```

Ollama laadt gemma4:e4b bij chat-calls en bge-m3 bij embed-calls. Op projectschaal (~300 geheugenblokken totaal) is het wisselen geen bottleneck.

**Geen nieuwe Docker-service.** bge-m3 draait in de bestaande `ollama`-container.

---

## Componenten

### mcp-server/services/embedding.py (nieuw)

```python
class EmbeddingProvider(ABC):
    async def embed(self, text: str) -> list[float]: ...

class OllamaEmbeddingProvider(EmbeddingProvider):
    # POST http://ollama:11434/api/embed
    # retourneert list[float] met 1024 dimensies
```

Zelfde patroon als `backend/services/llm.py` — wisselen van embedding provider = één nieuwe subklasse.

### ChromaDB collectie

- Naam: `patient_memories`
- `embedding_function=None` — MCP-server levert vectors zelf aan
- Dimensies: 1024
- Metadata per document: `patient_id`, `session_id`, `source` (`patient_stated` | `ai_inferred`), `timestamp`

### docker-compose.yml aanpassing

Init-container toegevoegd die `ollama pull bge-m3` uitvoert bij eerste opstart. Model wordt opgeslagen in het bestaande `ollama_data`-volume — geen herdownload na restart.

### Env vars (mcp-server)

```
OLLAMA_BASE_URL=http://ollama:11434
EMBEDDING_MODEL=bge-m3
```

---

## Dataflow

### store_memory

1. Ontvang `content`, `source`, `patient_id`, `session_id`
2. `embed(content)` → POST Ollama → `list[float]` (1024 dims)
3. `collection.add(embeddings=[vector], documents=[content], metadatas=[{...}], ids=[uuid4])`
4. Retourneer opgeslagen id

### recall_context

1. Ontvang `query`, `patient_id`, `limit`
2. `embed(query)` → vector
3. `collection.query(query_embeddings=[vector], where={"patient_id": patient_id}, n_results=limit)`
4. Retourneer `list[{content, source, session_id, distance}]`

---

## Foutafhandeling

- **Ollama onbereikbaar:** `httpx.RequestError` → `EmbeddingUnavailableError` (MCP-fout met beschrijvende melding)
- **store_memory bij embedding-fout:** faalt gracefully — gesprek loopt door, maar zonder opgeslagen geheugen. Geen silent failure.
- **ChromaDB-fout:** gelogd en doorgegeven als MCP-fout
- **Principe:** als embedding mislukt weet de aanroeper het altijd

---

## Wat dit NIET omvat

- Implementatie van `get_symptom_trends` en `escalate_to_human` — dat is los issue #3 werk
- ChromaDB collectie-schema voor symptoomdata — dat is PostgreSQL (tabellen `sessions`, `messages`)
- Frontend integratie — volgt in issue #4
