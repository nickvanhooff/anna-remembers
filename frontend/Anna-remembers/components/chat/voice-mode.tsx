"use client";

import { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { AvatarHandle } from "./avatar";
import { useSpeechRecognition } from "@/lib/speech";
import { fetchTTS } from "@/lib/tts";

// Dynamically import Avatar component with SSR disabled to avoid bundler errors
// from TalkingHead.js dynamic lipsync module imports
const Avatar = dynamic(() => import("./avatar"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "400px",
        backgroundColor: "#f5f5f5",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p className="text-sm text-gray-500">Loading avatar...</p>
    </div>
  ),
});

interface VoiceModeProps {
  onUserSpeech?: (transcript: string) => void;
  avatarUrl?: string;
  messageText?: string;
}

export function VoiceMode({
  onUserSpeech,
  avatarUrl,
  messageText,
}: VoiceModeProps) {
  const avatarRef = useRef<AvatarHandle>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hook fires onFinalTranscript exactly once per utterance,
  // after 3 seconds of silence (or when the user clicks stop).
  const { transcript, isListening, isSupported, start, stop } =
    useSpeechRecognition({
      silenceTimeoutMs: 3000,
      onFinalTranscript: (text) => {
        onUserSpeech?.(text);
      },
    });

  // Track the last message we played so we don't replay on re-renders
  const lastPlayedRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-play assistant speech when messageText changes
  useEffect(() => {
    if (!messageText) return;
    if (lastPlayedRef.current === messageText) return;
    lastPlayedRef.current = messageText;

    const playMessage = async () => {
      let url: string | null = null;
      try {
        setIsSpeaking(true);
        setError(null);
        console.log("[VoiceMode] Fetching TTS for:", messageText.slice(0, 60));

        const blob = await fetchTTS(messageText);
        console.log("[VoiceMode] Got audio blob, size:", blob.size, "type:", blob.type);

        if (blob.size === 0) {
          throw new Error("Empty audio response from backend");
        }

        // Stop any previous audio
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }

        url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.addEventListener("ended", () => {
          console.log("[VoiceMode] Audio finished");
          setIsSpeaking(false);
          if (url) URL.revokeObjectURL(url);
        });
        audio.addEventListener("error", (e) => {
          console.error("[VoiceMode] Audio element error:", e, audio.error);
          setIsSpeaking(false);
          setError(`Audio playback failed: ${audio.error?.message ?? "unknown"}`);
        });

        console.log("[VoiceMode] Calling audio.play()");
        await audio.play();
        console.log("[VoiceMode] Audio playing");
      } catch (err) {
        console.error("[VoiceMode] TTS playback error:", err);
        setError(err instanceof Error ? err.message : "TTS failed");
        setIsSpeaking(false);
        if (url) URL.revokeObjectURL(url);
      }
    };

    playMessage();
  }, [messageText]);

  if (!isSupported) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          Speech recognition is not supported in your browser. Use text mode
          instead.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Avatar */}
      <Avatar ref={avatarRef} avatarUrl={avatarUrl} />

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Microphone button and status */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={isListening ? stop : start}
          disabled={isSpeaking}
          className={`px-6 py-3 rounded-lg font-medium text-white transition-all ${
            isSpeaking
              ? "bg-gray-400 cursor-not-allowed"
              : isListening
                ? "bg-red-500 hover:bg-red-600"
                : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {isSpeaking ? "Doctor speaking..." : isListening ? "Stop listening" : "Push to talk"}
        </button>

        {isListening && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600">Listening...</span>
          </div>
        )}
      </div>

      {/* Transcript display */}
      {transcript && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">You said: {transcript}</p>
        </div>
      )}
    </div>
  );
}
