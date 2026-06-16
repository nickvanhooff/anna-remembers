import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Easing } from "remotion";
import { CaptionOverlay } from "./CaptionOverlay";
import { RecordingPlaceholder, RecordingVideo } from "./RecordingVideo";

type SceneCardProps = {
  title: string;
  subtitle: string;
  sceneId: string;
  videoFile?: string; // filename in public/recordings/
  accentColor?: string;
};

export const SceneCard: React.FC<SceneCardProps> = ({
  title,
  subtitle,
  sceneId,
  videoFile,
  accentColor = "#6366f1",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const fadeOut = interpolate(
    frame,
    [durationInFrames - fps * 0.5, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const opacity = Math.min(fadeIn, fadeOut);

  const titleSlide = interpolate(frame, [0, fps * 0.5], [30, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ opacity, background: "#0f172a" }}>
      {/* Screen recording or placeholder */}
      {videoFile ? (
        <RecordingVideo
          filename={videoFile}
          placeholder={
            <RecordingPlaceholder filename={videoFile} accentColor={accentColor} />
          }
        />
      ) : (
        <RecordingPlaceholder filename="scene.mp4" accentColor={accentColor} />
      )}

      {/* Scene label top-left */}
      <AbsoluteFill
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 48,
            transform: `translateY(${titleSlide}px)`,
            background: accentColor,
            color: "#fff",
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            fontWeight: 700,
            padding: "6px 14px",
            borderRadius: 6,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>

        {subtitle ? (
          <div
            style={{
              position: "absolute",
              top: 88,
              left: 48,
              transform: `translateY(${titleSlide}px)`,
              color: "#94a3b8",
              fontFamily: "Inter, sans-serif",
              fontSize: 16,
            }}
          >
            {subtitle}
          </div>
        ) : null}

        <CaptionOverlay sceneId={sceneId} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
