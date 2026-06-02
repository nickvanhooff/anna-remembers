# Evidence 12 — Usability test: zorgmedewerker gebruikt Anna Remembers

**Type:** Gebruikerstest / Field research
**Datum:** 2026-06-01
**Hoort bij:** DL3 — Frontend architectuur, DL4 — Escalatiedetectie, DL6 — Spraak en notificaties
**DOT-methode:** Field — Usability testing (echte gebruiker, realistisch scenario)

---

## Context

Testpersoon: moeder van de student, werkzaam in een verzorgingstehuis. Zij heeft dagelijks contact met hartfalenpatiënten en begrijpt de context van het systeem. Geen technische achtergrond — relevante eindgebruiker.

Doel van de test: valideren of het systeem bruikbaar is voor iemand zonder technische kennis, en of de escalatiedetectie correct werkt in een echte interactie.

---

## Opzet

1. Profiel aangemaakt voor een fictieve patiënt
2. Testpersoon heeft zelf een gesprek gevoerd met Anna via de chat-interface
3. TTS (Text-to-Speech — Anna spreekt de responses hardop uit) en STT (Speech-to-Text — testpersoon spreekt in plaats van typt) gebruikt
4. Escalaties automatisch gegenereerd op basis van de gespreksinhoud

---

## Resultaten

### Profiel aanmaken

![Profiel van testpatiënt Esther Diks](../../usability%20test/profiel-esther.png)

### Chat — volledig gesprek

Het volledige gesprek is bewaard als HTML (bekijkbaar in browser) en PDF:

- [Chat Esther Diks — Anna Remembers (HTML)](../../usability%20test/Chat%20Esther%20diks%20%E2%80%94%20Anna%20Remembers.html)
- [Chat Esther Diks — Anna Remembers (PDF)](../../usability%20test/Chat%20%E2%80%94%20Anna%20Remembers.pdf)

### Escalaties gegenereerd

Twee escalatiemeldingen kwamen automatisch binnen en waren correct:

![Escalatiebericht — aandacht vereist](../../usability%20test/escalatie_message_aandacht.png)

![Escalatiebericht — urgent](../../usability%20test/escalatie_message_urgent.png)

---

## Bevindingen

| Bevinding | Oordeel |
|---|---|
| Profiel aanmaken gelukt zonder uitleg | ✅ Intuïtief genoeg |
| Gesprek starten en voeren via STT/TTS | ✅ Werkte zonder technische hulp |
| Escalaties kwamen binnen en klopten inhoudelijk | ✅ Correcte detectie |
| STT mist woorden bij snel spreken | ⚠️ Genoeg context om mee te werken, maar niet volledig |
| Systeem te traag voor dagelijks gebruik | ⚠️ Infrastructuurlimiet — alles draait lokaal op GPU |
| Anna stelt te veel vragen achter elkaar | ⚠️ By design voor medische check-in, maar voelt vervelend |
| XTTS start bij klikken op spraakknop, niet bij versturen | 🐛 Duurt ~20 seconden bij lang bericht vóór de gebruiker kan spreken |
| XTTS geeft VRAM-fout bij lange berichten | 🐛 Bericht past niet in GPU-geheugen; Piper heeft dit probleem niet |
| Twilio SMS niet ontvangen op niet-geverifieerd nummer | 🐛 Gratis Twilio-proefaccount vereist handmatige verificatie van elk nummer |

### Toelichting STT bij snel spreken

Mensen in de zorg spreken soms snel, zeker als ze onrustig zijn — precies de doelgroep van dit systeem. De Web Speech API (browser-native spraakherkenning) volgt dit niet altijd volledig. In de test werd genoeg context opgepikt om het gesprek zinvol voort te zetten, maar losse woorden gingen verloren. Citaat testpersoon: *"Werkt goed als je geduld hebt — wat mensen die ermee zullen praten niet hebben."* De chat-interface (typen) is merkbaar sneller.

### Toelichting XTTS-problemen

Twee aparte problemen gevonden met XTTS v2 (de kwaliteits-TTS met stemkloning):

1. **Vroege activering:** XTTS wordt geactiveerd zodra de gebruiker op de spraakknop klikt, in plaats van pas na het versturen van een bericht. Bij lange berichten duurt het laden van XTTS ~20 seconden — de gebruiker zit te wachten terwijl er nog niets gezegd is. Piper (de snelle TTS) heeft dit probleem niet omdat het stateless is.

2. **VRAM-fout bij lange berichten:** XTTS laadt het volledige audiofragment in één keer in GPU-geheugen (VRAM — Video RAM op de grafische kaart). Een lang bericht overschrijdt het beschikbare VRAM op de RTX 4050, waardoor XTTS een fout geeft en geen audio produceert. Piper verwerkt tekst in chunks (kleinere stukken) en heeft dit probleem niet.

Beide problemen zijn bekend beperkingen van de huidige XTTS-integratie en staan als verbeterpunten open.

### Twilio SMS — geverifieerd nummer vereist

Bij de test is geprobeerd het telefoonnummer van de testpersoon in te stellen als SMS-ontvanger voor escalaties. De SMS kwam niet aan. In het Twilio-dashboard was de oorzaak zichtbaar in de foutlogs:

![Twilio foutlog — niet-geverifieerd nummer en berichtlengte](images/twillio_error_number.png)

Twee fouten zichtbaar:
- **Fout 21608** (2026-05-26): *"The 'to' phone number provided is not yet verified for this account"* — het gratis Twilio-proefaccount staat alleen SMS toe naar nummers die handmatig geverifieerd zijn in het Twilio-dashboard. Elk nieuw nummer moet eerst toegevoegd worden aan de verified callers-lijst.
- **Fout 30044** (2026-05-23): *"Trial Message Length Exceeded"* — het gratis account heeft een maximale berichtlengte. Een escalatiebericht met volledige redenering overschreed die limiet.

Oplossing voor productie: betaald Twilio-account ophogen naar een regulier account — dan vervallen beide beperkingen.

---

## Conclusie

De kernfunctionaliteit werkt voor een niet-technische gebruiker: profiel aanmaken, gesprek voeren via spraak, escalaties automatisch en correct gegenereerd. De gevonden problemen zijn infrastructuurlimieten (lokale GPU, Twilio gratis tier) en twee XTTS-bugs die open staan als verbeterpunten. De chat-interface werkt sneller en betrouwbaarder dan de spraakinterface op de huidige hardware.
