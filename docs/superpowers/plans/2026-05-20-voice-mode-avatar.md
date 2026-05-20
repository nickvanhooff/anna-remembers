# Voice Mode + Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a voice-mode toggle to the patient chat that lets Anna speak Dutch via local Piper TTS, drives a 3D dokter-avatar with lip-sync, and accepts push-to-talk input via the browser Web Speech API.

**Architecture:** Voice-mode is a purely additive frontend layer plus one new FastAPI endpoint that proxies to a Piper TTS Docker container. The existing chat flow is untouched — frontend conditionally calls `/tts` after a chat response when voice-mode is active.

**Tech Stack:** Piper TTS (`nl_NL-mls-low.onnx`, CPU, ONNX runtime), FastAPI + httpx, Next.js 15 (App Router), TalkingHead.js, Ready Player Me, Web Speech API.

**Note:** Per user request, no automated tests are included in this plan. Each task ends with a manual smoke-check and a commit.

**Reference spec:** `docs/superpowers/specs/2026-05-20-voice-mode-avatar-design.md`

---

## File Structure

### New files

| Pad | Verantwoordelijkheid |
|---|---|
| `backend/routers/tts.py` | `POST /tts` endpoint — accepts `{text}`, returns `audio/wav` |
| `backend/services/tts.py` | httpx-client naar Piper container met timeout + errors |
| `backend/schemas/tts.py` | Pydantic-schema `TTSRequest` |
| `frontend/Anna-remembers/lib/tts.ts` | `fetchTTS(text)` → `Blob` voor playback |
| `frontend/Anna-remembers/lib/speech.ts` | `useSpeechRecognition()` hook (Web Speech API, NL) |
| `frontend/Anna-remembers/components/chat/voice-mode.tsx` | Toggle-state, avatar-mount, mic-knop, audio-player |
| `frontend/Anna-remembers/components/chat/avatar.tsx` | TalkingHead.js wrapper, laadt Ready Player Me model |

### Modified files

| Pad | Wijziging |
|---|---|
| `docker-compose.yml` | Service `piper-tts` toevoegen |
| `backend/main.py` | TTS-router includen |
| `.env.example` | `PIPER_URL=http://piper-tts:5000` |
| `frontend/Anna-remembers/components/chat/chat-screen.tsx` | Voice-mode toggle bovenaan, conditioneel `<VoiceMode />` renderen, audio afspelen na chat-response |
| `frontend/Anna-remembers/package.json` | `@met4citizen/talkinghead` toevoegen (of CDN-tag in layout) |

---

## Task 1: Piper TTS Docker service

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add Piper service**

Voeg toe onderaan onder `services:` in `docker-compose.yml`:

```yaml
  piper-tts:
    image: lscr.io/linuxserver/piper:latest
    container_name: anna-piper-tts
    environment:
      - PUID=1000
      - PGID=1000
      - PIPER_VOICE=nl_NL-mls-low
      - PIPER_LENGTH=1.0
      - PIPER_NOISE=0.667
      - PIPER_NOISEW=0.8
      - PIPER_SPEAKER=0
      - PIPER_PROCS=1
      - PIPER_HTTP_PORT=5000
    ports:
      - "5005:5000"
    restart: unless-stopped
    networks:
      - anna-network
```

Verifieer dat `anna-network` (of de bestaande naam in jouw compose) klopt — pas aan indien anders.

- [ ] **Step 2: Pull en start container**

```bash
docker compose pull piper-tts
docker compose up -d piper-tts
docker compose logs piper-tts --tail 30
```

Verwacht: log toont "Downloading voice nl_NL-mls-low" (eenmalig) en daarna "HTTP server started on port 5000".

- [ ] **Step 3: Manuele smoke-check**

```bash
curl -X POST "http://localhost:5005/?text=Hallo%20ik%20ben%20Anna" --output test.wav
```

Verwacht: bestand `test.wav` van >10 KB. Speel af — moet een Nederlandse vrouwenstem zijn.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): add piper TTS service with Dutch voice"
```

---

## Task 2: Backend TTS service (httpx client)

**Files:**
- Create: `backend/services/tts.py`

- [ ] **Step 1: Schrijf de TTS-service**

Maak `backend/services/tts.py`:

```python
"""HTTP client for the Piper TTS container."""
import os
import httpx
from fastapi import HTTPException

PIPER_URL = os.getenv("PIPER_URL", "http://piper-tts:5000")
TIMEOUT_SECONDS = 10.0


async def synthesize(text: str) -> bytes:
    """Send text to Piper and return WAV audio bytes.

    Raises HTTPException on upstream errors so the router can pass them through.
    """
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="text mag niet leeg zijn")

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        try:
            response = await client.post(
                PIPER_URL,
                params={"text": text},
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Piper timeout")
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Piper niet bereikbaar: {exc}",
            )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Piper gaf status {response.status_code} terug",
        )

    return response.content
```

- [ ] **Step 2: Commit**

```bash
git add backend/services/tts.py
git commit -m "feat(backend): add Piper TTS httpx client service"
```

---

## Task 3: Backend TTS schema + router

**Files:**
- Create: `backend/schemas/tts.py`
- Create: `backend/routers/tts.py`
- Modify: `backend/main.py`
- Modify: `.env.example`

- [ ] **Step 1: Schema**

Maak `backend/schemas/tts.py`:

```python
from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
```

- [ ] **Step 2: Router**

Maak `backend/routers/tts.py`:

```python
"""TTS router — proxies text-to-speech requests to the Piper container."""
from fastapi import APIRouter
from fastapi.responses import Response

from backend.schemas.tts import TTSRequest
from backend.services.tts import synthesize

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("", response_class=Response)
async def text_to_speech(req: TTSRequest) -> Response:
    """Synthesize Dutch speech from text via Piper. Returns audio/wav bytes."""
    audio = await synthesize(req.text)
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )
```

- [ ] **Step 3: Includer router in main.py**

In `backend/main.py`: zoek de bestaande `app.include_router(...)` regels (voor chat/patients/escalations) en voeg toe:

```python
from backend.routers import tts as tts_router
# ... later in het bestand bij de andere include_router calls ...
app.include_router(tts_router.router)
```

- [ ] **Step 4: Env-var documenteren**

Voeg onderaan `.env.example` toe:

```
PIPER_URL=http://piper-tts:5000
```

- [ ] **Step 5: Backend restart + smoke-check**

```bash
docker compose restart backend
curl -X POST http://localhost:8000/tts \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"Hallo, ik ben Anna.\"}" \
  --output anna.wav
```

Verwacht: `anna.wav` >10 KB. Speel af — Nederlandse stem.

Test error-paths:

```bash
curl -X POST http://localhost:8000/tts -H "Content-Type: application/json" -d "{\"text\":\"\"}"
# Verwacht: 422 (Pydantic validation)
```

- [ ] **Step 6: Commit**

```bash
git add backend/schemas/tts.py backend/routers/tts.py backend/main.py .env.example
git commit -m "feat(backend): add /tts endpoint proxying to Piper"
```

---

## Task 4: Frontend TTS helper

**Files:**
- Create: `frontend/Anna-remembers/lib/tts.ts`

- [ ] **Step 1: Schrijf TTS-fetcher**

Maak `frontend/Anna-remembers/lib/tts.ts`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchTTS(text: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`TTS failed: ${response.status}`);
  }

  return response.blob();
}

export function playAudioBlob(blob: Blob): HTMLAudioElement {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  audio.play().catch((err) => console.error("Audio playback failed:", err));
  return audio;
}
```

Controleer of `NEXT_PUBLIC_API_URL` al gebruikt wordt in `lib/api.ts`. Zo niet, pas de fallback aan.

- [ ] **Step 2: Commit**

```bash
git add frontend/Anna-remembers/lib/tts.ts
git commit -m "feat(frontend): add TTS fetch + playback helper"
```

---

## Task 5: Frontend STT hook (Web Speech API)

**Files:**
- Create: `frontend/Anna-remembers/lib/speech.ts`

- [ ] **Step 1: Schrijf de hook**

Maak `frontend/Anna-remembers/lib/speech.ts`:

```typescript
"use client";
import { useEffect, useRef, useState, useCallback } from "react";

type SpeechRecognitionEvent = {
  results: { 0: { transcript: string }; isFinal: boolean }[] & { length: number };
};

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);
    const rec = new Ctor();
    rec.lang = "nl-NL";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = (e) => {
      console.error("Speech recognition error", e);
      setIsListening(false);
    };
    recognitionRef.current = rec;
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setTranscript("");
    recognitionRef.current.start();
    setIsListening(true);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { transcript, isListening, isSupported, start, stop };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/Anna-remembers/lib/speech.ts
git commit -m "feat(frontend): add Dutch Web Speech API hook"
```

---

## Task 6: Avatar component (TalkingHead.js)

**Files:**
- Modify: `frontend/Anna-remembers/package.json`
- Create: `frontend/Anna-remembers/components/chat/avatar.tsx`

- [ ] **Step 1: Installeer TalkingHead.js**

```bash
cd frontend/Anna-remembers
npm install @met4citizen/talkinghead three
```

Als de package niet als npm-build beschikbaar is, gebruik dan een CDN-aanpak: voeg in `app/layout.tsx` een `<Script src="https://cdn.jsdelivr.net/npm/@met4citizen/talkinghead@latest/modules/talkinghead.mjs" type="module" />` toe en pas `avatar.tsx` aan om `window.TalkingHead` te gebruiken.

- [ ] **Step 2: Maak avatar-component**

Maak `frontend/Anna-remembers/components/chat/avatar.tsx`:

```typescript
"use client";
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

const AVATAR_URL =
  process.env.NEXT_PUBLIC_AVATAR_URL ??
  "https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?morphTargets=ARKit,Oculus+Visemes";

export interface AvatarHandle {
  speakAudio: (blob: Blob, text: string) => Promise<void>;
}

export const Avatar = forwardRef<AvatarHandle>((_, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("@met4citizen/talkinghead");
      if (cancelled || !containerRef.current) return;
      const head = new mod.TalkingHead(containerRef.current, {
        ttsEndpoint: "",
        lipsyncModules: ["en", "fi"],
        cameraView: "upper",
      });
      await head.showAvatar({
        url: AVATAR_URL,
        body: "F",
        avatarMood: "neutral",
        lipsyncLang: "en",
      });
      headRef.current = head;
    })();
    return () => {
      cancelled = true;
      headRef.current?.stop?.();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    async speakAudio(blob: Blob, text: string) {
      const head = headRef.current;
      if (!head) {
        // fallback: gewoon audio afspelen
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await audio.play();
        return;
      }
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      head.speakAudio({ audio: audioBuffer, words: text.split(/\s+/) });
    },
  }));

  return (
    <div
      ref={containerRef}
      className="w-full h-[400px] rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800"
    />
  );
});

Avatar.displayName = "Avatar";
```

Voeg in `.env.example` (frontend) toe:

```
NEXT_PUBLIC_AVATAR_URL=https://models.readyplayer.me/<your-avatar-id>.glb?morphTargets=ARKit,Oculus+Visemes
```

(Maak een avatar aan op https://readyplayer.me/, kopieer de `.glb` URL.)

- [ ] **Step 3: Commit**

```bash
git add frontend/Anna-remembers/package.json frontend/Anna-remembers/package-lock.json frontend/Anna-remembers/components/chat/avatar.tsx
git commit -m "feat(frontend): add TalkingHead avatar component with Ready Player Me"
```

---

## Task 7: VoiceMode container component

**Files:**
- Create: `frontend/Anna-remembers/components/chat/voice-mode.tsx`

- [ ] **Step 1: Schrijf component**

Maak `frontend/Anna-remembers/components/chat/voice-mode.tsx`:

```typescript
"use client";
import { useRef, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, type AvatarHandle } from "./avatar";
import { useSpeechRecognition } from "@/lib/speech";
import { fetchTTS } from "@/lib/tts";

interface VoiceModeProps {
  /** Laatste antwoord van Anna — wordt automatisch uitgesproken. */
  lastAssistantMessage?: string;
  /** Callback wanneer STT een transcriptie oplevert. */
  onTranscript: (text: string) => void;
}

export function VoiceMode({ lastAssistantMessage, onTranscript }: VoiceModeProps) {
  const avatarRef = useRef<AvatarHandle>(null);
  const { transcript, isListening, isSupported, start, stop } = useSpeechRecognition();
  const lastSpokenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (transcript) onTranscript(transcript);
  }, [transcript, onTranscript]);

  useEffect(() => {
    if (!lastAssistantMessage) return;
    if (lastAssistantMessage === lastSpokenRef.current) return;
    lastSpokenRef.current = lastAssistantMessage;

    (async () => {
      try {
        const blob = await fetchTTS(lastAssistantMessage);
        await avatarRef.current?.speakAudio(blob, lastAssistantMessage);
      } catch (err) {
        console.error("TTS playback failed:", err);
      }
    })();
  }, [lastAssistantMessage]);

  return (
    <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-card">
      <Avatar ref={avatarRef} />
      <div className="flex gap-2">
        {isSupported ? (
          <Button
            variant={isListening ? "destructive" : "default"}
            onClick={isListening ? stop : start}
          >
            {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
            {isListening ? "Stop opnemen" : "Spreek tegen Anna"}
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">
            Spraakherkenning niet beschikbaar (gebruik Chrome of Edge).
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/Anna-remembers/components/chat/voice-mode.tsx
git commit -m "feat(frontend): add VoiceMode container with mic + avatar"
```

---

## Task 8: Integreer toggle in chat-screen

**Files:**
- Modify: `frontend/Anna-remembers/components/chat/chat-screen.tsx`

- [ ] **Step 1: Lees huidige chat-screen**

Open `frontend/Anna-remembers/components/chat/chat-screen.tsx` en zoek:
1. De state-hook waar messages worden bijgehouden
2. Waar de input/send-knop staat
3. Of er al iets boven de message-list gerenderd wordt

- [ ] **Step 2: Voeg voice-mode state + toggle toe**

Voeg bovenaan de component-body toe (na de bestaande `useState` calls):

```typescript
const [voiceMode, setVoiceMode] = useState(false);
const lastAssistantMessage = messages
  .filter((m) => m.role === "assistant")
  .slice(-1)[0]?.content;
```

(Pas `messages` / `role` / `content` aan op de bestaande veldnamen — check eerst hoe een message-object eruit ziet in dit bestand.)

- [ ] **Step 3: Render toggle bovenaan**

Direct onder de header / boven de berichtenlijst:

```tsx
<div className="flex items-center justify-between p-2 border-b">
  <span className="text-sm font-medium">
    {voiceMode ? "🔊 Voice-modus" : "💬 Tekst-modus"}
  </span>
  <Button
    variant="outline"
    size="sm"
    onClick={() => setVoiceMode((v) => !v)}
  >
    {voiceMode ? "Schakel naar tekst" : "Schakel naar voice"}
  </Button>
</div>

{voiceMode && (
  <VoiceMode
    lastAssistantMessage={lastAssistantMessage}
    onTranscript={(text) => setInput(text)}
  />
)}
```

(Pas `setInput` aan op de naam van de input-setter die in dit bestand bestaat.)

Voeg de import toe:

```typescript
import { VoiceMode } from "./voice-mode";
```

- [ ] **Step 4: Frontend draaien**

```bash
cd frontend/Anna-remembers
npm run dev
```

Open http://localhost:3000, ga naar een patiënt-chat, klik "Schakel naar voice".

Verwacht:
1. Avatar laadt (Ready Player Me, kan 2-3s duren)
2. Mic-knop verschijnt
3. Stuur een tekstbericht — Anna's antwoord wordt uitgesproken, avatar's mond beweegt
4. Klik mic-knop, spreek "hoe gaat het" → tekst verschijnt in input

- [ ] **Step 5: Commit**

```bash
git add frontend/Anna-remembers/components/chat/chat-screen.tsx
git commit -m "feat(frontend): wire voice-mode toggle into chat screen"
```

---

## Task 9: Documentatie + STAPPEN.md

**Files:**
- Modify: `portfolio/STAPPEN.md`
- Modify: `README.md` (optioneel)

- [ ] **Step 1: STAPPEN.md bijwerken**

Voeg onderaan `portfolio/STAPPEN.md` een nieuwe stap toe (oplopend nummer) met:

```markdown
## Stap N — Voice-modus + avatar (2026-05-20)

**Wat gedaan:** Voice-modus toegevoegd aan chat: Piper TTS container (nl_NL-mls-low), FastAPI /tts endpoint, TalkingHead.js avatar (Ready Player Me), Web Speech API voor push-to-talk.

**Beslissingen:**
- Piper boven cloud-TTS (ElevenLabs) — sluit aan op privacy-narratief uit DL4
- nl_NL-mls-low model voor lage latency op CPU (geen VRAM-conflict met Ollama)
- TalkingHead.js voor lip-sync in browser (open-source, geen server-side video)
- Web Speech API i.p.v. lokale Whisper — bewuste trade-off voor simplicity (vermeld als toekomstige uitbreiding)
- Whole-message TTS i.p.v. zin-streaming — bewust simpel gehouden

**Bronnen:**
- Piper TTS: https://github.com/rhasspy/piper
- TalkingHead.js: https://github.com/met4citizen/TalkingHead
- Ready Player Me: https://readyplayer.me/

**Zelf bedacht:** Architectuurkeuze om TTS via FastAPI te proxien (Next.js praat niet direct met Piper), zodat de architectuurregel "Next.js is alleen UI" gerespecteerd blijft.

**Commit:** `<hash van final commit>`
**Spec:** `docs/superpowers/specs/2026-05-20-voice-mode-avatar-design.md`
**Plan:** `docs/superpowers/plans/2026-05-20-voice-mode-avatar.md`
```

- [ ] **Step 2: Overweeg evidence**

Maak (max. 2 evidences vandaag — bekijk eerst wat er al gemaakt is vandaag):
- **Evidence kandidaat A:** Vergelijkingstabel TTS-opties (Piper vs Web Speech vs ElevenLabs) — kolommen: latency, privacy, kosten, kwaliteit, setup
- **Evidence kandidaat B:** Demo-screenshot/recording van voice-modus in actie

Vraag de gebruiker welke (of beide) hij wil maken. Niet automatisch aanmaken.

- [ ] **Step 3: Commit**

```bash
git add portfolio/STAPPEN.md
git commit -m "docs: log voice-mode + avatar implementation in STAPPEN"
```

---

## Verificatie aan het eind

- [ ] **End-to-end smoke-check**

1. `docker compose up -d` — alle containers draaien (postgres, chromadb, ollama, mcp-server, backend, piper-tts)
2. Frontend draait via `npm run dev`
3. Open patiënt-chat → toggle voice-modus aan
4. Avatar verschijnt, mic-knop zichtbaar
5. Type "hoe voel je je vandaag?" → Anna antwoordt → audio speelt af → mond beweegt
6. Klik mic, zeg "ik heb hoofdpijn" → tekst verschijnt in input
7. Toggle uit → terug naar normale chat, audio stopt niet onmiddellijk maar avatar verdwijnt
