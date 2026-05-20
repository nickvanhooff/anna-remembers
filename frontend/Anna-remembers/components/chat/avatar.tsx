"use client";

import { forwardRef, useEffect, useRef, useImperativeHandle } from "react";
import * as THREE from "three";
import type { TalkingHead as TalkingHeadType } from "@met4citizen/talkinghead";

// Use dynamic require to avoid bundling issues with lipsync modules
let TalkingHead: typeof TalkingHeadType;

export interface AvatarHandle {
  speakAudio(blob: Blob, text: string): Promise<void>;
}

interface AvatarProps {
  avatarUrl?: string;
}

const Avatar = forwardRef<AvatarHandle, AvatarProps>(
  ({ avatarUrl = "https://models.readyplayer.me/DEFAULT_AVATAR.glb" }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const talkingHeadRef = useRef<TalkingHead | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      // Initialize Three.js scene
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.z = 2.5;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setClearColor(0xffffff, 1);
      containerRef.current.appendChild(renderer.domElement);

      // Animation loop - will update if talkingHead is initialized
      let animationId: number;
      const animate = () => {
        animationId = requestAnimationFrame(animate);
        if (talkingHeadRef.current) {
          talkingHeadRef.current.update();
        }
        renderer.render(scene, camera);
      };
      animate();

      // Dynamically import TalkingHead to avoid bundler issues with dynamic lipsync imports
      import("@met4citizen/talkinghead")
        .then(({ TalkingHead: TH }) => {
          TalkingHead = TH;

          // Initialize TalkingHead
          const talkingHead = new TalkingHead(scene, {
            modelUrl: avatarUrl,
            cameraTarget: new THREE.Vector3(0, 0.1, 0),
          });

          talkingHeadRef.current = talkingHead;
        })
        .catch((err) => {
          console.error("Failed to load TalkingHead:", err);
        });

      // Handle resize
      const handleResize = () => {
        const newWidth = containerRef.current?.clientWidth ?? width;
        const newHeight = containerRef.current?.clientHeight ?? height;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        cancelAnimationFrame(animationId);
        if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
          containerRef.current.removeChild(renderer.domElement);
        }
      };
    }, [avatarUrl]);

    useImperativeHandle(
      ref,
      () => ({
        async speakAudio(blob: Blob, text: string) {
          if (!talkingHeadRef.current) return;

          // Initialize audio context
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext ||
              (window as any).webkitAudioContext)();
          }

          // Decode audio
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await audioContextRef.current.decodeAudioData(
            arrayBuffer
          );

          // Extract visemes using simple energy-based approach
          const visemes = extractVisemes(audioBuffer, text);

          // Play audio and animate
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);
          source.start(0);

          // Animate avatar with visemes
          animateWithVisemes(visemes, audioBuffer.duration);
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
        }}
      />
    );
  }
);

Avatar.displayName = "Avatar";

function extractVisemes(
  audioBuffer: AudioBuffer,
  text: string
): { viseme: string; time: number }[] {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const frameSize = Math.floor(sampleRate / 30); // ~30 FPS

  const visemeMap: { [key: string]: string } = {
    a: "viseme_aa",
    e: "viseme_E",
    i: "viseme_I",
    o: "viseme_O",
    u: "viseme_U",
    m: "viseme_M",
  };

  const visemes = [];
  let visemeIndex = 0;
  const textVisemes = text.toLowerCase().split("");

  for (let i = 0; i < channelData.length; i += frameSize) {
    const frame = channelData.slice(i, i + frameSize);
    const energy = frame.reduce((sum, val) => sum + val * val, 0) / frame.length;

    if (energy > 0.01) {
      const char = textVisemes[visemeIndex % textVisemes.length];
      const viseme = visemeMap[char] || "viseme_neutral";
      visemes.push({
        viseme,
        time: i / sampleRate,
      });
      visemeIndex++;
    }
  }

  return visemes;
}

function animateWithVisemes(
  visemes: { viseme: string; time: number }[],
  duration: number
): void {
  // Simplified animation: apply visemes over time
  // In production, synchronize with TalkingHead.js morphTargets
  visemes.forEach((v) => {
    if (v.time < duration) {
      // Schedule viseme update at v.time (requires TalkingHead morphTarget binding)
    }
  });
}

export default Avatar;
