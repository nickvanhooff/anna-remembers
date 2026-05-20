"use client";

import { useRef, useEffect, useState } from "react";
import Avatar, { AvatarHandle } from "./avatar";
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
  const { transcript, isListening, isSupported, start, stop } =
    useSpeechRecognition();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-play avatar speech when messageText changes
  useEffect(() => {
    if (!messageText || !avatarRef.current) return;

    const playMessage = async () => {
      try {
        setIsSpeaking(true);
        setError(null);
        const blob = await fetchTTS(messageText);
        await avatarRef.current!.speakAudio(blob, messageText);
      } catch (err) {
        setError(err instanceof Error ? err.message : "TTS failed");
      } finally {
        setIsSpeaking(false);
      }
    };

    playMessage();
  }, [messageText]);

  // Send transcript when listening stops
  useEffect(() => {
    if (!isListening && transcript && onUserSpeech) {
      onUserSpeech(transcript);
    }
  }, [isListening, transcript, onUserSpeech]);

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
