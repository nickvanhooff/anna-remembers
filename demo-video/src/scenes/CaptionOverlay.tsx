import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useDelayRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";

const SWITCH_EVERY_MS = 2500;
const HIGHLIGHT_COLOR = "#818cf8"; // indigo-400

const PhraseCaption: React.FC<{
  text: string;
  bottom: number;
  fontSize: number;
}> = ({ text, bottom, fontSize }) => (
  <div
    style={{
      position: "absolute",
      bottom,
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      padding: "0 80px",
    }}
  >
    <div
      style={{
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(4px)",
        borderRadius: 10,
        padding: "10px 20px",
        maxWidth: 900,
        fontSize,
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        lineHeight: 1.35,
        textAlign: "center",
        color: "#f1f5f9",
      }}
    >
      {text}
    </div>
  </div>
);

const CaptionPage: React.FC<{
  page: ReturnType<typeof createTikTokStyleCaptions>["pages"][number];
  bottom: number;
  fontSize: number;
}> = ({ page, bottom, fontSize }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const currentMs = (frame / fps) * 1000;
  const absoluteMs = page.startMs + currentMs;

  return (
    <div
      style={{
        position: "absolute",
        bottom,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 80px",
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(4px)",
          borderRadius: 10,
          padding: "10px 20px",
          maxWidth: 1100,
          fontSize,
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          lineHeight: 1.35,
          whiteSpace: "pre-wrap",
          color: "#f1f5f9",
        }}
      >
        {page.tokens.map((token) => {
          const active =
            token.fromMs <= absoluteMs && token.toMs > absoluteMs;
          return (
            <span
              key={token.fromMs}
              style={{ color: active ? HIGHLIGHT_COLOR : "#f1f5f9" }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const CaptionOverlay: React.FC<{
  sceneId: string;
  bottom?: number;
  fontSize?: number;
  /** phrase = één korte zin per caption-entry; tiktok = woord-voor-woord */
  mode?: "phrase" | "tiktok";
}> = ({ sceneId, bottom = 80, fontSize = 32, mode = "tiktok" }) => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender());

  const fetchCaptions = useCallback(async () => {
    try {
      const res = await fetch(staticFile(`captions/${sceneId}.json`));
      setCaptions(await res.json());
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [continueRender, cancelRender, handle, sceneId]);

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  const { pages } = useMemo(() => {
    if (!captions) return { pages: [] };
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: SWITCH_EVERY_MS,
    });
  }, [captions]);

  const { fps } = useVideoConfig();

  if (mode === "phrase" && captions) {
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {captions.map((caption, i) => {
          const startFrame = (caption.startMs / 1000) * fps;
          const dur = ((caption.endMs - caption.startMs) / 1000) * fps;
          if (dur <= 0) return null;
          return (
            <Sequence
              key={`${caption.startMs}-${i}`}
              from={startFrame}
              durationInFrames={dur}
              layout="none"
            >
              <PhraseCaption
                text={caption.text.trim()}
                bottom={bottom}
                fontSize={fontSize}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {pages.map((page, i) => {
        const next = pages[i + 1] ?? null;
        const startFrame = (page.startMs / 1000) * fps;
        const endFrame = Math.min(
          next ? (next.startMs / 1000) * fps : Infinity,
          startFrame + (SWITCH_EVERY_MS / 1000) * fps
        );
        const dur = endFrame - startFrame;
        if (dur <= 0) return null;
        return (
          <Sequence key={i} from={startFrame} durationInFrames={dur} layout="none">
            <CaptionPage page={page} bottom={bottom} fontSize={fontSize} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
