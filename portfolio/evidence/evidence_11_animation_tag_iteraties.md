# Evidence 11 — Animatie-tag iteraties (stappen 62–64)

**Type:** Bugreport + iteratiedocumentatie
**Datum:** 2026-05-25
**Hoort bij:** Decision log DL5_animation_tag_systeem.md, Stappen 62–64 in STAPPEN.md
**Commit:** Stap 63 (refactor) + Stap 64 (bugfix) — zie STAPPEN.md

---

## Inhoud

### Iteratie 1 — Mood-systeem via subagent (stap 62)

**Wat:** Subagent bouwde een mood-systeem met Levenshtein-afstandsberekening, alias-tabellen en een `_infer_mood_from_user` functie.

**Probleem:**
- 290 regels voor een eenvoudig probleem
- `_infer_mood_from_user` overreed de LLM-keuze — haaks op de motivatie ("de LLM weet beter")
- Levenshtein-matching op animatienamen lost niets op dat een whitelist niet beter oplost

**Uitkomst:** Overengineering herkend, besloten tot refactor in stap 63.

---

### Iteratie 2 — Refactor: keyword-first resolutie (stap 63)

**Wat:** Volledig herontwerp naar drie lagen:
1. Keyword-check op user-bericht (Nederlandse triggerwoorden)
2. LLM `[ANIM: x]` tag — exacte whitelist-match
3. Default: `standard_waiting`

**Resultaat:**
- 135 regels — 54% minder dan de 290 regels uit iteratie 1
- Één publieke functie, één util-bestand
- Mood-naamgeving hernoemd naar animation overal

**Commit:** Stap 63 in STAPPEN.md

---

### Iteratie 3 — Bugfix: mid-tekst tag + TTS-lek (stap 64)

**Wat:** Bug gevonden: `qwen2.5:3b` plaatst `[ANIM: x]` regelmatig midden in de response, niet op de eerste regel.

**Symptoom:** XTTS-bridge (Text-to-Speech service) sprak `[ANIM: flexing_arm]` hardop uit — tag bereikte de TTS in plaats van gestript te worden.

**Oorzaak:** Regex was geankerd met `^` (zoekt alleen aan het begin van de string), sloeg mid-tekst plaatsingen over.

**Fix:** `re.sub` over de volledige tekst (niet geankerd), altijd vóór opslag in DB en vóór verzending naar TTS.

**Commit:** Stap 64 in STAPPEN.md

---

### Animatie in werking

De avatar toont de lopende animatie wanneer de gebruiker fysieke activiteit noemt (keyword "ren", "loop", "wandel"). De GIF toont de lopende animatie in de browser:

![Anna avatar — lopende animatie](images/gif_animation_running_avatar.gif)

---

### Vergelijkingstabel iteraties

| Iteratie | Regels | Correctheid | Robuustheid | Probleem |
|---|---|---|---|---|
| 1 — Levenshtein + alias + LLM | ~290 | Matig | Hoog (fuzzy) | Overengineered, LLM override |
| 2 — Keyword-first + whitelist | 135 | Goed | Hoog | — |
| 3 — Mid-tekst regex fix | 135 | Goed | Hoog | TTS-lek opgelost |

---

## Bronnen

Geen externe bronnen geraadpleegd — het systeem is ontworpen op basis van eigen iteratie en field testing (stappen 62–64 in STAPPEN.md).
