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
