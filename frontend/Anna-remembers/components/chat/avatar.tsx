"use client";

import { forwardRef, useEffect, useRef, useImperativeHandle } from "react";

// TalkingHead is loaded dynamically at runtime to avoid bundler issues
// with its dynamic lipsync module imports (lipsync-en.mjs, lipsync-nl.mjs, etc.)

export interface AvatarHandle {
  speakAudio(blob: Blob, text: string): Promise<void>;
}

interface AvatarProps {
  avatarUrl?: string;
}

const Avatar = forwardRef<AvatarHandle, AvatarProps>(
  ({ avatarUrl }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const talkingHeadRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      let cancelled = false;

      // Dynamically import TalkingHead to avoid bundler issues with dynamic lipsync imports
      import("@met4citizen/talkinghead")
        .then(({ TalkingHead }) => {
          if (cancelled) return;

          // TalkingHead manages its own Three.js scene; pass it the container DOM node
          const talkingHead = new TalkingHead(container, {
            ttsEndpoint: "",
            cameraView: "upper",
          });

          talkingHeadRef.current = talkingHead;

          // Only try to load an avatar model if a URL was explicitly provided.
          // Without a valid Ready Player Me URL the GLB fetch fails noisily;
          // the audio playback works fine without an avatar.
          if (avatarUrl) {
            talkingHead
              .showAvatar({
                url: avatarUrl,
                body: "F",
                avatarMood: "neutral",
                lipsyncLang: "en",
              })
              .catch((err: Error) => {
                console.warn("[Avatar] Could not load avatar model:", err.message);
              });
          }
        })
        .catch((err) => {
          console.error("Failed to load TalkingHead:", err);
        });

      return () => {
        cancelled = true;
        if (talkingHeadRef.current) {
          try {
            talkingHeadRef.current.stop?.();
          } catch (err) {
            console.error("Error stopping TalkingHead:", err);
          }
          talkingHeadRef.current = null;
        }
        // Clear container children
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      };
    }, [avatarUrl]);

    useImperativeHandle(
      ref,
      () => ({
        async speakAudio(blob: Blob, text: string) {
          if (!talkingHeadRef.current) {
            // Fallback: just play the audio if TalkingHead isn't loaded
            const audio = new Audio(URL.createObjectURL(blob));
            await audio.play();
            return;
          }

          try {
            // Initialize audio context
            if (!audioContextRef.current) {
              audioContextRef.current = new (window.AudioContext ||
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).webkitAudioContext)();
            }

            // Decode audio
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

            // Try to use TalkingHead's speakAudio method if available
            if (typeof talkingHeadRef.current.speakAudio === "function") {
              await talkingHeadRef.current.speakAudio({
                audio: audioBuffer,
                words: text.split(" "),
              });
            } else {
              // Fallback: just play the audio
              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContextRef.current.destination);
              source.start(0);
            }
          } catch (err) {
            console.error("Error in speakAudio:", err);
            // Fallback: play raw audio
            const audio = new Audio(URL.createObjectURL(blob));
            await audio.play();
          }
        },
      }),
      []
    );

    return (
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "400px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          overflow: "hidden",
          position: "relative",
        }}
      />
    );
  }
);

Avatar.displayName = "Avatar";

export default Avatar;
