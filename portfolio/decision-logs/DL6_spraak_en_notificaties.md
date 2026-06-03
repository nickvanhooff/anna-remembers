# Decision Log — Anna Remembers

**Naam:** Nick van Hooff  
**Klas:** MA-AAI1  
**Rol:** GenAI Engineer

---

## Entry #6: Hoe communiceert Anna via spraak met de patiënt, en hoe bereikt een escalatie de zorgverlener?

### Onderzoeksvraag

> Welke keuzes maak ik voor TTS, STT en escalatienotificaties, zodat een patiënt zonder technische kennis een gesprek kan voeren en een zorgverlener automatisch gewaarschuwd wordt?

**Deelvragen:**
- Welke TTS-provider gebruik ik, en wanneer?
- Waarom Web Speech API en niet lokale spraakherkenning?
- Hoe bereikt een escalatie de zorgverlener buiten de app?

---

### 1. Context

**Project:** Anna Remembers — AI-gezondheidsassistent voor hartfalenpatiënten

**Waarom dit nu belangrijk is:**  
Het systeem heeft drie communicatiekanalen naar mensen buiten het scherm: Anna spreekt naar de patiënt (TTS — Text-to-Speech, tekst omzetten naar gesproken audio), de patiënt spreekt terug (STT — Speech-to-Text, gesproken audio omzetten naar tekst), en bij een escalatie krijgt de zorgverlener een bericht. Alle drie moeten werken zonder technische kennis van de gebruiker.

Een usability test met een zorgmedewerker (moeder van de student, werkzaam in een verzorgingstehuis) heeft de keuzes gevalideerd en een aantal beperkingen zichtbaar gemaakt.

**Aangetoonde leeruitkomsten:**

- [x] LO1: Analyseren — opties vergeleken voor TTS, STT en notificaties
- [ ] LO2: Adviseren
- [x] LO3: Ontwerpen — instelbare TTS via settings page, STT via browser
- [x] LO4: Realiseren — Piper, XTTS, Web Speech API en Twilio SMS geïmplementeerd
- [ ] LO5: Beheren & Controleren
- [ ] LO6: Professioneel Leiderschap
- [x] LO7: Professionele Standaard — usability test uitgevoerd met echte gebruiker uit de doelgroep

---

### 2. Succescriteria

| Criterium | Doel | Redenering achter de norm |
|---|---|---|
| **TTS werkt zonder crash** | Audio wordt altijd afgespeeld, ook bij lange berichten | Een fout die stilte oplevert terwijl de patiënt wacht is onacceptabel — het systeem moet altijd iets terugzeggen |
| **STT werkt zonder installatie** | Patiënt kan spreken via browser, geen extra software | De doelgroep (ouderen, hartfalenpatiënten) installeert geen extra tools |
| **Escalatie bereikt zorgverlener buiten de app** | SMS aankomt op het ingestelde nummer | Een escalatie die alleen in het dashboard zichtbaar is heeft geen waarde — de zorgverlener kijkt daar niet continu |
| **Instelbaar per gebruiker** | TTS-provider wisselbaar via de settings page | XTTS klinkt beter maar is trager; Piper is sneller maar klinkt minder natuurlijk. Verschillende situaties vragen om verschillende keuzes |

---

### 3. Wat ik heb besloten

**TTS: Piper als standaard, XTTS als opt-in**  
Piper TTS (snelle, offline spraaksynthese) is de standaard. XTTS v2 (Coqui — GPU-gebaseerde stemkloning, klinkt natuurlijker) is instelbaar via de settings page. De keuze zit in de database als `tts_provider` setting.

**STT: Web Speech API**  
De browser-ingebouwde spraakherkenning, geen extra installatie nodig. Whisper (lokale spraakherkenning van OpenAI) staat open als Issue #47 maar heeft lage prioriteit.

**Notificaties: Twilio SMS**  
Bij escalatie stuurt het systeem automatisch een SMS naar het ingestelde nummer via de Twilio API (een cloud-service voor het versturen van berichten).

De volledige spraakpipeline (STT → chat → TTS → avatar) is uitgewerkt in een architectuuroverzicht: [VOICE_ARCHITECTURE.md](../evidence/VOICE_ARCHITECTURE.md) @VOICE_ARCHITECTURE.

---

### 4. Hoe ik dit heb onderzocht (DOT-framework)

**Eigen ervaring (Field):**  
Usability test uitgevoerd met een zorgmedewerker. Profiel aangemaakt, gesprek gevoerd via STT en TTS, escalaties gegenereerd, SMS-notificatie geprobeerd. Bevindingen gedocumenteerd.

→ [evidence_12_usability_test.md](../evidence/evidence_12_usability_test.md) @evidence_12_usability_test

**Beschikbaar product analyseren (Library):**  
Piper en XTTS documentatie vergeleken op VRAM-gebruik en betrouwbaarheid. Twilio-documentatie gelezen voor SMS-limieten op gratis account.

---

### 5. Wat ik heb gevonden

#### TTS

| Optie | Snelheid | Geluidskwaliteit | VRAM bij lang bericht | Vereist GPU |
|---|---|---|---|---|
| **Piper (standaard)** | Snel | Robotisch maar verstaanbaar | Geen probleem | Nee |
| **XTTS v2 (opt-in)** | Traag (~20s cold-start) | Natuurlijk, stemkloning | Fout bij lang bericht | Ja |

Twee bugs gevonden bij XTTS tijdens de usability test:
1. XTTS wordt geladen zodra de gebruiker op de spraakknop klikt — niet pas bij het versturen. Bij een lang bericht duurt dat ~20 seconden wachttijd vóórdat de gebruiker iets hoort.
2. Lange berichten geven een VRAM-fout (het bericht past niet in het GPU-geheugen). Piper heeft dit probleem niet omdat het tekst in kleinere stukken verwerkt.

#### STT

| Optie | Installatie | Kwaliteit bij snel spreken | Offline |
|---|---|---|---|
| **Web Speech API (gekozen)** | Geen | Mist woorden bij snel spreken | Nee — vereist internet |
| Whisper lokaal | Docker container | Beter | Ja |

Bevinding uit de usability test: mensen in de zorg spreken soms snel als ze onrustig zijn. De Web Speech API volgt dit niet altijd volledig, maar pikt genoeg context op om het gesprek zinvol voort te zetten. Citaat testpersoon: *"Werkt goed als je geduld hebt — wat mensen die ermee zullen praten niet hebben."*

De belangrijkste beperking van Web Speech API is dat het een internetverbinding vereist — de spraakherkenning draait in de cloud van de browser (Google/Microsoft). Dat betekent dat het systeem niet volledig lokaal kan draaien zolang STT in gebruik is. Dit is de enige onderdeel van de stack dat niet offline werkt. Whisper (Issue #47) lost dit op maar heeft lage prioriteit voor de huidige demo.

#### Twilio SMS

Twee beperkingen gevonden op het gratis proefaccount:

| Fout | Omschrijving | Oplossing |
|---|---|---|
| 21608 | Ontvangnummer niet geverifieerd — gratis Twilio-account vereist handmatige verificatie van elk nummer | Nummer toevoegen in Twilio dashboard, of upgraden naar betaald account |
| 30044 | Berichtlengte overschreden — gratis tier heeft een maximale berichtlengte | Bericht inkorten, of upgraden naar betaald account |

---

### 6. Voldoet dit aan mijn criteria?

| Criterium | Doel | Gehaald? | Bewijs |
|---|---|---|---|
| **TTS werkt zonder crash** | Altijd audio | ⚠️ Piper altijd ✅; XTTS geeft VRAM-fout bij lange berichten | [evidence_12](../evidence/evidence_12_usability_test.md) @evidence_12_usability_test |
| **STT werkt zonder installatie** | Spreken via browser | ✅ Web Speech API werkt direct, geen installatie | [evidence_12](../evidence/evidence_12_usability_test.md) @evidence_12_usability_test |
| **Escalatie bereikt zorgverlener** | SMS aankomt | ⚠️ Werkt op geverifieerde nummers; gratis tier heeft beperkingen | [evidence_12 — Twilio foutlog](../evidence/evidence_12_usability_test.md) @evidence_12_usability_test |
| **Instelbaar per gebruiker** | TTS-provider wisselbaar | ✅ Settings page met Piper/XTTS keuze, opgeslagen in database | Commit `357ebe2` |

---

### 7. Aannames

- Piper is goed genoeg voor de demo. In productie met een betaald cloud-TTS (bijv. ElevenLabs of Google TTS) zou de geluidskwaliteit beter zijn zonder VRAM-probleem.
- Web Speech API werkt voldoende voor de demo maar vereist internet — het systeem draait daardoor niet volledig lokaal. Dit is de enige component in de stack die geen offline variant heeft. Whisper lost dit op maar staat bewust op lage prioriteit (Issue #47).
- De Twilio-beperkingen (geverifieerd nummer, berichtlengte) gelden alleen voor het gratis proefaccount. Een betaald account lost beide op.

---

### 8. Bronnen

Geen externe bronnen geraadpleegd — bevindingen komen uit de usability test en eigen implementatie.

---

### 9. Implementatiebewijs

| Wat | Bewijs |
|---|---|
| Piper + XTTS geïmplementeerd, instelbaar via settings | Stap 44 in STAPPEN.md |
| Web Speech API + avatar + lip sync | Stap 45 in STAPPEN.md |
| Twilio SMS bij escalatie | Stap 65–66 in STAPPEN.md |
| Usability test uitgevoerd | [evidence_12_usability_test.md](../evidence/evidence_12_usability_test.md) @evidence_12_usability_test |
| Architectuuroverzicht spraakpipeline | [VOICE_ARCHITECTURE.md](../evidence/VOICE_ARCHITECTURE.md) @VOICE_ARCHITECTURE |

---

### 10. Wat dit oplevert

De spraakinterface werkt voor een niet-technische gebruiker. De bekende beperkingen (XTTS VRAM, STT bij snel spreken, Twilio gratis tier) zijn gedocumenteerd en verdedigbaar — ze zijn geen bugs die de demo onmogelijk maken, maar limieten van de gekozen infrastructuur op projectschaal.
