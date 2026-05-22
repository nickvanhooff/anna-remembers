"use client";
import { useEffect, useRef, useState, useCallback } from "react";

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
};
type SpeechRecognitionEvent = {
  results: { [index: number]: SpeechRecognitionResult; length: number };
  resultIndex: number;
};

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

interface UseSpeechRecognitionOptions {
  // Called exactly once when silence is detected after speech.
  onFinalTranscript?: (text: string) => void;
  // How many ms of silence before considering speech finished.
  silenceTimeoutMs?: number;
  language?: string;
}

export function useSpeechRecognition({
  onFinalTranscript,
  silenceTimeoutMs = 3000,
  language = "nl-NL",
}: UseSpeechRecognitionOptions = {}) {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef("");
  const hasSentRef = useRef(false);
  // Keep onFinalTranscript callback fresh without re-creating handlers
  const onFinalTranscriptRef = useRef(onFinalTranscript);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const sendFinalTranscript = useCallback(() => {
    if (hasSentRef.current) return;
    const text = transcriptRef.current.trim();
    if (!text) return;
    hasSentRef.current = true;
    onFinalTranscriptRef.current?.(text);
    // Stop recognition after sending
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      sendFinalTranscript();
    }, silenceTimeoutMs);
  }, [clearSilenceTimer, sendFinalTranscript, silenceTimeoutMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);
    const rec = new Ctor();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (event) => {
      // Concatenate all results into single transcript
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      transcriptRef.current = text;
      setTranscript(text);
      // Reset silence timer on every new sound
      armSilenceTimer();
    };

    rec.onend = () => {
      setIsListening(false);
      clearSilenceTimer();
      // If recognition ended naturally and we have content, send it once
      sendFinalTranscript();
    };

    rec.onerror = (e) => {
      console.error("Speech recognition error", e);
      setIsListening(false);
      clearSilenceTimer();
    };

    recognitionRef.current = rec;

    return () => {
      clearSilenceTimer();
      try {
        rec.abort();
      } catch {
        // ignore
      }
    };
  }, [language, armSilenceTimer, clearSilenceTimer, sendFinalTranscript]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    transcriptRef.current = "";
    hasSentRef.current = false;
    setTranscript("");
    try {
      recognitionRef.current.start();
    } catch {
      // already started — ignore
    }
  }, []);

  const stop = useCallback(() => {
    clearSilenceTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, [clearSilenceTimer]);

  return { transcript, isListening, isSupported, start, stop };
}
