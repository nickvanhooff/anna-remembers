"use client"

import { useRef, useEffect, useState } from "react"
import Avatar, { type AvatarHandle, type AvatarAnimation } from "./avatar"
import { useSpeechRecognition } from "@/lib/speech"
import { fetchTTS } from "@/lib/tts"

interface VoiceModeProps {
  onUserSpeech?: (transcript: string) => void
  avatarUrl?: string
  messageText?: string
  animation?: AvatarAnimation
}

export function VoiceMode({
  onUserSpeech,
  avatarUrl,
  messageText,
  animation,
}: VoiceModeProps) {
  const avatarRef = useRef<AvatarHandle>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hook fires onFinalTranscript exactly once per utterance,
  // after 3 seconds of silence (or when the user clicks stop).
  const { transcript, isListening, isSupported, start, stop } =
    useSpeechRecognition({
      silenceTimeoutMs: 3000,
      onFinalTranscript: (text) => {
        onUserSpeech?.(text)
      },
    })

  // Track the last message we played so we don't replay on re-renders
  const lastPlayedRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Auto-play assistant speech when messageText changes
  useEffect(() => {
    if (!messageText) return
    if (lastPlayedRef.current === messageText) return
    lastPlayedRef.current = messageText

    const playMessage = async () => {
      let url: string | null = null
      try {
        setIsSpeaking(true)
        setError(null)
        console.log("[VoiceMode] Fetching TTS for:", messageText.slice(0, 60))

        const blob = await fetchTTS(messageText)
        console.log(
          "[VoiceMode] Got audio blob, size:",
          blob.size,
          "type:",
          blob.type
        )

        if (blob.size === 0) {
          throw new Error("Empty audio response from backend")
        }

        // If the avatar is mounted, hand off playback so it can drive lip-sync
        // from the audio amplitude. Otherwise fall back to a plain <audio> element.
        if (avatarRef.current?.speakAudio) {
          console.log("[VoiceMode] Playing through avatar (lip-sync enabled)")
          await avatarRef.current.speakAudio(blob)
          setIsSpeaking(false)
          return
        }

        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.onerror = null
          audioRef.current.onended = null
        }

        url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio

        audio.onended = () => {
          setIsSpeaking(false)
          if (url) URL.revokeObjectURL(url)
        }
        audio.onerror = () => {
          if (!audio.src) return
          console.error("[VoiceMode] Audio element error:", audio.error)
          setIsSpeaking(false)
          setError(
            `Audio playback failed: ${audio.error?.message ?? "unknown"}`
          )
        }

        await audio.play()
      } catch (err) {
        console.error("[VoiceMode] TTS playback error:", err)
        setError(err instanceof Error ? err.message : "TTS failed")
        setIsSpeaking(false)
        if (url) URL.revokeObjectURL(url)
      }
    }

    playMessage()
  }, [messageText])

  if (!isSupported) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800">
          Speech recognition is not supported in your browser. Use text mode
          instead.
        </p>
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {/* Avatar — only rendered if an avatarUrl is provided. Otherwise show a
          simple visual indicator so the user gets feedback without a dead white canvas. */}
      {avatarUrl || animation ? (
        <Avatar ref={avatarRef} avatarUrl={avatarUrl} animation={animation} />
      ) : (
        <div
          className={`flex h-[180px] w-full flex-col items-center justify-center gap-3 rounded-lg transition-colors ${
            isSpeaking ? "bg-blue-50" : "bg-gray-50"
          }`}
        >
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
              isSpeaking
                ? "animate-pulse bg-blue-500 text-white"
                : "bg-gray-300 text-gray-600"
            }`}
          >
            🩺
          </div>
          <p className="text-sm text-gray-600">
            {isSpeaking ? "Anna is aan het woord…" : "Wacht op uw antwoord"}
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Microphone button and status */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={isListening ? stop : start}
          disabled={isSpeaking}
          className={`rounded-lg px-6 py-3 font-medium text-white transition-all ${
            isSpeaking
              ? "cursor-not-allowed bg-gray-400"
              : isListening
                ? "bg-red-500 hover:bg-red-600"
                : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {isSpeaking
            ? "Doctor speaking..."
            : isListening
              ? "Stop listening"
              : "Push to talk"}
        </button>

        {isListening && (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 animate-pulse rounded-full bg-red-500"></div>
            <span className="text-sm text-gray-600">Listening...</span>
          </div>
        )}
      </div>

      {/* Transcript display */}
      {transcript && (
        <div className="max-h-28 overflow-y-auto rounded-lg border border-blue-200 bg-blue-50 p-3 break-words">
          <p className="text-sm text-blue-900">You said: {transcript}</p>
        </div>
      )}
    </div>
  )
}
