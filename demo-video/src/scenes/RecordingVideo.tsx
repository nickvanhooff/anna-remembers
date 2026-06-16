import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Video,
  staticFile,
  useDelayRender,
} from "remotion";

type RecordingVideoProps = {
  filename: string;
  placeholder?: React.ReactNode;
  style?: React.CSSProperties;
};

async function recordingExists(url: string): Promise<boolean> {
  const head = await fetch(url, { method: "HEAD" });
  if (head.ok) return true;
  if (head.status === 404) return false;

  const partial = await fetch(url, { headers: { Range: "bytes=0-0" } });
  return partial.ok || partial.status === 206;
}

export const RecordingPlaceholder: React.FC<{
  filename: string;
  accentColor?: string;
}> = ({ filename, accentColor = "#6366f1" }) => (
  <AbsoluteFill
    style={{
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div
      style={{
        width: 400,
        height: 300,
        border: `2px dashed ${accentColor}44`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.3 }}>🎬</div>
      <div
        style={{
          fontSize: 16,
          color: "#64748b",
          fontFamily: "Inter, sans-serif",
          textAlign: "center",
          padding: "0 16px",
        }}
      >
        Plaats opname: public/recordings/{filename}
      </div>
    </div>
  </AbsoluteFill>
);

/** Renders a screen recording only when the file exists — avoids mediabunny 404 crashes. */
export const RecordingVideo: React.FC<RecordingVideoProps> = ({
  filename,
  placeholder,
  style,
}) => {
  const [available, setAvailable] = useState<boolean | null>(null);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender());

  useEffect(() => {
    const url = staticFile(`recordings/${filename}`);

    recordingExists(url)
      .then(setAvailable)
      .catch(() => setAvailable(false))
      .finally(() => continueRender(handle));
  }, [continueRender, filename, handle]);

  if (!available) {
    return (
      <>
        {placeholder ?? <RecordingPlaceholder filename={filename} />}
      </>
    );
  }

  return (
    <Video
      src={staticFile(`recordings/${filename}`)}
      style={{ width: "100%", height: "100%", objectFit: "cover", ...style }}
    />
  );
};
