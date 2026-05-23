# Design — Instellingenpagina met persistente app-settings

**Datum:** 2026-05-23
**Status:** Goedgekeurd

## Probleemstelling

Er is geen manier om app-instellingen (zoals Twilio SMS aan/uit) te wijzigen
zonder Docker te herstarten. Een zorgverlener moet dit via de UI kunnen regelen.

## Doel

Een settings-pagina in het dashboard waarmee instellingen persistent in
PostgreSQL worden opgeslagen en direct van kracht zijn zonder herstart.
Eerste instelling: Twilio SMS notificaties aan/uit.

## Architectuur

```
PostgreSQL: settings tabel
  key   VARCHAR PRIMARY KEY
  value VARCHAR NOT NULL

GET  /settings          → { key: value, ... }
PUT  /settings/{key}    → { value: "true" | "false" }

send_sms_notification()
  → leest "twilio_sms_enabled" uit DB
  → false = overslaan zonder SMS

Frontend: app/(dashboard)/settings/page.tsx
  → Switch component (shadcn) per instelling
  → Optimistic update + PUT naar backend
  → Foutmelding bij mislukte opslag

Sidebar: Settings-knop gelinkt aan /settings
```

## Database

Nieuwe tabel via Alembic-migratie:

```sql
CREATE TABLE settings (
    key   VARCHAR PRIMARY KEY,
    value VARCHAR NOT NULL
);
INSERT INTO settings (key, value) VALUES ('twilio_sms_enabled', 'true');
```

Default `true` zodat bestaand gedrag bewaard blijft voor wie de pagina
nog niet heeft bezocht.

## API

```
GET /settings
Response: { "twilio_sms_enabled": "true" }

PUT /settings/twilio_sms_enabled
Body: { "value": "false" }
Response: { "key": "twilio_sms_enabled", "value": "false" }
```

## Frontend settings-pagina

Sectie "Notificaties" met één rij:

```
⚙️ Instellingen

Notificaties
┌──────────────────────────────────────────────┐
│ Twilio SMS                    [● aan / uit]  │
│ Stuur automatisch SMS bij escalaties         │
└──────────────────────────────────────────────┘
```

Gedrag:
- Toggle schakelt direct (optimistic update)
- PUT naar backend op achtergrond
- Bij fout: toggle terugdraaien + toast

## Gewijzigde bestanden

| Bestand | Type | Wijziging |
|---|---|---|
| `backend/models/setting.py` | Nieuw | `Setting` SQLAlchemy model |
| `backend/schemas/setting.py` | Nieuw | Pydantic schemas |
| `backend/routers/settings.py` | Nieuw | GET + PUT endpoints |
| `backend/main.py` | Wijziging | Settings router registreren |
| `backend/services/notification.py` | Wijziging | DB-check vóór SMS verzenden |
| `backend/alembic/versions/xxxx_add_settings_table.py` | Nieuw | Migratie + seed |
| `frontend/.../app/(dashboard)/settings/page.tsx` | Nieuw | Settings-pagina |
| `frontend/.../components/dashboard/dashboard-sidebar.tsx` | Wijziging | Settings-knop linken |
| `frontend/.../lib/api.ts` | Wijziging | `getSettings()` + `updateSetting()` |
| `frontend/.../types/index.ts` | Wijziging | `Settings` type toevoegen |

## Foutafhandeling

- `key` bestaat niet bij PUT → 404
- DB onbereikbaar bij SMS → SMS overgeslagen, `notification_status = "failed"`
- Frontend PUT mislukt → optimistic update terugdraaien, toast tonen

## Buiten scope

- Authenticatie / rollen (wie mag instellingen wijzigen)
- Meer instellingen dan Twilio toggle
- Audit log van wie wat gewijzigd heeft
