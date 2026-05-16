# Evidence 06 — Token usage: Markdown vs. compact JSON voor medische samenvatting

**Type:** Benchmarkresultaat / observability-meting
**Datum:** 2026-05-13
**Hoort bij:** Issue #32 — Markdown vervangen door compact JSON voor lagere token usage
**Branch:** feature/patient-summary

## Inhoud

### Meetopstelling

Vier opeenvolgende `summary-update` runs gemeten via Langfuse tracing op hetzelfde patiëntprofiel (`a a`, `840e4ede`). Model: `llama-3.1-8b-instant` via Groq. De eerste run is Markdown (vóór de wijziging), de overige drie zijn compact JSON.

| Timestamp | Formaat | Input tokens | Output tokens | Totaal | Latency |
|---|---|---|---|---|---|
| 2026-05-13 20:31:05 | Markdown (voor) | 1.276 | 219 | 1.495 | 0,69s |
| 2026-05-13 20:58:00 | JSON run 1 | 1.579 | 139 | 1.718 | 0,36s |
| 2026-05-13 21:20:01 | JSON run 2 | 1.591 | 84 | 1.675 | 0,30s |
| 2026-05-13 20:27:38 | JSON run 3 | 1.667 | 46 | 1.713 | 0,33s |

Screenschot: `images/langfuse_change_to_json.png`

### Bevindingen — summary-update call zelf

**Output tokens** dalen consistent: 219 → 139 → 84 → 46 (−79% op run 3). Dit is het directe gevolg van compact JSON-output tegenover uitgeschreven Markdown met headers en bulletpoints.

**Input tokens** stijgen licht: van 1.276 naar ~1.630 (+28%). Twee oorzaken:
1. De nieuwe prompt bevat instructies en een JSON-schema-voorbeeld, wat iets langer is.
2. De gesprekscontext groeit per run — meer berichten = meer chathistorie in de input.

**Totaal** is daardoor nagenoeg gelijk (~1.495 → ~1.713). Op de update-call zelf is de besparing niet hard aantoonbaar — de groeiende context is een confounding factor die de output-winst compenseert.

**Latency** daalt wel: 0,69s → 0,33s (−52%), omdat het model minder output-tokens genereert.

### Bevindingen — de summary zit ook in elke chat-turn

De medische samenvatting wordt bij **elke chat-turn** via `_build_system_prompt()` als blok in de system prompt geïnjecteerd. Een voorbeeld chat-turn trace (21:21:47) toont 855 input tokens voor input "JA".

Dit is waar de tokenwinst accumuleert. Een Markdown-samenvatting uit run 1 is ~200 tokens; de JSON-variant na run 3 is ~25 tokens (`{"sym":["duizeligheid","kriebel in keel","diarree"],"med":null,"wgt":null,"bhv":null,"ovr":[]}`). Dat scheelt ~175 tokens **per chat-beurt**. Bij 20 berichten na een update: ~3.500 tokens bespaard — méér dan de volledige update-call kost.

### Bijvangst: kwaliteitsprobleem ontdekt via tracing

De Langfuse-output van run 3 onthulde een inhoudelijk probleem los van token-efficiency. De samenvatting kromp van run tot run in plaats van uit te breiden:

- Run 1 output: `{"sym":["Kortademigheid","Benauwdheid","Duizeligheid","Moeilijk ademen"],"med":["slecht geheugen","onduidelijk medicatieschema"],...,"ovr":["verhuizing naar Londen","Amsterdam","33°C"]}`
- Run 3 output: `{"sym":["duizeligheid","kriebel in keel","diarree"],"med":null,"wgt":null,"bhv":null,"ovr":[]}`

Het model overschreef de bestaande samenvatting met alleen wat in de recentste berichten stond, in plaats van te accumuleren. De prompt zei "schrijf een bijgewerkte samenvatting" zonder expliciet te stellen dat bestaande feiten bewaard moeten blijven.

**Fix:** prompt herschreven om het model te instrueren de huidige summary als basis te nemen en alleen toe te voegen of te corrigeren als de patiënt iets expliciet tegenspreekt.

Dit probleem was alleen zichtbaar doordat de Langfuse trace de volledige JSON-output logt — bij Markdown-output was de inhoudelijke degradatie minder opvallend.

### Conclusie

De directe tokenbesparing op de `summary-update` call is **minimaal en niet isoleerbaar** door de groeiende gesprekscontext. De winst zit in:

1. **Chat-turn input**: ~150–175 tokens bespaard per beurt dankzij compactere samenvatting in de system prompt
2. **Latency**: −52% op update-calls doordat het model minder genereert
3. **Gestructureerde data**: frontend rendert JSON als UI-componenten
4. **Observability**: JSON-output maakt kwaliteitsproblemen (zoals de overschrijf-bug) direct zichtbaar in Langfuse

Het acceptatiecriterium "meetbare daling in token usage" is op call-niveau niet hard aangetoond. De accumulatieve besparing over chat-turns is aannemelijk maar niet geïsoleerd gemeten.

## Bronnen

Geen externe bronnen — alle metingen uit eigen Langfuse-instantie (`cmp4bvf770006ol07q4dnumfr`).
