"use client";

import { useRef, useEffect, useState } from "react";
import Avatar, { type AvatarHandle } from "./avatar";
import { useSpeechRecognition } from "@/lib/speech";
import { fetchTTS } from "@/lib/tts";

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

        // If the avatar is mounted, hand off playback so it can drive lip-sync
        // from the audio amplitude. Otherwise fall back to a plain <audio> element.
        if (avatarRef.current?.speakAudio) {
          console.log("[VoiceMode] Playing through avatar (lip-sync enabled)");
          await avatarRef.current.speakAudio(blob);
          setIsSpeaking(false);
          return;
        }

        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.onerror = null;
          audioRef.current.onended = null;
        }

        url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          if (url) URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          if (!audio.src) return;
          console.error("[VoiceMode] Audio element error:", audio.error);
          setIsSpeaking(false);
          setError(`Audio playback failed: ${audio.error?.message ?? "unknown"}`);
        };

        await audio.play();
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
      {/* Avatar — only rendered if an avatarUrl is provided. Otherwise show a
          simple visual indicator so the user gets feedback without a dead white canvas. */}
      {avatarUrl ? (
        <Avatar ref={avatarRef} avatarUrl={avatarUrl} />
      ) : (
        <div
          className={`w-full h-[180px] rounded-lg flex flex-col items-center justify-center gap-3 transition-colors ${
            isSpeaking ? "bg-blue-50" : "bg-gray-50"
          }`}
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl ${
              isSpeaking ? "bg-blue-500 text-white animate-pulse" : "bg-gray-300 text-gray-600"
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
