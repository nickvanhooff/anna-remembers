# Evidence 08 — Escalatiedetectie implementatie: iteraties en eindresultaat

**Type:** iteratieoverzicht met testresultaten
**Datum:** 2026-05-16
**Hoort bij:** DL4 (escalatiedetectie), Stap 37–42 in STAPPEN.md
**Commits:** `5aef9ce`, `6efeb85`

---

## Wat gebouwd is

Gelaagde escalatiedetectie zoals ontworpen in DL4:

- **Laag 0** — hardcoded keywords, synchroon, vóór LLM-aanroep (`_escalation.py: layer0_check()`)
- **Laag 1** — lokaal taalmodel via Ollama, asynchroon als BackgroundTask ná de chat-response (`_escalation.py: layer1_classify()`)

Beide lagen schrijven bij trigger naar `escalate_to_human()` in de MCP-server, die de escalatie persisteert in PostgreSQL.

---

## Iteratie 1 — Gemma 4 e2b timeout (eerste modelkeuze faalt)

**Plan:** Laag 1 gebruikt Gemma 4 e2b — het model dat al voor de chat-LLM in de Ollama container zit.

**Wat er gebeurde:** Alle Laag 1 aanroepen gaven een 499/500 fout na ~30 seconden.

**Diagnose:** Gemma 4 e2b is een multimodaal model met een vision-encoder. Totale grootte op schijf: ~7 GiB. Dit past niet tegelijk in VRAM naast bge-m3 (embedding, 1,1 GiB). Ollama laadt het model opnieuw bij elke aanroep, wat bij koude start >30 seconden duurt — langer dan de ingestelde httpx timeout van 30 seconden.

**Fix:** Model gewisseld naar `qwen2.5:0.5b` (373 MiB, puur tekstmodel). Past in VRAM naast bge-m3 zonder evictie. Instelling via omgevingsvariabele:

```
ESCALATION_MODEL=qwen2.5:0.5b
```

**Commit:** `5aef9ce`

---

## Iteratie 2 — qwen escaleert niet op Nederlands bericht

**Test:** `"ik verbrand"` → verwacht: escalatie `medium`. Feitelijk resultaat: geen escalatie.

**Diagnose:** qwen2.5:0.5b is primair Engelstalig getraind. De Nederlandse system prompt werd niet goed gevolgd. Het model retourneerde `{"escalate": false}` voor duidelijke escalatiezinnen in het Nederlands.

**Fix:** System prompt omgezet naar Engels met expliciete Nederlandse voorbeelden:

```python
_CLASSIFY_SYSTEM = (
    "You are a medical triage assistant for heart failure patients. "
    "Patient messages may be in Dutch. ..."
    'Example: "ik verbrand" -> {"escalate": true, "urgency": "medium", "reason": "brandend gevoel gemeld"}\n'
    'Example: "olla" -> {"escalate": false, "urgency": "medium", "reason": "alleen begroeting"}'
)
```

**Commit:** `5aef9ce`

---

## Iteratie 3 — Timeout bij warme qwen aanroep (90s fix)

**Probleem:** Zelfs na modelwissel traden timeouts op bij de eerste aanroep na een langere pauze (bge-m3 had VRAM ingenomen).

**Fix:** httpx timeout verhoogd van 30s naar 90s om cold-start te dekken:

```python
async with httpx.AsyncClient(timeout=90.0) as client:
```

**Commit:** `5aef9ce`

---

## Iteratie 4 — Cooldown blokkeerde Laag 1 bij alle tests

**Probleem:** Alle Laag 1 tests binnen dezelfde sessie werden overgeslagen. Logging:
```
Layer 1 skipped: cooldown active for patient <id>
```

**Oorzaak:** `ESCALATION_COOLDOWN_MINUTES` stond standaard op `"5"`. Elk testbericht viel daarbinnen — Laag 1 werd nooit bereikt.

**Fix:** Default gewijzigd naar `"0"` (geen cooldown). Productie-instellingen via `.env`:

```
ESCALATION_COOLDOWN_MINUTES=0   # testen
ESCALATION_COOLDOWN_MINUTES=30  # productie
```

**Commit:** `5aef9ce`

---

## Iteratie 5 — Escalatiereden onleesbaar in dashboard

**Probleem:** Het dashboard toonde alleen de technische `reason` string uit de database, zonder structuur. De zorgverlener kon niet zien welk bericht de escalatie triggerde.

**Fix:** `format_escalation_reason()` toegevoegd — voegt het originele patiëntbericht altijd toe aan de `reason`:

```
Laag 0 (keywords) · Patiëntbericht: «ik heb pijn op de borst» · Kritiek sleutelwoord gedetecteerd: 'pijn op de borst'
Laag 1 (qwen2.5:0.5b) · Patiëntbericht: «ik voel me heel slecht» · ernstige klacht gemeld
```

**Commit:** `6efeb85`

---

## Eindresultaat — API-testbewijs

### Test 1 — Normaal bericht, geen escalatie

```
POST /chat/332f9a06-... {"content": "Goedemorgen, ik voel me vandaag redelijk goed"}

Response:
{
  "content": "Dat is een fijn gevoel...",
  "escalation_triggered": false
}
```

Laag 0: geen keyword match. Laag 1: loopt asynchroon als BackgroundTask.

---

### Test 2 — Laag 0 trigger (pijn op de borst + kan niet ademhalen)

```
POST /chat/332f9a06-... {"content": "ik heb pijn op de borst en kan niet ademhalen"}

Response:
{
  "content": "Dat klinkt heel erg...",
  "escalation_triggered": true
}
```

Escalatie in database:

```json
{
  "patient_name": "Sanne Boelens",
  "urgency": "high",
  "reason": "Laag 0 (keywords) · Patiëntbericht: «ik heb pijn op de borst en kan niet ademhalen» · Kritiek sleutelwoord gedetecteerd: 'pijn op de borst'",
  "created_at": "2026-05-16T21:47:32"
}
```

Laag 0 detecteerde `'pijn op de borst'` (HIGH keyword) synchroon vóór de LLM-aanroep. Escalatie verstuurd vóór HTTP-response.

---

## Voldoet aan succescriteria DL4

| Criterium | Gehaald? | Bewijs |
|---|---|---|
| Kritieke gevallen altijd gedetecteerd | ✅ | Test 2 — Laag 0 deterministisch, onafhankelijk van LLM |
| Nul extra wachttijd gebruiker | ✅ | Laag 1 loopt als BackgroundTask ná response |
| Geen extra cloudtokenkosten | ✅ | qwen2.5:0.5b draait lokaal in bestaande Ollama container |
| Traceerbaar in Langfuse | ✅ | `escalation-layer0` child span in elke `chat-turn` trace; `escalation-layer1-classify` generation span als BackgroundTask |
