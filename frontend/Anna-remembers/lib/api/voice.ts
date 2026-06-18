import { get, BASE } from "./_base"

export async function listVoiceSamples(): Promise<string[]> {
  const data = await get<{ samples: string[] }>("/tts/voice-samples")
  return data.samples
}

export async function uploadVoiceSample(file: File): Promise<void> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(`${BASE}/tts/voice-samples`, {
    method: "POST",
    body: form,
  })
  if (!res.ok) throw new Error(`API ${res.status} /tts/voice-samples`)
}

export async function deleteVoiceSample(filename: string): Promise<void> {
  const res = await fetch(
    `${BASE}/tts/voice-samples/${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  )
  if (!res.ok)
    throw new Error(`API ${res.status} /tts/voice-samples/${filename}`)
}

export async function migrateEmbeddings(targetProvider: string): Promise<{
  source_provider: string
  target_provider: string
  migrated: number
  errors: number
}> {
  const res = await fetch(`${BASE}/settings/migrate-embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_provider: targetProvider }),
  })
  if (!res.ok)
    throw new Error(`API ${res.status} /settings/migrate-embeddings`)
  return res.json()
}
