# Voice Mode + Avatar — Design Spec

**Datum:** 2026-05-20
**Auteur:** Nick van Hooff
**Status:** Goedgekeurd voor implementatie
**Scope:** Anna Remembers — uitbreiding chat-interface met TTS, optionele STT en pratende dokter-avatar

---

## 1. Doel

Patiënten kunnen Anna's antwoorden laten uitspreken door een Nederlandstalige spraakassistent, terwijl een 3D-avatar de tekst meeleest met lip-sync. Optioneel kan de patiënt via push-to-talk tegen Anna praten in plaats van te typen.

Deze feature is **additief**: de bestaande tekst-chat verandert niet en blijft de standaardmodus.

## 2. Doelen en non-doelen

### Doelen
- Lokaal draaiende Nederlandse TTS met lage latency (geen cloud, sluit aan op privacy-narratief uit DL4 / evidence #9)
- Visueel aantrekkelijke dokter-avatar met lip-sync voor demo-impact
- Optionele spraakinvoer (push-to-talk) zonder extra container
- Eén toggle in de chat-UI activeert alles

### Non-doelen
- Continue luistermodus / barge-in (gebruiker onderbreekt Anna)
- Audio caching tussen sessies
- Emotie- of stem-tuning per gespreksinhoud
- Meertaligheid — alleen Nederlands
- Mobile-optimalisatie (desktop browser voor demo is voldoende)
- Lokale Whisper STT (Web Speech API is voor nu voldoende; lokale STT is een mogelijke vervolg-evidence)

## 3. Stack-keuzes

| Onderdeel | Keuze | Reden |
|---|---|---|
| TTS-engine | Piper (`nl_NL-mls-low.onnx`, ~20MB) | CPU-only, geen VRAM-conflict met Ollama/embeddings, lokaal, ~50-200ms per zin |
| TTS-deployment | Aparte Docker container | Past in bestaande compose-architectuur, FastAPI proxiet ernaartoe |
| Avatar | TalkingHead.js + Ready Player Me 3D-model | Open-source (MIT), draait volledig client-side, automatische viseme-extractie uit audio |
| STT | Web Speech API (browser-native) | Nul setup, geen extra container, push-to-talk voldoet aan "simpel" eis |
| Streaming-strategie | Whole-message TTS (geen zin-streaming) | Bewust simpel gehouden; trade-off is ~2-6s stilte vóór audio start |

## 4. Architectuur

```
Browser (Next.js)                FastAPI                Piper (Docker)
─────────────────                ───────                ──────────────
Voice mode toggle
   │
   ├─ Mic (Web Speech API) ──► tekst ──► POST /chat ──► LLM ──► antwoord-tekst
   │
   │                                                      │
   ◄──────────── tekst-antwoord ─────────────────────────┘
   │
   ├─ POST /tts {text} ─────────► proxy ─────────► piper-http
   │                                                      │
   ◄──────── audio bytes (wav) ──────────────────────────┘
   │
   ├─ TalkingHead.js  ──► lip-sync via amplitude/visemes
   └─ <audio> element ──► afspelen
```

### Architectuurregels respecteren

- Next.js praat **niet** rechtstreeks met de Piper-container. Alle TTS-aanvragen lopen via FastAPI (architectuurregel #2).
- Piper draait als apart proces in docker-compose, niet geïmporteerd in FastAPI (architectuurregel #3).
- De chat-router blijft onaangeraakt — voice-modus is een puur additieve laag.

## 5. Datastromen

### Tekst-modus (ongewijzigd)
```
User typt → POST /chat → LLM → tekst-antwoord → render bubble
```

### Voice-modus (nieuw)
```
1. User klikt mic-knop (push-to-talk)
2. Web Speech API → transcribeerd Nederlands → vult chat-input
3. User klikt verstuur
4. POST /chat (zelfde endpoint) → tekst-antwoord
5. Frontend ziet voice-mode actief → POST /tts {text} → audio blob
6. Audio afspelen + TalkingHead.js lip-sync
```

Backend weet niet dat voice-modus bestaat. Frontend bepaalt of er een TTS-call volgt.

## 6. Componenten

### Nieuw

| Pad | Verantwoordelijkheid |
|---|---|
| `docker-compose.yml` (service `piper-tts`) | Piper container, exposed op intern netwerk |
| `backend/routers/tts.py` | `POST /tts` — accepteert `{text: str}`, retourneert `audio/wav` bytes |
| `backend/services/tts.py` | HTTP-client (`httpx`) naar Piper-container, error handling, timeout |
| `frontend/components/VoiceMode.tsx` | Container: toggle-state, avatar, mic-knop, audio-player |
| `frontend/components/Avatar.tsx` | TalkingHead.js wrapper, laadt Ready Player Me model |
| `frontend/lib/speech.ts` | Web Speech API wrapper voor STT (push-to-talk) |
| `frontend/lib/tts.ts` | Fetch-helper voor `/tts` endpoint, retourneert audio-URL |

### Aangepast

| Pad | Wijziging |
|---|---|
| `frontend/app/patients/[id]/chat/page.tsx` | Voice-toggle bovenaan; conditioneel `<VoiceMode />` rendert avatar + mic |
| `backend/main.py` | TTS-router includen |
| `.env.example` | `PIPER_URL=http://piper-tts:5000` toevoegen |

### Niet aangepast
Chat-router, LLM-services, RAG, MCP-server, alle Postgres-modellen.

## 7. API-contract

### `POST /tts`
**Request:**
```json
{ "text": "Hallo, hoe voel je je vandaag?" }
```

**Response:** `audio/wav` binary stream

**Errors:**
- `400` — lege tekst
- `503` — Piper-container niet bereikbaar
- `504` — Piper timeout (>10s)

## 8. UX-flow

1. Patiënt opent `/patients/[id]/chat`
2. Bovenaan: toggle "🔇 Tekst-modus / 🔊 Voice-modus"
3. Klik op toggle → avatar verschijnt prominent, mic-knop wordt zichtbaar
4. Patiënt kan:
   - Typen + verzenden (Anna spreekt antwoord uit)
   - Mic ingedrukt houden → spreken → loslaten → tekst verschijnt → verzenden
5. Anna's antwoord verschijnt als chat-bubble + wordt uitgesproken + avatar doet lip-sync
6. Toggle uit → terug naar tekst-modus, avatar verdwijnt

## 9. Latency-verwachting

| Onderdeel | Latency |
|---|---|
| LLM-antwoord (Groq) | 1-3s |
| LLM-antwoord (Ollama lokaal) | 5-20s |
| Piper TTS (hele antwoord, ~50 woorden) | 200-600ms |
| Audio download + playback start | <100ms |
| **Totaal stilte (Groq)** | **~1.5-3.5s** |
| **Totaal stilte (Ollama)** | **~5-20s** |

Acceptabel voor demo. Zin-streaming kan later worden toegevoegd als evidence-uitbreiding (vermeld in vervolgmogelijkheden).

## 10. Portfolio-impact

Deze feature levert mogelijk:
- **Nieuwe decision log (DL5):** afweging lokale TTS (Piper) vs cloud (ElevenLabs) vs browser-native. Centraal: privacy + latency + portfolio-narratief consistentie.
- **Nieuwe evidence:** vergelijkingstabel TTS-opties, benchmark Piper-latencies op eigen hardware, screenshot/recording van avatar-demo.
- **Update STAPPEN.md:** per implementatiestap (volgens projectconventie).

## 11. Risico's en open vragen

| Risico | Mitigatie |
|---|---|
| TalkingHead.js lip-sync werkt slecht met Piper audio | Fallback: statisch portret + audio zonder lip-sync |
| Piper Nederlandse stem klinkt robotisch | Lichte stem-keuze documenteren in evidence; medium-quality voice als upgrade-pad |
| Web Speech API werkt alleen in Chrome/Edge | Documenteren in README; voor demo is dat ok |
| Piper container start traag (model laden) | Healthcheck in compose; eerste request kan ~2s extra duren |

## 12. Vervolgmogelijkheden (uit scope)

- Zin-streaming voor lagere first-audio latency
- Lokale Whisper STT in plaats van Web Speech API (volledig lokaal)
- Audio caching per zin (dezelfde groet hoeft niet steeds opnieuw)
- Selecteerbare stemmen / "dokter"-personage in patiënt-instellingen
