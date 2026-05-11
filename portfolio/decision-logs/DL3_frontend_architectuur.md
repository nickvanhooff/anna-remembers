# Decision Log — Anna Remembers

**Naam:** Nick van Hooff  
**Klas:** MA-AAI1  
**Rol:** GenAI Engineer

---

## Entry #3: Welke frontend architectuur gebruik ik voor het Anna Remembers dashboard?

### Onderzoeksvraag

> Hoe bouw ik een frontend voor het Anna Remembers dashboard die visueel consistent is, snel te koppelen is aan de FastAPI backend, en aansluit bij wat er in de praktijk wordt gebruikt?

**Deelvragen:**
- Welk framework gebruik ik voor routing en projectstructuur?
- Welke UI-library gebruik ik voor componenten en styling?
- Hoe zorg ik voor een consistent design system zonder designkennis?
- Hoe koppel ik de frontend aan de backend zonder dat de backend al af hoeft te zijn?

---

### 1. Context

**Project:** Anna Remembers — AI-gezondheidsassistent voor hartfalenpatiënten

**Waarom dit nu belangrijk is:**  
Issue #4 vereist vier dashboard-schermen: patiëntbeheer, chat met Anna, symptoomtrends en escalatiebeheer. Framework en UI-library moeten vastliggen vóórdat de eerste component gebouwd wordt — achteraf wisselen is te kostbaar. Ik wilde ook offline kunnen bouwen op mock data, zonder te wachten op een werkende backend.

**Aangetoonde leeruitkomsten:**

- [ ] LO1: Analyseren
- [x] LO2: Adviseren — keuze onderbouwd met vergelijkingstabellen en eigen overwegingen
- [x] LO3: Ontwerpen — componentstructuur en API wrapper patroon ontworpen
- [x] LO4: Realiseren — vier schermen gebouwd, patiëntbeheer live gekoppeld aan FastAPI
- [ ] LO5: Beheren & Controleren
- [x] LO6: Professionele Standaard — DOT-methode toegepast, industry-standaard patterns gebruikt
- [ ] LO7: Persoonlijk Leiderschap

---

### 2. Succescriteria

| Criterium | Doel |
|---|---|
| **Vier werkende schermen** | Patiëntbeheer, chat, trends, escalaties volledig navigeerbaar |
| **Koppelbaar aan backend** | Mock data vervangbaar door echte API-calls zonder structuurwijziging |
| **Consistent design** | Alle schermen gebruiken dezelfde component- en kleurtaal |
| **Onderhoudbaar** | Nieuw scherm toevoegen = één map aanmaken + één thin `page.tsx` |

---

### 3. Wat ik heb besloten

**Framework:** Next.js 15 met App Router  
**UI-library:** shadcn/ui (`radix-nova` preset, Lucide icons)  
**Design tokens:** CSS variabelen in `globals.css`  
**Componentstructuur:** feature-based (`components/patients/`, `components/chat/`, etc.)  
**API-koppeling:** mock data + API wrapper patroon (`lib/api.ts`)

#### Next.js 15 boven Vite SPA

SSR is bewust buiten scope — het dashboard is een intern tool voor zorgverleners. Toch heb ik Next.js boven Vite gekozen om twee praktische redenen: file-based routing werkt direct via mappen zonder extra setup, en `npx shadcn@latest init` detecteert Next.js automatisch en configureert alles correct. Bij Vite zijn handmatige aanpassingen nodig. CRA (Create React App) — de officiële React starter van Meta — is afgevallen omdat het niet meer actief wordt onderhouden [1].

De App Router brengt `"use client"` verplichtingen mee voor componenten met state of event handlers. Dat kostte gewenning, maar is de richting die Next.js aanbeveelt voor nieuwe projecten [2].

→ Vergelijkingstabel: [evidence_03_framework_vergelijking.md](../evidence/evidence_03_framework_vergelijking.md)

#### shadcn/ui boven MUI en Ant Design

De primaire reden voor shadcn/ui is dat het in de Nederlandse werkomgeving breed wordt gebruikt — met name in startups en scale-ups [2]. Als engineer is het waardevol om te werken met een library die je in een stageplek of eerste baan ook tegenkomt. MUI is meer enterprise en minder gangbaar in moderne Next.js-projecten.

Daarnaast heb ik al kennis van Tailwind CSS, en shadcn/ui is volledig Tailwind-based. Dat betekende geen extra leercurve op het styling-vlak. Ik heb ook al eerder met shadcn/ui gewerkt in een groepsproject, waardoor ik het principe van componenten installeren als broncode al begreep. Die voorkennis maakte de keuze makkelijker te rechtvaardigen.

Shadcn/ui is ook makkelijk aan te passen naar eigen wensen — componenten leven in `components/ui/` als gewone TypeScript-bestanden. Kleuren aanpassen, een extra prop toevoegen of de layout wijzigen: je opent het bestand en past het aan. Geen npm-overrides, geen theming-abstracties.

Technisch viel MUI af omdat de theming conflicteert met Tailwind. Je hebt `createTheme()` nodig bovenop de CSS variabelen die Tailwind al gebruikt, wat leidt tot een mix van twee styling-systemen. Bij shadcn is er één styling-laag: Tailwind + CSS variabelen.

Voor de vier zorginhoudelijke statussen (`success`, `warning`, `urgent`, `info`) heb ik een losse `StatusBadge` component gebouwd met directe CSS variabelen. De standaard shadcn Badge-varianten dekken deze niet.

→ Vergelijkingstabel: [evidence_04_ui_library_en_design_system.md](../evidence/evidence_04_ui_library_en_design_system.md)

#### Design system via Claude Design

Ik ben geen designer — kleuren, spacing en typografie van scratch bepalen kost te veel tijd en levert geen meerwaarde als engineer. Ik heb Claude Design (claude.ai/design) gebruikt om een startpunt te genereren voor de design tokens.

Werkwijze: via Claude Code heb ik de geïnstalleerde shadcn/ui componenten en hun structuur meegestuurd aan Claude Design, zodat het design rekening kon houden met de bestaande componentbibliotheek. Vervolgens heb ik in Claude Design een beschrijving gegeven van het project (healthcare dashboard, zorgverleners als gebruiker) en gevraagd om een kleur- en typografievoorstel dat past bij de shadcn-componenten die ik al had. De output was een HTML/CSS prototype met concrete token-waarden. Die heb ik handmatig vertaald naar CSS variabelen op `:root` in `globals.css` — niet blind overgenomen, maar als onderbouwd startpunt gebruikt.

Dit maakte het mogelijk om snel een visueel consistente basis te hebben, zodat ik me kon focussen op de technische implementatie.

#### Mock data + API wrapper patroon

Alle fetch-logica zit in `lib/api.ts`. Elk scherm werkt offline op mock data; een endpoint live koppelen = één TODO-comment vervangen door een echte `fetch()` aanroep. Dit heeft me in staat gesteld alle vier schermen te bouwen en testen voordat de backend volledig af was.

#### Feature-based componentstructuur

Elke feature heeft een eigen map onder `components/`. De `page.tsx` files zijn thin wrappers — alleen een import en een `export default`. Dit is de gangbare aanpak voor Next.js App Router projecten [2] en maakt het makkelijk om per scherm te werken zonder andere schermen te raken.

---

### 4. Hoe ik dit heb onderzocht (DOT-framework)

**Beschikbaar product analyseren (Library):**  
Documentatie van Next.js, shadcn/ui, MUI en Ant Design vergeleken. State of JS 2024 geraadpleegd voor populariteitstrends in de Nederlandse werkomgeving. → evidence_03, evidence_04

**Prototypen (Workshop):**  
Direct een werkend skelet gebouwd met `create-next-app` en `npx shadcn@latest init`. Navigeerbaar prototype met vier schermen was binnen 30 minuten beschikbaar.

---

### 5. Wat ik heb gevonden

| Keuze | Optie A (gekozen) | Optie B | Reden voorkeur A |
|---|---|---|---|
| Framework | Next.js 15 | Vite + React SPA | File-based routing, betere shadcn-integratie |
| UI-library | shadcn/ui | MUI | Broncode eigenaarschap, geen theming-conflict met Tailwind |
| API-koppeling | Mock data + API wrapper | Directe fetch per component | Schermen bouwen onafhankelijk van backend-status |
| Componentstructuur | Feature-based | Per type (pages/, components/) | Makkelijker per scherm werken |

---

### 6. Conclusie per deelvraag

| Deelvraag | Antwoord |
|---|---|
| **Welk framework?** | Next.js 15 met App Router — file-based routing werkt direct, shadcn/ui integreert naadloos via de officiële Next.js template |
| **Welke UI-library?** | shadcn/ui — gangbaar in het werkveld, Tailwind-based (voorkennis aanwezig), eerder mee gewerkt in groepsproject, volledig aanpasbaar als broncode |
| **Design system zonder designkennis?** | Claude Design gebruikt met shadcn-componenten als input, output handmatig vertaald naar CSS variabelen in `globals.css` |
| **Backend koppelen zonder dat die af is?** | Mock data + API wrapper patroon via `lib/api.ts` — schermen werken offline, live koppelen = één TODO-comment vervangen |

---

### 8. Voldoet dit aan mijn criteria?

| Criterium | Doel | Gehaald? |
|---|---|---|
| **Vier werkende schermen** | Volledig navigeerbaar | ✅ Alle vier gebouwd en navigeerbaar |
| **Koppelbaar aan backend** | Mock vervangbaar zonder structuurwijziging | ✅ Patiëntbeheer al live, overige TODO-comments klaar |
| **Consistent design** | Zelfde component- en kleurtaal | ✅ shadcn + CSS variabelen door alle schermen |
| **Onderhoudbaar** | Nieuw scherm = één map + één page.tsx | ✅ Bewezen bij alle vier schermen |

---

### 9. Aannames

- SSR blijft buiten scope. Als het dashboard ooit publiek toegankelijk moet worden, moet de Next.js configuratie herzien worden.
- De vier schermen zijn voor nu fixed. De feature-based structuur schaalt direct als er een vijfde scherm bijkomt.

---

### 10. Bronnen

**(1)** Facebook/Meta. (2023). *Create React App — unmaintained.*  
[https://github.com/facebook/create-react-app](https://github.com/facebook/create-react-app)

**(2)** Next.js Documentation. (2024). *App Router — Project structure.*  
[https://nextjs.org/docs/app/getting-started/project-structure](https://nextjs.org/docs/app/getting-started/project-structure)

Zie evidence-bestanden voor verdere bronnen per deelkeuze.

---

### 11. Implementatiebewijs

| Wat | Bewijs |
|---|---|
| shadcn componenten geïnstalleerd | Commits `9960be6`, `27ce596`, `df8e4ec` |
| Vier schermen gebouwd (mock data) | Commit `e8123a4` — add next js with shadcn frontend |
| Patiëntbeheer live gekoppeld aan FastAPI | Stap 17 in STAPPEN.md |
| Framework-vergelijking | [evidence_03_framework_vergelijking.md](../evidence/evidence_03_framework_vergelijking.md) |
| UI-library en design system vergelijking | [evidence_04_ui_library_en_design_system.md](../evidence/evidence_04_ui_library_en_design_system.md) |

**Stap in STAPPEN.md:** Stap 13–16

---

### 12. Wat dit oplevert

**Volgende stap:** Issue #16 — patiëntbeheer volledig live (mock data al vervangen). Daarna issue #18: chat endpoint wiren zodat ook het chat-scherm live gaat op echte LLM-responses.
