# Evidence 04 — UI library vergelijking en design system aanpak

**Type:** Vergelijkingstabel + overwegingsverslag  
**Datum:** 2026-05-10  
**Hoort bij:** DL3 — Frontend architectuur, Stap 14–15 in STAPPEN.md  
**Commit:** `9960be6` / `e8123a4`

---

## Onderzoeksvraag

Welke UI-library gebruik ik zodat ik snel professionele componenten kan bouwen zonder later vast te zitten aan theming-beperkingen?

## DOT-methode: Beschikbaar product analyseren (Library)

| Criterium | shadcn/ui | MUI (Material UI) | Ant Design |
|---|---|---|---|
| **Installatiemodel** | Broncode gekopieerd naar `components/ui/` | npm package — black-box | npm package — black-box |
| **Tailwind compatibel** | Ja — Tailwind is de basis | Nee — eigen emotion/styled systeem | Gedeeltelijk |
| **Theming aanpassen** | CSS variabelen op `:root` | `createTheme()` bovenop Tailwind | Eigen token-systeem |
| **Toegankelijkheid** | Radix UI primitieven ingebouwd [1] | Eigen implementatie | Eigen implementatie |
| **Versie-afhankelijkheid** | Geen — component is eigen code | Ja — breaking changes bij major update | Ja |
| **Gangbaar in NL werkveld** | Groeiend in startup/scale-up omgevingen [2] | Dominant in enterprise omgevingen | Minder gangbaar buiten China |

## Overweging: waarom geen MUI?

MUI theming conflicteert met Tailwind. Om kleuren te overschrijven heb je `createTheme()` nodig — een extra abstractielaag bovenop de CSS variabelen die Tailwind al beheert. In de praktijk leidt dat tot een mix van twee styling-systemen, wat inconsistent en moeilijk te onderhouden is.

Bij MUI zijn componenten ook een black-box. Als een component iets niet ondersteunt, ben je afhankelijk van de `sx` prop of `styled()` override-mechanieken. Bij shadcn open ik gewoon het bestand in `components/ui/` en pas ik het aan.

## Overweging: custom StatusBadge

De standaard shadcn `Badge` heeft vier varianten: `default`, `secondary`, `outline`, `destructive`. Voor dit project zijn vier zorginhoudelijke statussen nodig: `success`, `warning`, `urgent`, `info`.

Ik had de `Badge` kunnen uitbreiden via `cva()` (class-variance-authority), maar dat vereist kennis van hoe shadcn varianten intern opbouwt. In plaats daarvan heb ik een losse `StatusBadge` component gebouwd met directe CSS variabelen:

```tsx
style={{ backgroundColor: "var(--success-soft-bg)", color: "var(--success-soft-fg)" }}
```

Dit is eenvoudiger en direct leesbaar zonder extra abstractie.

## Design tokens aanpak

Alle kleurtokens staan als CSS variabelen op `:root` in `app/globals.css`. Reden voor CSS variabelen boven Tailwind utility-classes:

- Semantische statuskleuren zijn niet uitdrukbaar als standaard Tailwind klassen zonder custom config
- CSS variabelen werken in `style={}` props — handig voor dynamische kleuren op basis van runtime-data (patiëntstatus uit de API)
- Eén variabele aanpassen werkt direct door in alle componenten die hem gebruiken

Claude Design is gebruikt als startpunt om token-waarden te verkennen. De output is handmatig vertaald naar `oklch`-waarden in `globals.css`.

---

## Bronnen

**(1)** Radix UI. (2024). *Primitives — Accessible, unstyled components.*  
[https://www.radix-ui.com](https://www.radix-ui.com)

**(2)** State of JS. (2024). *Component Libraries — Usage trends.*  
[https://stateofjs.com](https://stateofjs.com)
