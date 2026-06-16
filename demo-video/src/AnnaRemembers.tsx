import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Easing } from "remotion";
import {
  CHAT_ESCALATION_FRAMES,
  ChatEscalationDiagram,
} from "./architecture/ChatEscalationDiagram";
import {
  SYMPTOM_TRENDS_FRAMES,
  SymptomTrendsDiagram,
} from "./architecture/SymptomTrendsDiagram";
import { SceneCard } from "./scenes/SceneCard";

// Scene durations in seconds → multiply by fps (30) for frames
const S = (seconds: number) => Math.round(seconds * 30);

const SCENE_04_START = S(95);

// Cumulative start times
const SCENES = [
  { start: S(0),   duration: S(20),  sceneId: "01-intro",       title: "Intro",               subtitle: "",                                videoFile: undefined          },
  { start: S(20),  duration: S(15),  sceneId: "02-patients",    title: "Patiënten",           subtitle: "Dashboard overzicht",             videoFile: "02-patients.mp4"  },
  { start: S(35),  duration: S(60),  sceneId: "03-chat-rag",    title: "Chat & RAG Geheugen", subtitle: "Drie-laags contextopbouw",        videoFile: "03-chat-rag.mp4"  },
  { start: SCENE_04_START, duration: CHAT_ESCALATION_FRAMES, sceneId: "04-escalation",  title: "Chat & Escalatie",    subtitle: "RAG-flow + background triage",   videoFile: undefined },
  { start: SCENE_04_START + CHAT_ESCALATION_FRAMES, duration: SYMPTOM_TRENDS_FRAMES, sceneId: "05-trends",      title: "Symptoomtrends",      subtitle: "Apart extractiemodel per sessie", videoFile: undefined },
  { start: SCENE_04_START + CHAT_ESCALATION_FRAMES + S(40), duration: S(50),  sceneId: "06-settings",    title: "Instellingen",        subtitle: "Volledig configureerbaar",        videoFile: "06-settings.mp4"  },
  { start: SCENE_04_START + CHAT_ESCALATION_FRAMES + S(90), duration: S(35),  sceneId: "07-avatar",      title: "Avatar & Voice",      subtitle: "Three.js · XTTS v2 · Web Speech", videoFile: "07-avatar.mp4"    },
  { start: SCENE_04_START + CHAT_ESCALATION_FRAMES + S(125), duration: S(10),  sceneId: "08-outro",       title: "Outro",               subtitle: "",                                videoFile: undefined          },
] as const;

// Outro title card
const OutroCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{
        background: "#0f172a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        opacity,
      }}
    >
      <div
        style={{
          fontSize: 64,
          fontWeight: 800,
          color: "#f1f5f9",
          fontFamily: "Inter, sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        Anna Remembers
      </div>
      <div
        style={{
          fontSize: 22,
          color: "#6366f1",
          fontFamily: "Inter, sans-serif",
          fontStyle: "italic",
        }}
      >
        zodat niets tussen de sessies verloren gaat
      </div>
    </AbsoluteFill>
  );
};

export const AnnaRemembers: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0f172a" }}>
      {SCENES.slice(0, -1).map((scene, i) => (
        <Sequence key={i} from={scene.start} durationInFrames={scene.duration}>
          {scene.sceneId === "04-escalation" ? (
            <ChatEscalationDiagram />
          ) : scene.sceneId === "05-trends" ? (
            <SymptomTrendsDiagram />
          ) : (
            <SceneCard
              title={scene.title}
              subtitle={scene.subtitle}
              sceneId={scene.sceneId}
              videoFile={scene.videoFile}
              accentColor={i === 0 ? "#6366f1" : i % 2 === 0 ? "#0ea5e9" : "#8b5cf6"}
            />
          )}
        </Sequence>
      ))}

      {/* Outro */}
      <Sequence from={SCENES[7].start} durationInFrames={SCENES[7].duration}>
        <OutroCard />
      </Sequence>
    </AbsoluteFill>
  );
};
