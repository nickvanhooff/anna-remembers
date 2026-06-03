# Evidence 09 — Privacy & productie-checklist (lokaal deployment-scenario)

**Type:** Compliance-analyse + checklist
**Datum:** 2026-05-18
**Hoort bij:** Stap 48+ in STAPPEN.md
**Scope:** Volledig lokaal deployment — Ollama, self-hosted Langfuse, lokale Postgres en ChromaDB.

---

## Waarom dit document

Anna Remembers verwerkt gezondheidsgegevens van hartfalenpatiënten. Dat zijn bijzondere persoonsgegevens onder Artikel 9 AVG. Dit document beschrijft wat er moet gebeuren voordat het systeem in een echte zorgomgeving gebruikt kan worden — en wat lokaal draaien daarin wel en niet oplost.

---

## Wat lokaal draaien oplost

Alles lokaal draaien haalt een grote hoeveelheid juridische problemen weg:

| Probleem | Effect van lokaal draaien |
|---|---|
| Doorgifte buiten EU (Groq/Anthropic zitten in VS) | Niet meer van toepassing — geen externe AI-aanroepen |
| Verwerkersovereenkomsten met cloud-LLM-providers | Niet nodig |
| Langfuse Cloud ontvangt prompts en responses | Opgelost door self-hosted Langfuse |
| Variabele tokenkosten bij betaalde LLM-providers | Niet van toepassing |
| Vendor lock-in bij model-updates | Modelartefacten staan lokaal |

---

## Twee uitzonderingen — data verlaat altijd de infrastructuur

Ook bij een volledig lokale deployment zijn er twee componenten die data naar buiten sturen:

**Web Speech API (STT)**
Spraakherkenning werkt via de browser-ingebouwde Web Speech API. Die stuurt audio naar de cloud van Google of Microsoft voor verwerking. Dat betekent dat patiëntgesprekken via spraak altijd de eigen infrastructuur verlaten, ook als de rest lokaal draait. Dit is bewust gedocumenteerd als bekende beperking — Whisper (lokale STT) staat als lage prioriteit open op issue #47.

**Twilio SMS (escalaties)**
Bij een escalatie verstuurt het systeem de escalatiereden via Twilio SMS naar de zorgverlener. Die reden bevat context uit het patiëntgesprek. Twilio is een Amerikaanse cloud-service — bij gebruik op een gratis proefaccount gelden bovendien beperkingen op berichtlengte en ontvangnummers. Voor productie betekent dit: een betaald account én een verwerkersovereenkomst met Twilio.

---

## Wat lokaal draaien niet oplost

Lokaal draaien is niet voldoende voor productiegebruik. De volgende zaken blijven verplicht:

### Moet opgelost worden vóór productie

| # | Probleem | Nu | Wat nodig is |
|---|---|---|---|
| P1 | Authenticatie — iedereen kan `/patients` openen | Geen auth (bewust buiten scope) | SSO + rollen per gebruiker |
| P2 | Audit log — wie heeft welke data bekeken? | Niet geïmplementeerd | Per-gebruiker actielog |
| P3 | Recht op inzage (Art. 15 AVG) | Niet geïmplementeerd | Export van alle data over een patiënt |
| P4 | Recht op verwijdering (Art. 17 AVG) | DELETE haalt ChromaDB-memories niet weg | Cascade-delete over Postgres + ChromaDB + Langfuse |
| P5 | Recht op rectificatie (Art. 16 AVG) | Geen UI om medical_summary te corrigeren | Bewerk-UI voor zorgverlener |
| P6 | Rechtsgrondslag vastleggen (Art. 6 + 9) | Geen toestemmingsbeheer | Toestemming-vlag per patiënt + intrekkingsmechanisme |
| P7 | Encryptie at rest | Postgres + ChromaDB volumes ongecodeerd | Disk encryption of TDE |
| P8 | Ollama endpoint beveiligen | Ollama luistert op alle interfaces | Beperken tot intern Docker-netwerk |
| P9 | Backup + recovery | Geen backup-strategie | Geëncrypteerde backups met getest restore-pad |

### Aanvullende verplichtingen die altijd gelden

| # | Onderwerp | Toelichting |
|---|---|---|
| Z1 | DPIA verplicht (Art. 35 AVG) | Bijzondere persoonsgegevens + geautomatiseerde besluitvorming = DPIA, ongeacht lokaal/cloud |
| Z2 | EU AI Act — high-risk | Medische triage valt onder Annex III (van kracht aug 2026): risicobeheer, technische documentatie, menselijke supervisie |
| Z3 | Medical Device Regulation | Software die medische beslissingen ondersteunt is mogelijk een klasse IIa medisch hulpmiddel |
| Z4 | Vier-ogen-principe op escalaties | Layer 1 escaleert nu automatisch — in productie hoort er een menselijke check tussen |
| Z5 | Pseudonymisatie | Naam + geboortedatum staan naast patient_id in dezelfde tabel |
| Z6 | Bewaartermijnen | Geen automatische verwijdering; WGBO eist 20 jaar voor medische dossiers |
| Z7 | Hallucinatie-risico | Source-tagging vermindert het risico maar elimineert het niet |
| Z8 | Beroepsaansprakelijkheid | Bij een gemiste escalatie: wie is verantwoordelijk? Vereist contractuele afspraken |

---

## Wat het systeem nu al goed doet

Niet alleen benoemen wat ontbreekt — dit zijn keuzes die in productie behouden kunnen blijven:

| Aanwezig | Waarom relevant |
|---|---|
| Source-tagging (`patient_stated` vs `ai_inferred`) | Privacy by design — Anna mag nooit iets verzinnen |
| Provider-abstractie met Ollama-fallback | Volledig lokale deployment is triviaal |
| Layer 0 deterministisch (keywords) | Kritieke escalaties hangen niet af van een AI-model |
| Langfuse-tracing per beslissing | Auditeerbaarheid van AI-beslissingen — vereist door EU AI Act |
| Compact JSON medical_summary | Dataminimalisatie — minder data per prompt |

---

## Conclusie

Met alles lokaal draaiend vervalt het grootste juridische blok: cross-border datatransfer en cloud-verwerkersovereenkomsten. Twee uitzonderingen blijven: Web Speech API (Google cloud STT) en Twilio SMS (Amerikaanse cloud). De rest — DPIA, authenticatie, rechten van betrokkenen, EU AI Act — blijft verplicht en is serieus werk. Het pad naar productie is haalbaar voor een zorginstelling die er aan wil committeren, maar dit project is bewust een portfolio-demonstratie, geen productiesysteem.

---

## Bronnen

**(1)** Autoriteit Persoonsgegevens — *DPIA-verplichting bij medische data*.
https://autoriteitpersoonsgegevens.nl/themas/basis-avg/data-protection-impact-assessment-dpia

**(2)** European Commission — *Regulation (EU) 2024/1689 (AI Act), Annex III*.
https://artificialintelligenceact.eu/annex/3/

**(3)** Medical Device Regulation (EU) 2017/745, Art. 2(1) + Annex VIII Rule 11.
https://eur-lex.europa.eu/eli/reg/2017/745

**(4)** NEN 7510 — *Informatiebeveiliging in de zorg*.

**(5)** UAVG — *Uitvoeringswet Algemene Verordening Gegevensbescherming*, Art. 30.
