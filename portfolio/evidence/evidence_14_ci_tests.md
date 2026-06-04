# Evidence 14 — Geautomatiseerde tests in CI pipeline

**Type:** CI-configuratie / testresultaat
**Datum:** 2026-06-04
**Hoort bij:** Managing & Controlling — geautomatiseerde kwaliteitsbewaking
**Commit:** e903544

---

## Situatie

De CI pipeline draaide alleen `docker compose build` — er werden geen tests uitgevoerd. Regressies konden ongemerkt naar `main` worden gepushed.

## Wijziging

`.github/workflows/ci.yml` uitgebreid zodat bij elke push en pull request naar `main`:

1. De backend image gebouwd wordt via `docker compose build`
2. De volledige pytest-suite gedraaid wordt in de backend container via `docker compose run --no-deps --rm backend pytest tests/ -v`
3. De build van de mcp-server image daarna volgt

`--no-deps` voorkomt dat postgres, ollama en chromadb opgestart worden — de tests gebruiken SQLite in-memory en mocks, dus externe services zijn niet nodig.

```yaml
- name: Build images
  run: docker compose build

- name: Run tests
  run: docker compose run --no-deps --rm backend pytest tests/ -v
```

`pytest` en `pytest-asyncio` zijn toegevoegd aan `backend/requirements.txt` zodat ze beschikbaar zijn in de container.

---

## Testresultaat (lokaal geverifieerd)

```
52 passed in 19.59s
```

| Testbestand | Wat het test |
|---|---|
| `test_escalation_layers.py` | Layer-0 keyword detection, JSON-parse voor escalatie |
| `test_chat.py` | Chat-endpoint: RAG-injectie, Postgres opslag, debug context proof |
| `test_mcp_client.py` | MCP-tool aanroepen: recall, store, escalate |
| `test_notification.py` | Twilio SMS: opbouw, verzending, foutafhandeling |
| `test_settings.py` | Settings CRUD via API |
| `test_tts.py` | TTS provider routing (Piper / XTTS) |
| `test_audio_converter.py` | Audio-conversie (ffmpeg wrapper) |
| `test_voice_samples.py` | Voice sample upload, path traversal beveiliging |

Screenshot van groene CI run op GitHub Actions:

![CI pipeline — 52 tests groen](images/ci_tests_groen.png)

---

## Waarom dit Managing & Controlling aantoont

Tests draaien automatisch bij elke push — niet als ik eraan denk. Als een wijziging een regressie introduceert, stopt de pipeline vóór de Docker build en wordt de fout zichtbaar via GitHub. Dit is een permanente controlemaatregel die kwaliteit bewaakt zonder handmatige actie van de engineer.

Tijdens het opzetten bleek dat drie tests verouderd waren (functies hernoemd na refactor, `store_memory` verplaatst naar BackgroundTask). Die zijn direct gecorrigeerd — de CI dwong me om de tests actueel te houden.
