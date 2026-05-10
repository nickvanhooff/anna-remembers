# Anna Remembers — Frontend

Next.js 15 dashboard voor zorgverleners. Toont patiëntgegevens, gesprekshistorie met Anna (de AI-assistent), symptoomtrends en escalatiebeheer.

> **UI only.** Geen AI-logica, geen directe databaseaanroepen. Alles loopt via de FastAPI backend op `http://localhost:8000`.

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI library | shadcn/ui (`radix-nova` style) |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Icons | Lucide React |
| Toasts | Sonner |
| Language | TypeScript (strict) |

---

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Verwacht de backend op `http://localhost:8000`. Zonder backend laadt het patiëntenscherm leeg — de overige schermen (chat, trends, escalaties) draaien nog op mock data.

Andere backend URL instellen:

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Scripts

| Script | Beschrijving |
|---|---|
| `npm run dev` | Dev server met Turbopack |
| `npm run build` | Productie build |
| `npm run typecheck` | TypeScript valideren zonder build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier over alle `.ts` / `.tsx` bestanden |

---

## Projectstructuur

```
app/
├── (dashboard)/            # Route group — gedeelde sidebar layout
│   ├── layout.tsx          # Laadt DashboardShell (sidebar + inset)
│   ├── patients/page.tsx
│   ├── chat/page.tsx
│   ├── trends/page.tsx
│   └── escalations/page.tsx
├── globals.css             # Design tokens (CSS variabelen)
├── layout.tsx              # Root layout — fonts, ThemeProvider, Toaster
└── page.tsx                # Redirect naar /patients

components/
├── dashboard/
│   ├── dashboard-sidebar.tsx   # Navigatie + gebruikersvoettekst
│   ├── shell.tsx               # SidebarProvider wrapper
│   └── status-badge.tsx        # Semantische statusbadge (success/warning/urgent/info)
├── patients/
│   └── patients-screen.tsx     # CRUD patiëntbeheer
├── chat/
│   └── chat-screen.tsx         # Gesprek met Anna
├── trends/
│   └── trends-screen.tsx       # Symptoomtrends + KPI-tiles
├── escalations/
│   └── escalations-screen.tsx  # Escalatiebeheer
└── ui/                         # shadcn/ui componenten (gegenereerd)

lib/
├── api.ts          # Alle fetch-calls naar FastAPI (één plek)
├── mock-data.ts    # Seed data voor schermen die nog niet live zijn
└── utils.ts        # fmtDate(), fmtTime(), cn()

types/
└── index.ts        # Gedeelde TypeScript interfaces (Patient, Session, Escalation, ...)
```

---

## API koppeling

`lib/api.ts` is de enige plek waar fetch-calls staan. Elke functie retourneert een getypte Promise.

| Functie | Endpoint | Status |
|---|---|---|
| `getPatients()` | `GET /patients/` | Live |
| `createPatient(input)` | `POST /patients/` | Live |
| `updatePatient(id, input)` | `PATCH /patients/{id}` | Live |
| `deletePatient(id)` | `DELETE /patients/{id}` | Live |
| `getSessions(patientId)` | `GET /patients/{id}/sessions` | Mock |
| `sendMessage(...)` | `POST /patients/{id}/sessions/{id}/messages` | Mock |
| `getTrends(patientId)` | `GET /patients/{id}/trends` | Mock |
| `getEscalations()` | `GET /escalations` | Mock |

Mock-functies hebben een `// TODO:` comment met de echte endpoint — vervangen zodra de backend dat endpoint heeft.

---

## Design tokens

Gedefinieerd in `app/globals.css` als CSS-variabelen op `:root`:

| Variabele | Gebruik |
|---|---|
| `--primary` | Sage-teal — knoppen, actieve navigatie |
| `--success-soft-bg` / `--success-soft-fg` | Stabiele patiëntstatus |
| `--warning-soft-bg` / `--warning-soft-fg` | Aandacht vereist |
| `--destructive-soft-bg` / `--destructive-soft-fg` | Urgent / verwijderen |
| `--info-soft-bg` / `--info-soft-fg` | Nieuw / informatief |
| `--chart-1` … `--chart-5` | Symptoomtrend kleuren |

Gebruik `style={{ backgroundColor: "var(--success-soft-bg)" }}` voor statusgerelateerde kleuren — niet via Tailwind utilities.
