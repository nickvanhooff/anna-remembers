"use client"

import { useEffect, useState } from "react"
import { Settings2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSettings, updateSetting } from "@/lib/api"
import type { Settings } from "@/types"

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => setError("Instellingen konden niet worden geladen"))
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

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2.5 mb-6">
        <Settings2 className="size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Instellingen</h1>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
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
      </div>
    </div>
  )
}
