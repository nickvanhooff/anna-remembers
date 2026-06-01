# Decision Log — Anna Remembers

**Naam:** Nick van Hooff  
**Klas:** MA-AAI1  
**Rol:** GenAI Engineer

---

## Entry #5: Hoe bepaal ik welke 3D-animatie Anna toont op basis van het gesprek?

### Onderzoeksvraag

> Welke aanpak gebruik ik om de avatar-animatie te koppelen aan de gesprekstoestand, zodat de beweging aansluit bij wat de gebruiker zegt én wat Anna antwoordt, zonder dat de aanpak breekbaar of overgeëngineered wordt?

---

### 1. Context

**Project:** Anna Remembers — AI-gezondheidsassistent voor hartfalenpatiënten

**Waarom dit nu belangrijk is:**  
Anna is een 3D-avatar (Three.js GLB-model met morph targets — vervormpunten op het gezicht voor lip sync en gezichtsuitdrukkingen). Voor de demo moet de avatar niet alleen praten, maar ook bewegingen tonen die passen bij het gesprek. Een patiënt die zegt dat hij dagelijks wandelt moet een andere animatie zien dan een patiënt die pijn op de borst meldt. Zonder animatiesysteem staat de avatar statisch — dat ondermijnt de geloofwaardigheid van de interface.

**Hoe ik hier tegenaan liep:**  
In de eerste opzet (stap 62) werd een subagent ingezet die een mood-systeem bouwde met Levenshtein-afstandsberekening (een algoritme dat berekent hoeveel tekens je moet wijzigen om van de ene string naar de andere te komen — gebruikt voor fuzzy matching), alias-tabellen en een `_infer_mood_from_user` functie die de LLM-keuze overreed. Dit stond haaks op de oorspronkelijke motivatie ("de LLM weet beter wat de toon is") en leverde 290 regels op voor iets wat in principe eenvoudig is. In stap 63 heb ik dit herkend en het systeem herontworpen.

**Aangetoonde leeruitkomsten:**

- [ ] LO1: Analyseren
- [ ] LO2: Adviseren
- [x] LO3: Ontwerpen — resolutie-volgorde bewust gekozen en onderbouwd
- [x] LO4: Realiseren — drie iteraties geïmplementeerd, bug gefixt
- [ ] LO5: Beheren & Controleren
- [x] LO6: Professionele Standaard — overengineering herkend en gecorrigeerd
- [ ] LO7: Persoonlijk Leiderschap

---

### 2. Succescriteria

| Criterium | Doel | Redenering achter de norm |
|---|---|---|
| **Correctheid** | Animatie sluit aan bij wat de gebruiker zegt of wat Anna antwoordt | Als de animatie niet klopt bij de context, leidt het af — een avatar die vrolijk springt terwijl een patiënt pijn meldt is schadelijk voor het vertrouwen in het systeem |
| **Robuustheid** | Onbekende of ongeldige LLM-output valt terug op een default | Kleine modellen (qwen2.5:3b) produceren soms onverwachte tags — het systeem mag niet crashen of een verkeerde animatie tonen; een neutrale standaard is altijd beter dan een fout |
| **Eenvoud** | Animatielogica past in één util-bestand, één publieke functie | Hoe minder code, hoe minder bugs. Een animatiesysteem van 290 regels (stap 62) voor 4 animaties is overgeëngineered — 135 regels (huidige versie) voor dezelfde functionaliteit bewijst dat het eenvoudiger kan |

---

### 3. Wat ik heb besloten

**Gekozen: keyword-first resolutie — user-bericht als primair signaal, LLM-tag als back-up, default als vangvloer**

De resolutie-volgorde:
1. **Keyword-check op user-bericht** — Nederlandse triggerwoorden (bijv. "ren", "wandel", "val") geven een directe animatie. Dit is een feit, geen interpretatie.
2. **LLM `[ANIM: x]` tag** — exact match tegen een whitelist (vaste lijst van toegestane waarden) van geldige animatienamen (case-insensitive). Als de LLM iets onzinnigs produceert, valt het door naar stap 3.
3. **Default** — `standard_waiting` als geen van de bovenstaande triggert.

De tag wordt altijd gestript (verwijderd) uit de tekst vóór opslag in de DB en vóór verzending naar de TTS-bridge (Text-to-Speech brug — de service die tekst omzet naar audio).

**Waarom keyword vóór LLM:**  
"Ik ren een marathon" is een feit — de gebruiker beschrijft een fysieke actie. Het is betrouwbaarder om dat direct te herkennen dan te wachten op de LLM-interpretatie van Anna's antwoord. De LLM-tag is nuttig voor gevallen zonder duidelijk keyword (bijv. een geruststellend antwoord van Anna bij een neutrale vraag).

---

### 4. Hoe ik dit heb onderzocht

**Eigen ervaring (Field):**  
Eerste implementatie (stap 62) via subagent: 290 regels met Levenshtein-matching en alias-tabel. Na review herkend dat de complexiteit niet gerechtvaardigd was door het probleem. Herontwerp in stap 63 resulteerde in 135 regels — 54% minder code, zelfde functionaliteit.

Bug gevonden in stap 64: `qwen2.5:3b` plaatst de `[ANIM: x]` tag regelmatig midden in de response, niet op de eerste regel. De `^`-geankerde regex (een patroon dat alleen het begin van de tekst doorzoekt) sloeg dit over, waardoor de tag letterlijk in de tekst belandde die naar de XTTS-bridge ging — de TTS sprak `[ANIM: flexing_arm]` hardop uit.

→ Iteraties gedocumenteerd in [evidence_11_animation_tag_iteraties.md](../evidence/evidence_11_animation_tag_iteraties.md)

---

### 5. Wat ik heb gevonden

| Aanpak | Correctheid | Robuustheid | Complexiteit |
|---|---|---|---|
| **Optie A — Alleen LLM-tag** | Afhankelijk van model | Breekbaar bij onverwachte output | Laag |
| **Optie B — Alleen keyword-matching** | Goed voor expliciete acties | Mist impliciete toon (bijv. Anna troost) | Laag |
| **Optie C — Levenshtein + alias + LLM (stap 62)** | Hoog maar overgeëngineered | Hoog (fuzzy matching) | Hoog — 290 regels voor 4 animaties, niet gerechtvaardigd |
| **Optie D — Keyword-first + LLM-tag + default (gekozen)** | Goed | Hoog (whitelist + fallback) | Laag — 135 regels, één util-bestand |

---

### 6. Voldoet dit aan mijn criteria?

| Criterium | Doel | Gehaald? | Bewijs |
|---|---|---|---|
| **Correctheid** | Animatie sluit aan bij gesprek | ✅ Keywords geven directe correcte match; LLM-tag voor context zonder keyword | [evidence_11 — iteraties en testresultaten](../evidence/evidence_11_animation_tag_iteraties.md) |
| **Robuustheid** | Onbekende output → default | ✅ Whitelist + default-fallback, nooit crash; mid-tekst bug gefixt in stap 64 | [evidence_11 — bugfix mid-tekst regex](../evidence/evidence_11_animation_tag_iteraties.md) |
| **Eenvoud** | Één util-bestand, één publieke functie | ✅ 135 regels vs 290 regels in stap 62 — 54% reductie door herontwerp | Stap 63 in STAPPEN.md |

---

### 7. Aannames

- qwen2.5:3b volgt de prompt-instructie om `[ANIM: x]` op de eerste regel te plaatsen in de meeste gevallen. Als dat niet lukt, vangt de mid-tekst regex het op.
- De keyword-lijst dekt de meest voorkomende fysieke acties in een hartfalen-context (bewegen, vallen, pijn). Voor andere domeinen zou de lijst herzien moeten worden.
- De whitelist van geldige animatienamen sluit aan bij de animaties die beschikbaar zijn in het GLB-model. Als er nieuwe animaties worden toegevoegd, moet de whitelist handmatig uitgebreid worden.

---

### 8. Bronnen

Geen externe bronnen geraadpleegd — het systeem is ontworpen op basis van eigen iteratie en field testing (stappen 62–64). De iteraties zijn gedocumenteerd in [evidence_11_animation_tag_iteraties.md](../evidence/evidence_11_animation_tag_iteraties.md).

---

### 9. Implementatiebewijs

| Wat | Bewijs |
|---|---|
| Eerste opzet: mood-systeem via subagent | Stap 62 in STAPPEN.md |
| Refactor: keyword-first, util-bestand, hernoeming mood → animation | Stap 63 in STAPPEN.md |
| Bugfix: mid-tekst regex + TTS-lek | Stap 64 in STAPPEN.md — `re.sub` over volledige tekst in plaats van `^`-geankerde regex |
| Iteraties gedocumenteerd | [evidence_11_animation_tag_iteraties.md](../evidence/evidence_11_animation_tag_iteraties.md) |

---

### 10. Wat dit oplevert

Het animatiesysteem maakt de demo overtuigender: de avatar reageert zichtbaar op wat de patiënt zegt, wat het gevoel van een echte interactie versterkt. Voor het portfolio toont dit LO3 (bewust ontwerpen van een resolutie-volgorde) en LO4 (drie iteraties geïmplementeerd en verbeterd). Daarnaast toont het herontwerp in stap 63 zelfkritisch vermogen: overengineering herkennen en corrigeren is een professionele vaardigheid.
