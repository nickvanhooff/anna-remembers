# Evidence 09 — Privacy & productie-checklist (lokaal deployment-scenario)

**Type:** Compliance-analyse + checklist
**Datum:** 2026-05-18
**Hoort bij:** mogelijke DL5 (AVG/AI Act-reflectie), Stap 48+ in STAPPEN.md
**Scope:** Volledig lokaal deployment — alle LLM's via Ollama, self-hosted Langfuse, lokale Postgres en ChromaDB. Geen cloudverbindingen naar Groq/Anthropic/OpenRouter of Langfuse Cloud.

---

## Doel van dit document

Anna Remembers verwerkt **gezondheidsgegevens** — bijzondere persoonsgegevens onder Artikel 9 AVG. Dit evidence analyseert wat er minimaal moet gebeuren voordat het systeem in een werkveldscenario gebruikt mag worden, *onder de aanname dat alles lokaal draait*. Lokaal draaien neemt een grote hoeveelheid juridische complexiteit weg, maar **lost niet alles op**. Dit document maakt expliciet wat wel en niet wegvalt.

---

## Wat lokaal draaien wél oplost

| Probleem zonder lokaal | Effect van volledig lokaal |
|---|---|
| **Doorgifte buiten EU** (Art. 44-46 AVG) — Groq/Anthropic zitten in US | ✅ Geen doorgifte. Geen SCC's of DPF-certificering nodig. |
| **Verwerkersovereenkomsten** met elke cloud-LLM-provider | ✅ Niet nodig — geen externe verwerkers in de AI-pipeline. |
| **Langfuse Cloud krijgt prompts + responses** (medische data in derde-systeem) | ✅ Self-hosted Langfuse = data blijft binnen eigen infrastructuur. Wel DPA met de hosting-partij van de Langfuse-instantie nodig. |
| **Quota-uitputting + tokenkosten bij betaalde LLM-providers** | ✅ Geen variabele kosten. Capaciteit beperkt door eigen hardware. |
| **Vendor lock-in / provider beëindigt model** | ✅ Modelartefacten lokaal beschikbaar; reproduceerbare omgeving. |
| **Tracing-data in third-party hands** voor audit-doeleinden | ✅ Volledige eigendom van auditlogs. |

**Resultaat:** de meeste *cross-border data transfer* en *third-party processor* problemen zijn van tafel. Dit is een aanzienlijke vereenvoudiging — typisch goed voor 60-70% van een AVG-checklist in vergelijkbare AI-projecten.

---

## Wat lokaal draaien NIET oplost

Lokaal draaien is een **noodzakelijke maar niet voldoende** voorwaarde voor productiegebruik. De volgende verplichtingen blijven hoe dan ook bestaan:

### Blokkerende issues — must-fix vóór elk productiegebruik

| # | Issue | Status nu | Vereist voor productie |
|---|---|---|---|
| P1 | **Authenticatie** — iedereen kan `/patients` openen | ❌ Geen auth (bewust buiten scope) | SSO + RBAC (zorgverlener / verpleegkundige / admin rollen) |
| P2 | **Audit log per gebruiker** — wie heeft welke patiëntdata bekeken? | ❌ Geen | Per-user actielog gekoppeld aan SSO-identiteit, onveranderbaar |
| P3 | **Recht op inzage** (Art. 15 AVG) | ❌ Niet geïmplementeerd | API-endpoint dat alle data over een patiënt exporteert (Postgres + ChromaDB + Langfuse) |
| P4 | **Recht op verwijdering** (Art. 17) | ❌ DELETE-patient haalt ChromaDB-memories niet weg | Cascade-delete over alle stores incl. Langfuse-traces purge |
| P5 | **Recht op rectificatie** (Art. 16) | ❌ Geen UI om `medical_summary` te corrigeren | Bewerken-UI voor zorgverlener + audit van wie wijzigde |
| P6 | **Rechtsgrondslag vastleggen** (Art. 6 + 9) | ❌ Geen toestemmingsbeheer | Toestemming-vlag per patiënt in DB + datum + intrekkingsmechanisme |
| P7 | **Encryptie at rest** | ❌ Postgres + ChromaDB volumes ongecodeerd | Disk encryption (LUKS) of TDE op database-niveau |
| P8 | **Beveiliging Ollama endpoint** | ❌ Ollama luistert op alle interfaces in Docker netwerk | Restricted naar intern Docker-netwerk + geen externe expose |
| P9 | **Backup + recovery** | ❌ Geen backup-strategie | Geëncrypteerde backups met getest restore-pad |

### Zware aanvullende eisen — onafhankelijk van lokaal/cloud

| # | Issue | Toelichting |
|---|---|---|
| Z1 | **DPIA verplicht** (Art. 35) | Bijzondere persoonsgegevens + geautomatiseerde besluitvorming + grote schaal = DPIA voor elk werkveldgebruik. Lokaal draaien wijzigt dit niet. |
| Z2 | **EU AI Act — high-risk classificatie** | Medische triage = high-risk onder Annex III (van kracht aug 2026). Vereist: risico-managementsysteem, documentatie van trainingsdata (qwen2.5:3b bij Alibaba — onbekend), accuracy/robustness-monitoring, menselijke supervisie. |
| Z3 | **Medical Device Regulation** | Software die diagnostische/therapeutische beslissingen ondersteunt = potentieel klasse IIa medisch hulpmiddel. CE-markering + technical file + post-market surveillance. |
| Z4 | **Vier-ogen-principe op escalaties** | Layer 1 escalaties gaan nu auto naar de zorgverlener. In productie: menselijke check vóór patiënt-impact-acties (medicatieadvies, doorverwijzing). Layer 0 keywords mogen wel direct doorgestuurd worden naar review. |
| Z5 | **Pseudonymisatie** | Identifying data (`first_name`, `last_name`, `birth_date`) staat naast `patient_id` in dezelfde tabel. Best practice: split in vault-tabel, koppelen via UUID alleen. |
| Z6 | **Bewaartermijnen** | Geen automatische verwijdering. WGBO eist 20 jaar voor medische dossiers; AVG eist proportionaliteit. Beleid + retention-cron-job nodig. |
| Z7 | **Hallucinatie-risico** | Source-tagging (`patient_stated` filter) onderkent het probleem maar elimineert het niet. Acceptance-tests met goldenset + monitoring op false negatives nodig. |
| Z8 | **Beroepsaansprakelijkheid** | Wie is verantwoordelijk bij gemiste escalatie? Vereist: contractuele afspraken met de gebruikende zorginstelling + medisch verantwoordelijke (BIG-geregistreerd). |

---

## Volledige checklist — gegroepeerd op haalbaarheid

### Tier 1 — Strikt noodzakelijk voor *enige* productie-pilot (must-fix)

- [ ] **Auth + RBAC** (SSO via bv. Keycloak, rollen: arts/verpleegkundige/admin)
- [ ] **Audit log** per gebruikersactie (welke data bekeken, gewijzigd, geëxporteerd)
- [ ] **DPIA uitgevoerd en goedgekeurd** door FG (Functionaris Gegevensbescherming) of geconsulteerde DPO
- [ ] **Toestemmingsbeheer** — vlag + datum + intrekkingsmechanisme per patiënt
- [ ] **Verwerkersregister** opgesteld conform Art. 30 AVG
- [ ] **Rechten van betrokkenen** geïmplementeerd: inzage, rectificatie, verwijdering (cascade naar Chroma + Langfuse), portabiliteit
- [ ] **Encryptie at rest** voor Postgres + ChromaDB volumes
- [ ] **Beveiligde deployment** — geen Ollama/ChromaDB op publieke interfaces; reverse proxy met TLS
- [ ] **Backup + restore getest** (3-2-1 regel, geëncrypteerd)
- [ ] **Incidentprotocol** voor datalekken (72-uurs meldplicht bij AP)

### Tier 2 — Vereist voor productie in echte zorgcontext (should-do)

- [ ] **EU AI Act compliance** — risico-managementsysteem, technical documentation per Annex IV
- [ ] **Menselijke supervisie ingebouwd** — Layer 1 escalaties via review-queue i.p.v. direct naar Slack
- [ ] **MDR-traject gestart** indien gebruikt voor medische besluitvorming (klasse IIa)
- [ ] **Pseudonymisatie** — vault-tabel met identifiers, hoofdtabellen met UUIDs
- [ ] **Bewaartermijnen** geconfigureerd + retention-cron-job
- [ ] **Acceptance-test goldenset** voor escalatiedetectie met meetbare false-positive/negative rates
- [ ] **Modelversie pinning** — qwen2.5:3b exact, bge-m3 exact, met fallback-procedure bij update
- [ ] **Health checks** + monitoring (uptime, latency, escalation rates)
- [ ] **Disaster recovery plan** met RTO/RPO afspraken

### Tier 3 — Volwassenheid bij schaal (nice-to-have)

- [ ] **Modelmonitoring** — drift-detectie op classificatie-output
- [ ] **A/B-test infrastructuur** voor prompt/modelwijzigingen
- [ ] **Fine-tuning op anonieme NL medische data** (vereist apart toestemmingstraject)
- [ ] **Externe penetration test** voor de hele stack
- [ ] **ISO 27001 / NEN 7510** certificering (Nederlandse zorgstandaard)
- [ ] **Onafhankelijke ethics review** voor AI-supportbeslissingen

---

## Wat het project nu wél goed doet

Niet alleen het ontbrekende benoemen — dit zijn beslissingen die in productie behouden kunnen blijven:

| ✅ Nu aanwezig | Waarom dit helpt voor compliance |
|---|---|
| **Source-tagging** (`patient_stated` vs `ai_inferred`) | Hallucinatie-mitigatie ingebouwd vanaf dag 1 — privacy by design |
| **Provider-abstractie** met Ollama-fallback | Maakt volledige lokaal-only deployment triviaal |
| **Layered escalation** (Layer 0 deterministisch + Layer 1 lokaal) | Layer 0 bewijst dat kritieke gevallen niet afhangen van een AI-model — explainable per definitie |
| **Langfuse-tracing op elk niveau** | Volledige auditeerbaarheid van AI-beslissingen — EU AI Act-eis voor high-risk |
| **MCP-server als losse architectuur** | RAG-laag is geïsoleerd en vervangbaar; rechten van betrokkenen kunnen op één plek geïmplementeerd worden |
| **Compact JSON medical_summary** (i.p.v. raw history) | Dataminimalisatie — minder data per prompt = kleinere blast radius bij lek |
| **Bewust gescheiden RAG vs samenvatting** | Twee verschillende grondslagen mogelijk (patient_stated = directe toestemming; samenvatting = afgeleid) |

---

## Conclusie

Met **alles lokaal** vervalt het grootste juridische blok (cross-border transfer + cloud-DPA's). Dat brengt het project van *"juridisch niet toegestaan"* naar *"juridisch te realiseren, mits..."*. Het pad naar productie blijft serieus — DPIA, auth, rechten van betrokkenen, EU AI Act, mogelijk MDR — maar wordt **wel haalbaar** binnen het bereik van een zorginstelling die hieraan wil committeren.

**Voor portfolio-doel:** dit document toont dat ik niet alleen kan bouwen maar ook reflecteer op de juridische context. Het demonstreert kennis van AVG-specifieke kennisgebieden (Art. 9 bijzondere data, Art. 35 DPIA, doorgifte buiten EU), AI-specifieke regulering (EU AI Act high-risk), zorg-specifieke regelgeving (WGBO, NEN 7510, MDR), en concreet welke architectuurkeuzes deze compliance al wel of nog niet ondersteunen.

**Wat ik bewust niet claim:** dat het project nu klaar is voor productie. Het is een student-portfolio dat *gerichte* AI-engineering-vaardigheden bewijst, niet een productiesysteem. Die scheiding is helder gedocumenteerd en is zelf onderdeel van professioneel handelen.

---

## Bronnen

**(1)** Autoriteit Persoonsgegevens — *DPIA-verplichting bij medische data*.
[https://autoriteitpersoonsgegevens.nl/themas/basis-avg/data-protection-impact-assessment-dpia](https://autoriteitpersoonsgegevens.nl/themas/basis-avg/data-protection-impact-assessment-dpia)
Geraadpleegd 2026-05-18. Onderbouwt verplichting van DPIA voor verwerking van bijzondere persoonsgegevens op schaal.

**(2)** European Commission — *Regulation (EU) 2024/1689 (AI Act), Annex III*.
[https://artificialintelligenceact.eu/annex/3/](https://artificialintelligenceact.eu/annex/3/)
Geraadpleegd 2026-05-18. Classificatie van medische AI-systemen als high-risk; verplichtingen Hoofdstuk III.

**(3)** Medical Device Regulation (EU) 2017/745, Art. 2(1) + Annex VIII Rule 11.
[https://eur-lex.europa.eu/eli/reg/2017/745](https://eur-lex.europa.eu/eli/reg/2017/745)
Software die medische beslissingen ondersteunt valt onder Klasse IIa.

**(4)** NEN 7510 — *Informatiebeveiliging in de zorg*.
Nederlandse standaard voor informatiebeveiliging in zorginstellingen. Vereist voor zorgcontext-implementaties.

**(5)** UAVG — *Uitvoeringswet Algemene Verordening Gegevensbescherming*, Art. 30.
Implementatie WGBO + AVG voor Nederlandse zorgcontext.
