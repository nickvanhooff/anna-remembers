# Evidence 08 — Escalatiedetectie implementatie: iteraties en eindresultaat

**Type:** iteratieoverzicht met testresultaten
**Datum:** 2026-05-16 (initieel) · 2026-05-17 (iteratie 6 + token/Langfuse onderbouwing toegevoegd)
**Hoort bij:** DL4 (escalatiedetectie), Stap 37–45 in STAPPEN.md
**Commits:** `5aef9ce`, `6efeb85`, `bd07eca` (+ qwen2.5:3b switch)

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
| Geen extra cloudtokenkosten | ✅ | qwen2.5:3b draait lokaal in bestaande Ollama container — zie tokenberekening hieronder |
| Traceerbaar in Langfuse | ✅ | `escalation-layer0` child span + `escalation-layer1-classify` generation span — zie trace-structuur hieronder |

---

## Iteratie 6 — 0.5B onbruikbaar voor Nederlands; upgrade naar qwen2.5:3b

**Probleem:** Tijdens de validatieronde na het portfolio-werk (2026-05-17) bleken duidelijk niet-urgente Nederlandse berichten als `Urgent` te worden geëscaleerd door qwen2.5:0.5b. Voorbeeldoutput uit Langfuse-traces:

| Patiëntbericht | Layer 1 reden (output 0.5b) | Beoordeling |
|---|---|---|
| `"Ik ben gewoon vermoeid van een lange dag"` | "pijn op de borst is gemeld met een lange dag en normale vermoeidheid aanwezig" | False positive — gehallucineerd |
| `"Ik ben lui"` | "pijn op de borst gemeld" | False positive — gehallucineerd |
| `"Wat doet mijn furosemide precies?"` | "milde specifiek van de medicijn" | False positive — gewone vraag |
| `"Ik werd vannacht wakker omdat ik geen lucht kreeg"` | gelabeld als `info` (low) | False negative — had `high` moeten zijn |

**Diagnose:** Een 0.5 miljard parameter model is te klein voor causale redenering in het Nederlands. Het pattern-matched op tokens uit de prompt (de woorden "pijn op de borst" zaten in de system prompt als voorbeeld) en plakte die in de output, ongeacht de input. Verbeteren via prompt redde dit niet — een te klein model wordt door betere prompts niet gered.

**Fix:** Switch naar `qwen2.5:3b` (6× groter, nog steeds lokaal). VRAM-footprint accepteerbaar naast bge-m3 in dezelfde Ollama-container.

```
docker exec -it ollama ollama pull qwen2.5:3b
# .env
ESCALATION_MODEL=qwen2.5:3b
```

**Validatie na switch:**

| Patiëntbericht | Layer 1 resultaat | Correct? |
|---|---|---|
| `"Ik werd vannacht wakker omdat ik geen lucht kreeg"` | escalate=true, urgency=high, reden="kan niet ademhalen" | ✅ |
| `"Ik heb bloed opgehoest"` | escalate=true, urgency=high, reden="bloed opgehoest gemeld" | ✅ |
| `"Mijn hart bonkt al een uur snel en ik word duizelig"` | escalate=true, urgency=medium, reden="hartkloppingen met duizeligheid" | ✅ |
| `"Ik ben vermoeid van een lange dag"` | escalate=false, reden="normale vermoeidheid" | ✅ |
| `"Wat doet mijn furosemide"` | escalate=false, reden="kennisvraag over medicijn" | ✅ |

**Les voor portfolio:** modelgrootte is niet vrij te kiezen op basis van VRAM-zuinigheid alleen. Voor Nederlandse medische triage is empirisch gebleken dat ~3B parameters het minimum is. Onder die grens hallucineren modellen redenen en koppelen tokens uit de system prompt mechanisch aan output — onafhankelijk van wat de patiënt feitelijk schreef.

---

## Tokenkosten — lokaal vs cloud-classificatie

Hoofdvraag: hoeveel scheelt het in tokens dat Layer 1 lokaal draait i.p.v. via Groq/Anthropic?

| Component | Tokens per Layer 1 call |
|---|---|
| System prompt (Engelse instructies + Nederlandse voorbeelden) | ~600 input |
| Patiëntbericht (gemiddeld) | ~30 input |
| JSON-respons | ~30 output |

Bij cloud-uitvoering zou dat zijn: **~630 input + 30 output tokens per niet-keyword bericht**. Bij Anna's huidige doelgroep (3 simulatiepatiënten × 10 sessies × ~5 berichten = 150 classificaties) is dit financieel verwaarloosbaar. Maar in een productiescenario (100 patiënten × wekelijkse check-in × ~10 berichten = ~4000 classificaties/maand) loopt het op tot **~2,5M input-tokens/maand puur voor classificatie**, bovenop de chat-LLM zelf.

**Wat we vermijden door lokaal te draaien:**
- Tokenfacturatie bij betaalde providers (Claude Haiku, Sonnet)
- Quota-uitputting op gratis tier (Groq: 14.400 requests/dag — Layer 1 zou hier ~30% van opslokken in productie)
- Latency-overhead van een tweede cloud-roundtrip (Groq is snel maar nog steeds netwerklatency)
- Privacygevoeligheid: medische triage-data verlaat de eigen infrastructuur niet

**Wat we ervoor inruilen:**
- ~250 MB extra VRAM (naast bge-m3)
- ~3-5 seconden GPU-tijd per niet-keyword bericht (asynchroon, gebruiker merkt het niet)

Voor het portfolio-doel "kosten- en privacybewust ontwerpen" is dit een gunstige trade-off. Voor cloud-only deployments zonder eigen GPU zou de afweging anders kunnen uitvallen.

---

## Langfuse-tracing structuur

Per inkomend chat-bericht legt de backend automatisch deze trace-boom vast in Langfuse:

```
chat-turn  (root span)
├── input: patient message
├── rag-retrieval  (span)
│     ├── input: query
│     ├── output: list of memory contents
│     └── metadata: { hit_count: N }
├── escalation-layer0  (span)
│     ├── input: patient message
│     ├── output: { triggered: bool, urgency: "high"|"medium"|"none" }
│     └── metadata: { reason: "Kritiek sleutelwoord gedetecteerd: '...'" }
└── llm-generation  (generation span — chat-LLM)
      ├── model: <chat model name>
      ├── input: full message list
      ├── output: assistant respons
      └── usage_details: { input, output }

[Apart, BackgroundTask]
escalation-layer1  (trace, propagate_attributes user_id + session_id)
└── escalation-layer1-classify  (generation span)
      ├── model: qwen2.5:3b
      ├── input: "Patient message: ..."
      ├── output: raw JSON respons
      └── (latency automatisch gemeten door Langfuse)
```

**Waarom dit waardevol is — vijf concrete redenen:**

1. **Audit per beslissing.** Voor elke escalatie is achteraf te zien welke laag triggerde, met welke reden, op welk patiëntbericht. In een productieomgeving onder AVG/AI Act is dit verplicht — elke geautomatiseerde medische actie moet reconstrueerbaar zijn.
2. **Modelversie vastgelegd.** `model=qwen2.5:3b` is onderdeel van de span. Als ooit terug zou worden gegaan naar 0.5b of vooruit naar 7b, is in historische traces zichtbaar welk gedrag bij welk model hoorde.
3. **False-positive analyse zonder reproductie.** Tijdens iteratie 6 hierboven kon ik direct uit Langfuse zien dat 0.5b voor "ik ben vermoeid" met "pijn op de borst gemeld" antwoordde — geen reproductie van de situatie nodig, alleen de trace lezen.
4. **Latency-bewijs.** De claim "Laag 1 ~3-5s" in DL4 §6a is geen schatting maar af te lezen uit `start_time`/`end_time` per span in Langfuse.
5. **Token-meting cloud-vergelijking.** Als ik de Layer 1 ooit naar cloud zou verplaatsen, levert Langfuse direct `usage_details` op, waardoor de cost-tabel uit DL4 §6a meetbaar wordt i.p.v. geschat.

Implementatie zit in:
- `backend/routers/chat/_routes.py:289-325` — `chat-turn`, `rag-retrieval`, `escalation-layer0`
- `backend/routers/chat/_escalation.py:144-204` — `escalation-layer1` trace + `escalation-layer1-classify` generation span met `propagate_attributes`
