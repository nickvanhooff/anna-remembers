# Evidence 14 — CI pipeline draait automatisch tests

**Type:** testresultaat / CI-configuratie
**Datum:** 2026-06-04
**Hoort bij:** Managing & Controlling — geautomatiseerde kwaliteitsbewaking
**Commit:** (volgt na push)

---

## Wijziging

`.github/workflows/ci.yml` uitgebreid met een `test` job die bij elke push en pull request naar `main` de pytest-suite draait. De bestaande `build` job heeft `needs: test` gekregen — Docker images worden alleen gebouwd als de tests groen zijn.

```
push / PR naar main
        │
        ▼
   [ test job ]          ← nieuw
   pytest tests/ -v
        │
   groen? ──nee──► pipeline stopt, build wordt overgeslagen
        │
       ja
        ▼
   [ build job ]
   docker build backend
   docker build mcp-server
```

`pytest` en `pytest-asyncio` zijn toegevoegd aan `backend/requirements.txt`.

---

## Testresultaat

Screenshot van groene CI run na de wijziging:

![CI pipeline — test + build groen](images/ci_tests_groen.png)

Gedraaide tests (`pytest tests/ -v`):

| Testbestand | Wat het test |
|---|---|
| `test_escalation_layers.py` | Layer-0 keyword detection en JSON-parse voor escalatie |
| `test_chat.py` | Chat-endpoint met SQLite in-memory en gemockte MCP-client |
| `test_settings.py` | Settings CRUD via API |
| `test_tts.py` | TTS provider routing (Piper / XTTS) |
| `test_notification.py` | Twilio SMS escalatie-notificaties |
| `test_audio_converter.py` | Audio-conversie utils |
| `test_mcp_client.py` | MCP-client verbinding en tool-aanroepen |
| `test_voice_samples.py` | Voice sample upload en opslag |

---

## Waarom dit Managing & Controlling aantoont

De tests draaien automatisch — niet alleen als ik eraan denk. Als een wijziging een regressie introduceert, stopt de pipeline vóór de Docker build. Dit is een controlemaatregel die kwaliteit bewaakt zonder handmatige actie.
