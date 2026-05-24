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
