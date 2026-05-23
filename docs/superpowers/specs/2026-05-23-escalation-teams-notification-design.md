# Design — Escalatie SMS-notificatie via Twilio (Issue #25)

**Datum:** 2026-05-23
**Status:** Goedgekeurd

## Probleemstelling

De `escalate_to_human` MCP-tool slaat escalaties op in PostgreSQL met
`notification_status = "pending"`, maar stuurt nog geen enkel bericht.
Zorgverleners weten niet dat er een escalatie is totdat ze het dashboard
handmatig openen.

## Doel

Bij elke nieuwe escalatie automatisch een SMS sturen via Twilio, met
onderscheid in berichttoon tussen "aandacht" (low/medium) en "urgent" (high).
De `notification_status` in de DB wordt bijgewerkt naar `"sent"` of `"failed"`.

## Architectuur

```
POST /escalations/
  1. Escalation opgeslagen in DB (notification_status = "pending")
  2. HTTP 201 response direct teruggestuurd naar MCP-tool
  3. BackgroundTask: notification.send_sms_notification(db, escalation)
       a. Bouw SMS-tekst op basis van urgency
       b. Twilio client.messages.create(...)
       c. DB update: notification_status = "sent" | "failed"
```

De API-response blokkeert niet op de Twilio-aanroep. Zelfde patroon als de
medische samenvatting BackgroundTask in de chat-router.

## Twilio setup (eenmalig)

1. Gratis account aanmaken op twilio.com (~$15 trial credits)
2. Twilio-nummer activeren (gratis bij trial)
3. Eigen mobiel nummer verifiëren als "Verified Caller ID"
4. Account SID en Auth Token kopiëren uit de Twilio Console

## Berichtopmaak

**Aandacht** (urgency = `low` of `medium`):
```
[Anna Remembers] Aandacht vereist
Patiënt: Jan de Vries
Urgentie: Medium
Reden: Lichte toename kortademigheid gemeld over twee weken.
```

**Urgent** (urgency = `high`):
```
[Anna Remembers] URGENT
Patiënt: Jan de Vries
Urgentie: High
Reden: Patiënt meldt ernstige benauwdheid en duizeligheid.
```

SMS-berichten zijn platte tekst, max ~160 tekens per segment.
Langere berichten worden automatisch gesplitst door Twilio.

## Gewijzigde bestanden

| Bestand | Type | Wijziging |
|---|---|---|
| `backend/services/notification.py` | Nieuw | `send_sms_notification(db, escalation)` async functie |
| `backend/routers/escalations.py` | Wijziging | `BackgroundTasks` parameter + taak registreren na commit |
| `backend/requirements.txt` | Wijziging | `twilio` toevoegen |
| `.env.example` | Wijziging | Twilio-variabelen toevoegen |

## Configuratie

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxx
TWILIO_FROM=+15551234567
NOTIFICATION_PHONE=+31612345678
```

Geen `TWILIO_ACCOUNT_SID` ingesteld = notificatie wordt overgeslagen,
`notification_status` blijft `"pending"`. Lokale dev-omgeving werkt zonder Twilio.

## Foutafhandeling

- Twilio API-fout → `notification_status = "failed"`, log warning met Twilio error code
- Twilio-config niet ingesteld → skip silently, log info
- Timeout → 10 seconden, daarna `"failed"`
- De escalatie zelf mislukt nooit door een SMS-fout — DB-opslag is leidend

## Buiten scope

- Retry-mechanisme bij `"failed"` notificaties
- Meerdere ontvangers per urgentieniveau
- Email als tweede kanaal
