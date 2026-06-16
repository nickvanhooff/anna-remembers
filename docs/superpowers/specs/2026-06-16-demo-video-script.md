# Demo Video Script — Anna Remembers

**Datum:** 2026-06-16
**Doelgroep:** Zorginstelling (ziekenhuis / zorgverleners)
**Totale lengte:** ~4,5 minuut

---

## Deel 1 — Pitch (1 minuut, gesproken)

Mevrouw de Vries, 72 jaar, hartfalen. Ze belt niet zo snel — ze wil de dokter niet lastigvallen. Maar thuis stapelen de klachten zich op: enkels dik, kortademig bij de trap. Tegen de tijd dat ze op de SEH ligt, had ingrijpen twee weken eerder voorkomen kunnen worden.

Anna Remembers lost dit op.

Anna is een AI-assistent die wekelijks incheckt bij hartfalenpatiënten — via gewone chat of stem. Ze onthoudt wat de patiënt de week ervoor zei, herkent verslechterende patronen over tijd, en escaleert automatisch naar de zorgverlener als de situatie dat vraagt. Geen app om te leren, geen extra belasting voor de patiënt.

Voor uw instelling betekent dit: eerder ingrijpen, minder heropnames, en een concreet digitaal dossier bij elke escalatie.

Anna herinnert wat patiënten vergeten te melden.

---

## Deel 2 — Demo (~4,5 minuut)

### Scene 1 — Opening (~20 sec)
*Geen scherm*

> Anna Remembers is een AI-gezondheidsassistent voor hartfalenpatiënten. Het systeem voert wekelijkse check-ins uit, onthoudt wat patiënten eerder hebben gezegd, herkent verslechterende patronen, en escaleert automatisch naar een zorgverlener. Ik laat je de volledige technische pipeline zien.

---

### Scene 2 — Patiëntenoverzicht (~15 sec)
*Scherm: patients-pagina*

> Drie gesimuleerde patiënten — elk met een eigen scenario. Patiënt 2 verslechtert geleidelijk over meerdere weken. We gaan die volledig doorlopen.

---

### Scene 3 — Chat: RAG-geheugen en patiëntdossier (~60 sec)
*Scherm: chat-scherm, gesprek starten*

> Zodra een sessie start, bouwt het systeem de context op voor de LLM. Dat gebeurt in drie lagen.

> De eerste laag is het **patiëntdossier** — een compact JSON-object dat na elk gesprek automatisch wordt bijgewerkt door een BackgroundTask. Het bevat symptomen, medicatie, gewicht, gedrag, en een algemeen overzicht. Dit wordt als blok bovenaan de system prompt geïnjecteerd.

> De tweede laag is **RAG-geheugen** via ChromaDB. Elke uitspraak die de patiënt doet, wordt opgeslagen als embedding met het bge-m3 model. Bij elke beurt doet het systeem een semantische zoekopdracht: wat heeft deze patiënt eerder gezegd dat relevant is voor dit moment? Die fragmenten worden als dossier aan de prompt toegevoegd — met een source-tag: `patient_stated` of `ai_inferred`. Anna mag nooit iets verzinnen.

> *(laat Anna's eerste bericht zien, ze refereert aan vorige week)*

> Je ziet het hier: Anna refereert aan iets van vorige week. Dat is een live ChromaDB-resultaat, niet hardcoded.

> De derde laag is de volledige **gesprekshistorie** uit PostgreSQL — alle berichten van deze sessie zitten in context.

---

### Scene 4 — Escalatieclassificatie op de achtergrond (~35 sec)
*Scherm: chat-scherm, patiënt stuurt een zorgwekkend bericht, daarna escalaties-pagina*

> Na elk bericht van de patiënt draait er op de achtergrond een tweede, lichter model — apart geconfigureerd als escalatiemodel. Op dit moment is dat DeepSeek-V4-Flash via Portkey. Dit model doet één ding: triage. Het beoordeelt of het bericht een escalatiesignaal bevat.

> *(switch naar escalaties-pagina)*

> Als de triage positief is, schrijft het systeem automatisch een escalatieregel naar de database — met reden, urgentieniveau, en sessie-ID. Als Twilio SMS aanstaat, gaat er direct een bericht naar de zorgverlener. Geen handmatige actie.

---

### Scene 5 — Symptoomtrends: apart extractiemodel (~40 sec)
*Scherm: trends-pagina, grafieken, daarna SymptomDetailModal*

> De symptoomtrends worden niet handmatig ingevoerd. Na elke sessie draait er een extractiepipeline — ook met een apart model — dat het volledige gesprek analyseert en gestructureerde symptoomdata teruggeeft: kortademigheid, enkelvoetoedeem, gewicht, medicatietrouw, allemaal als numerieke waarden met een tijdstempel.

> Die data belandt in de `symptom_observations` tabel in PostgreSQL en wordt hier live gevisualiseerd.

> *(klik op een datapunt, SymptomDetailModal opent)*

> Per datapunt zie je de klinische redenering van het model én de exacte citaten uit het gesprek waarop het zijn conclusie baseert — alleen uitspraken van de patiënt, nooit van Anna zelf.

---

### Scene 6 — Instellingen (~50 sec)
*Scherm: instellingen-pagina, scroll langzaam door alle kaarten*

> Het hele systeem is configureerbaar zonder code aan te passen.

> *(Snelkeuze)* Met één klik wissel je tussen een volledige lokale stack op Ollama of een cloud-stack via Portkey — alle modellen worden tegelijk bijgesteld.

> *(Notificaties)* Twilio SMS voor escalaties — toggle aan, telefoonnummer invullen, klaar.

> *(Stem)* TTS-provider: Piper voor snelle offline spraak, of XTTS v2 voor stemkloning op GPU.

> *(Geheugen)* De embedding-provider is ook wisselbaar — van lokaal bge-m3 naar OpenAI text-embedding-3-large. Wisselen migreert automatisch alle opgeslagen herinneringen in ChromaDB.

> *(LLM)* Het gespreksmodel, het samenvattingsmodel en het escalatiemodel zijn elk apart in te stellen — provider én modelnaam. Portkey, Groq, Ollama, OpenRouter, Anthropic — alles werkt.

> *(Stemsamples)* Voor XTTS upload je hier een WAV-bestand, of je neemt direct op via de microfoon.

---

### Scene 7 — Avatar met eigen stem (~35 sec)
*Scherm: chat-scherm met avatar zichtbaar, voice mode aan*

> Tot slot: de avatar. Dit is een 3D-model in Three.js met 72 morph targets op basis van de ARKit viseme-set. Lip sync werkt via Web Audio API FFT-analyse — de frequenties van Anna's stem sturen de mondanimatie aan in realtime.

> De stem die je hoort is mijn eigen stem — opgenomen als stemsample en gekloond via XTTS v2. Anna spreekt letterlijk met mijn stem.

> Spraakherkenning loopt via de Web Speech API in de browser — je kunt gewoon praten, Anna antwoordt gesproken terug.

---

### Scene 8 — Afsluiter (~10 sec)
*Fade naar projectnaam*

> Een volledig lokaal draaiend systeem — van spraak tot vector database tot LLM — instelbaar tot in de details. Anna Remembers.

---

## Opname-tips

| Wat | Hoe |
|---|---|
| Schermopname | OBS of Windows + G, 1920×1080 |
| Volgorde | Film scenes in de volgorde hierboven |
| Voorbereiding | Zorg dat patiënt 2 al 4+ sessies heeft met oplopende klachten — dan zijn trends zichtbaar |
| Settings scene | Scroll langzaam, ~5-6 sec per kaart; begin met Snelkeuze als sterkste punt |
| Montage | DaVinci Resolve (gratis) |
