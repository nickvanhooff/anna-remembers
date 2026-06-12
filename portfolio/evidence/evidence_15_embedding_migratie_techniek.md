# Evidence 15 — Embedding migratie: re-embedding techniek

**Type:** Technische uitleg + code-analyse
**Datum:** 2026-06-09
**Hoort bij:** Stap 86–87 in STAPPEN.md (provider-switch + presets)
**Commit:** feature/provider-switch-portkey branch

---

## Kernvraag

Hoe worden herinneringen omgezet als je van embedding-provider wisselt (Ollama → Portkey)?

---

## Techniek: re-embedding

Vectoren zijn **niet overdraagbaar** tussen embedding-modellen. Een vector van bge-m3 (1024 dimensies) en een vector van text-embedding-3-large (3072 dimensies) leven in een andere wiskundige ruimte — je kunt ze niet vergelijken of kopiëren.

De oplossing is **re-embedding**: de originele tekst wordt opnieuw door het nieuwe model gehaald om een nieuwe vector te berekenen.

---

## Architectuur: twee aparte collecties

Anna Remembers houdt twee ChromaDB-collecties bij — één per provider:

| Provider | Collectienaam | Model | Dimensies |
|---|---|---|---|
| Ollama | `memories_bge_m3` | bge-m3 | 1024 |
| Portkey | `memories_openai_3large` | text-embedding-3-large | 3072 |

Beide collecties bestaan tegelijk in ChromaDB. Wisselen van provider betekent wisselen van collectie — de oude data blijft intact.

---

## Migratiestappen (code: `mcp-server/tools/migration.py`)

```python
# Stap 1: haal alle documenten op uit de broncollectie (tekst + metadata, geen vectors)
all_docs = source_col.get(include=["documents", "metadatas"])

# Stap 2: re-embed elk document met de nieuwe provider
for doc_id, content, meta in zip(ids, documents, metadatas):
    vector = await target_embed.embed(content)      # nieuwe vector via target-model
    target_col.upsert(                              # schrijf naar doelcollectie
        embeddings=[vector],
        documents=[content],
        metadatas=[meta],
        ids=[doc_id],
    )
```

**Idempotent:** hetzelfde document-ID wordt overschreven. De migratie twee keer draaien is veilig.

---

## Hot-swap na migratie (code: `mcp-server/main.py`)

```python
class _EmbedHolder:
    """Mutable wrapper zodat MCP-tools de actieve provider kunnen wisselen."""
    provider_name: str
    instance: EmbeddingProvider

# Na migratie: wissel de actieve provider in geheugen
_holder.provider_name = provider
_holder.instance = get_embedding_provider_by_name(provider)
```

Alle nieuwe `store_memory` en `recall_context` aanroepen gebruiken daarna de nieuwe collectie.

---

## Wat er NIET gebeurt

- Vectors worden **niet gekopieerd** — ze zijn incompatibel
- De broncollectie wordt **niet verwijderd** — terugschakelen naar Ollama werkt zonder opnieuw te migreren
- Bij de preset-wissel in de UI wordt de migratie **niet automatisch gestart** — de gebruiker doet dit apart via de Geheugen-kaart in de settings

---

## Tijdscomplexiteit

De migratie is O(n) API-calls naar de nieuwe embedding-provider.  
Bij 100 herinneringen = 100 cloud-requests naar Portkey → Azure OpenAI.

---

## Bronnen

- ChromaDB documentatie: `get()` en `upsert()` — https://docs.trychroma.com/reference/py-collection
- OpenAI text-embedding-3-large: 3072 dimensies — https://platform.openai.com/docs/guides/embeddings
- bge-m3: meertalig, 1024 dimensies — https://huggingface.co/BAAI/bge-m3
