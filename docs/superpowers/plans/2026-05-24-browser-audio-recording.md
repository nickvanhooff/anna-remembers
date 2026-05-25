# Browser Audio Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voeg een "Opnemen" knop toe aan de Stemsamples card waarmee de gebruiker direct via de microfoon een stemopname maakt en deze automatisch uploadt naar de backend.

**Architecture:** Een nieuwe `useAudioRecorder` hook beheert de MediaRecorder lifecycle (starten, stoppen, chunks verzamelen, uploaden). De hook geeft een `state` terug (`"idle" | "recording" | "uploading"`) en roept de bestaande `uploadVoiceSample` API-functie aan zodra de opname stopt. De browser neemt op in WebM/Opus — het bestaande ffmpeg-conversieplan converteert dat al naar WAV, dus er zijn geen backend-wijzigingen nodig.

**Tech Stack:** MediaRecorder API (browser-native), React `useRef`/`useState`, lucide-react `Mic`/`Square` iconen, bestaande `uploadVoiceSample` functie in `lib/api.ts`

---

## File Map

| File | Wijziging |
|---|---|
| `frontend/Anna-remembers/hooks/useAudioRecorder.ts` | NEW — hook die MediaRecorder beheert |
| `frontend/Anna-remembers/components/settings/settings-screen.tsx` | MODIFY — "Opnemen" knop + timer toevoegen |

Geen backend-wijzigingen — `.webm` staat al in `ALLOWED_EXTENSIONS` van `audio_converter.py`.

---

## Task 1: `useAudioRecorder` hook

**Files:**
- Create: `frontend/Anna-remembers/hooks/useAudioRecorder.ts`

De hook heeft geen tests (geen Jest-setup in dit project). Validatie = TypeScript check + handmatig testen.

- [ ] **Stap 1: Maak de hook aan**

```typescript
// frontend/Anna-remembers/hooks/useAudioRecorder.ts
"use client"

import { useRef, useState } from "react"
import { uploadVoiceSample } from "@/lib/api"

export type RecorderState = "idle" | "recording" | "uploading"

export interface UseAudioRecorder {
  state: RecorderState
  seconds: number
  error: string | null
  startRecording: () => Promise<void>
  stopRecording: () => void
}

export function useAudioRecorder(
  onUploaded: () => void
): UseAudioRecorder {
  const [state, setState] = useState<RecorderState>("idle")
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      setSeconds(0)

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())

        const mimeType = mr.mimeType || "audio/webm"
        const blob = new Blob(chunksRef.current, { type: mimeType })

        // Gebruik .ogg extensie voor Firefox (neemt op in audio/ogg), anders .webm
        const ext = mimeType.includes("ogg") ? ".ogg" : ".webm"
        const filename = `opname-${Date.now()}${ext}`
        const file = new File([blob], filename, { type: mimeType })

        setState("uploading")
        if (timerRef.current) clearInterval(timerRef.current)

        try {
          await uploadVoiceSample(file)
          onUploaded()
        } catch {
          setError("Upload van opname mislukt")
        } finally {
          setState("idle")
        }
      }

      mr.start()
      setState("recording")
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError("Microfoon niet beschikbaar — geef toegang in de browser")
      setState("idle")
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }

  return { state, seconds, error, startRecording, stopRecording }
}
```

- [ ] **Stap 2: TypeScript check**

```bash
cd frontend/Anna-remembers && npx tsc --noEmit
```

Verwacht: geen fouten.

- [ ] **Stap 3: Commit**

```bash
git add frontend/Anna-remembers/hooks/useAudioRecorder.ts
git commit -m "feat: add useAudioRecorder hook with MediaRecorder and auto-upload"
```

---

## Task 2: Opnemen-knop in de settings screen

**Files:**
- Modify: `frontend/Anna-remembers/components/settings/settings-screen.tsx`

- [ ] **Stap 1: Vervang de volledige inhoud van `settings-screen.tsx`**

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Settings2, Square, Trash2, Upload } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSettings, updateSetting, listVoiceSamples, uploadVoiceSample, deleteVoiceSample } from "@/lib/api"
import { useAudioRecorder } from "@/hooks/useAudioRecorder"
import type { Settings } from "@/types"

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [samples, setSamples] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { state: recorderState, seconds, error: recorderError, startRecording, stopRecording } =
    useAudioRecorder(async () => {
      setSamples(await listVoiceSamples())
    })

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => setError("Instellingen konden niet worden geladen"))
    listVoiceSamples()
      .then(setSamples)
      .catch(() => setError("Stemsamples konden niet worden geladen"))
  }, [])

  async function toggleTwilio(enabled: boolean) {
    if (!settings) return
    const newValue = enabled ? "true" : "false"
    setSettings({ ...settings, twilio_sms_enabled: newValue as "true" | "false" })
    try {
      await updateSetting("twilio_sms_enabled", newValue)
    } catch {
      setSettings(settings)
      setError("Instelling kon niet worden opgeslagen")
    }
  }

  async function changeTtsProvider(provider: "piper" | "xtts") {
    if (!settings) return
    setSettings({ ...settings, tts_provider: provider })
    try {
      await updateSetting("tts_provider", provider)
    } catch {
      setSettings(settings)
      setError("Instelling kon niet worden opgeslagen")
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await uploadVoiceSample(file)
      setSamples(await listVoiceSamples())
    } catch {
      setError("Upload mislukt")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function handleDelete(filename: string) {
    setError(null)
    try {
      await deleteVoiceSample(filename)
      setSamples((prev) => prev.filter((s) => s !== filename))
    } catch {
      setError(`Verwijderen van ${filename} mislukt`)
    }
  }

  const busy = uploading || recorderState !== "idle"
  const displayError = error ?? recorderError

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2.5 mb-6">
        <Settings2 className="size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Instellingen</h1>
      </div>

      {displayError && (
        <p className="text-sm text-destructive mb-4">{displayError}</p>
      )}

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notificaties</CardTitle>
            <CardDescription>Beheer hoe escalaties worden doorgegeven aan zorgverleners</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Twilio SMS</p>
                <p className="text-xs text-muted-foreground">Stuur automatisch SMS bij escalaties</p>
              </div>
              <Switch
                checked={settings?.twilio_sms_enabled === "true"}
                onCheckedChange={toggleTwilio}
                disabled={settings === null}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stem (TTS)</CardTitle>
            <CardDescription>Kies welke Text-to-Speech service Anna gebruikt</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">TTS Provider</p>
                <p className="text-xs text-muted-foreground">
                  Piper: snel, offline &nbsp;·&nbsp; XTTS: stemkloning, vereist GPU
                </p>
              </div>
              <Select
                value={settings?.tts_provider ?? "xtts"}
                onValueChange={(v) => changeTtsProvider(v as "piper" | "xtts")}
                disabled={settings === null}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xtts">XTTS v2</SelectItem>
                  <SelectItem value="piper">Piper</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stemsamples (XTTS)</CardTitle>
            <CardDescription>
              WAV-bestanden in deze lijst worden gebruikt als stemreferentie door XTTS v2.
              Meerdere clips geven een betere kwaliteit.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {samples.length === 0 ? (
              <p className="text-xs text-muted-foreground">Geen stemsamples gevonden.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {samples.map((name) => (
                  <li key={name} className="flex items-center justify-between py-1 border-b last:border-0">
                    <span className="text-sm font-mono">{name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(name)}
                      disabled={busy}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2 flex-wrap">
              <input
                ref={fileRef}
                type="file"
                accept=".wav,.mp3,.m4a,.ogg,.webm,.flac,.aac,audio/*"
                className="hidden"
                onChange={handleUpload}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4 mr-2" />
                {uploading ? "Converteren..." : "Audio uploaden"}
              </Button>

              {recorderState === "recording" ? (
                <Button variant="destructive" size="sm" onClick={stopRecording}>
                  <Square className="size-4 mr-2" />
                  Stop ({seconds}s)
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={startRecording}
                >
                  <Mic className="size-4 mr-2" />
                  {recorderState === "uploading" ? "Uploaden..." : "Opnemen"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Stap 2: TypeScript check**

```bash
cd frontend/Anna-remembers && npx tsc --noEmit
```

Verwacht: geen fouten.

- [ ] **Stap 3: Handmatig testen**

1. Open `http://localhost:3001/settings`
2. Scroll naar de Stemsamples card — je ziet nu twee knoppen: "Audio uploaden" en "Opnemen"
3. Klik "Opnemen" — browser vraagt microfoontoestemming, geef die
4. Spreek iets in, wacht 5–10 seconden
5. Klik "Stop (Ns)" — de knop toont kort "Uploaden..."
6. Na upload staat een nieuw bestand in de lijst (bijv. `opname-1716500000000.wav`)
7. Controleer dat het bestand in `./tts_voice/` staat:
   ```bash
   ls ./tts_voice/
   ```
8. Test dat de "Opnemen" knop disabled is tijdens bestandsupload en vice versa

- [ ] **Stap 4: Commit**

```bash
git add frontend/Anna-remembers/components/settings/settings-screen.tsx
git commit -m "feat: add microphone recording button to voice samples settings"
```

---

## Scope check (self-review)

- ✅ Hook beheert MediaRecorder lifecycle volledig (stream openen, chunks verzamelen, stream sluiten)
- ✅ Firefox-compatibel: `.ogg` extensie als mimeType `audio/ogg` bevat, anders `.webm`
- ✅ Foutmelding als microfoon niet beschikbaar (geen toestemming of hardware ontbreekt)
- ✅ Timer toont hoeveel seconden opgenomen
- ✅ "Stop"-knop toont seconden zodat gebruiker weet hoe lang de opname is
- ✅ Upload-knop en opnemen-knop zijn wederzijds disabled via `busy` flag
- ✅ Na succesvolle upload wordt de lijst ververst via `listVoiceSamples()`
- ✅ Geen backend-wijzigingen nodig — `.webm` en `.ogg` staan al in `ALLOWED_EXTENSIONS`
- ✅ `recorderError` wordt samen met `error` getoond via `displayError`
