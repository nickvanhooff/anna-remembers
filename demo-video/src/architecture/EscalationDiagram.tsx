import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CaptionOverlay } from "../scenes/CaptionOverlay";
import { RecordingVideo } from "../scenes/RecordingVideo";

const RECORDING = "04-escalation.mp4";
/** Diagram-overlay zichtbaar tot ~13s; daarna alleen opname + captions */
const DIAGRAM_FADE_END = 400;
const ESCALATION_SEGMENT_FRAMES = 480;

/** Zoom op achtergrond-track (triage → escalatie → Twilio) */
const ZOOM_IN_START = 105;
const ZOOM_IN_END = 130;
const ZOOM_OUT_START = 365;
const ZOOM_OUT_END = 395;
const ZOOM_SCALE = 1.55;
const ZOOM_ORIGIN_X = 1285;
const ZOOM_ORIGIN_Y = 700;

function backgroundTaskZoom(frame: number, enabled: boolean): number {
  if (!enabled) return 1;
  if (frame < ZOOM_IN_START) return 1;
  if (frame < ZOOM_IN_END) {
    return interpolate(frame, [ZOOM_IN_START, ZOOM_IN_END], [1, ZOOM_SCALE], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }
  if (frame < ZOOM_OUT_START) return ZOOM_SCALE;
  if (frame < ZOOM_OUT_END) {
    return interpolate(frame, [ZOOM_OUT_START, ZOOM_OUT_END], [ZOOM_SCALE, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }
  return 1;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

const NW = 220;
const NH = 68;

const NODES = {
  user:     { x: 140,  y: 500, label: "Patiënt",              sub: "browser · Web Speech",         color: "#94a3b8", icon: "👤" },
  fastapi:  { x: 500,  y: 500, label: "Backend API",           sub: "FastAPI :8000",                color: "#4ade80", icon: "⚡" },
  main_llm: { x: 920,  y: 250, label: "Hoofd LLM",             sub: "qwen2.5 / Portkey ☁",          color: "#facc15", icon: "🤖" },
  triage:   { x: 920,  y: 700, label: "Triage Model",          sub: "qwen2.5:3b · BackgroundTask",  color: "#f97316", icon: "🔍" },
  escalate: { x: 1290, y: 700, label: "escalate_to_human()",   sub: "MCP tool · urgency: dringend", color: "#ef4444", icon: "🚨" },
  twilio:   { x: 1655, y: 700, label: "Twilio SMS",            sub: "cloud · escalatie notificatie",color: "#ec4899", icon: "📱" },
} as const;

type NodeKey = keyof typeof NODES;
const NODE_ORDER: NodeKey[] = ["user", "fastapi", "main_llm", "triage", "escalate", "twilio"];

// ─── Edges ────────────────────────────────────────────────────────────────────

const EDGES: { from: NodeKey; to: NodeKey; transport: string; dashed?: boolean }[] = [
  { from: "user",     to: "fastapi",  transport: "POST /api/chat" },
  { from: "fastapi",  to: "main_llm", transport: "HTTP async (LLM)" },
  { from: "fastapi",  to: "triage",   transport: "BackgroundTask.add_task()", dashed: true },
  { from: "triage",   to: "escalate", transport: "score ≥ drempel",           dashed: true },
  { from: "escalate", to: "twilio",   transport: "Twilio REST API" },
];

// ─── Packets ──────────────────────────────────────────────────────────────────

type Packet = { from: NodeKey; to: NodeKey; start: number; end: number; label: string; urgent?: boolean };

const PACKETS: Packet[] = [
  { from: "user",     to: "fastapi",  start: 65,  end: 100, label: "bericht + sessie_id" },
  { from: "fastapi",  to: "main_llm", start: 112, end: 155, label: "assembled prompt (3 lagen)" },
  { from: "fastapi",  to: "triage",   start: 112, end: 152, label: "create_task(score_urgency)" },
  { from: "triage",   to: "escalate", start: 230, end: 264, label: "score: 8 ≥ drempel 7 ⚠", urgent: true },
  { from: "escalate", to: "twilio",   start: 268, end: 302, label: "escalate_to_human('dringend')", urgent: true },
  { from: "main_llm", to: "fastapi",  start: 272, end: 308, label: "antwoord gegenereerd" },
];

// ─── Phase labels ─────────────────────────────────────────────────────────────

const PHASES: { start: number; end: number; text: string }[] = [
  { start: 50,  end: 72,  text: "① Patiënt stuurt bericht naar FastAPI" },
  { start: 70,  end: 175, text: "② Fork: hoofd-LLM antwoordt + triage model scoort urgentie parallel" },
  { start: 170, end: 270, text: "③ Score: 8/10 — drempel (7) overschreden → escalatie getriggerd" },
  { start: 265, end: 390, text: "④ Twilio SMS verstuurd — zorgverlener direct genotificeerd" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ease(frame: number, start: number, dur: number) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

function getEdgePoints(from: NodeKey, to: NodeKey) {
  const s = NODES[from];
  const d = NODES[to];
  const dx = d.x - s.x;
  return {
    x1: dx >= 0 ? s.x + NW / 2 : s.x - NW / 2,
    y1: s.y,
    x2: dx >= 0 ? d.x - NW / 2 : d.x + NW / 2,
    y2: d.y,
  };
}

function bezierAt(t: number, x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const ti = 1 - t;
  return {
    x: ti * ti * ti * x1 + 3 * ti * ti * t * mx + 3 * ti * t * t * mx + t * t * t * x2,
    y: ti * ti * ti * y1 + 3 * ti * ti * t * y1 + 3 * ti * t * t * y2 + t * t * t * y2,
  };
}

// ─── Node ─────────────────────────────────────────────────────────────────────

const EscNode: React.FC<{ nodeKey: NodeKey; appearFrame: number }> = ({ nodeKey, appearFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const node = NODES[nodeKey];

  const op = ease(frame, appearFrame, fps * 0.5);
  const ty = interpolate(frame, [appearFrame, appearFrame + fps * 0.5], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const isActive = PACKETS.some(
    (p) =>
      (p.to === nodeKey && frame >= p.end - 3 && frame <= p.end + 45) ||
      (p.from === nodeKey && frame >= p.start && frame <= p.start + 18)
  );

  // Escalation-related nodes pulse red after the score threshold is crossed
  const isEscActive =
    (nodeKey === "triage" && frame >= 230 && frame <= 400) ||
    (nodeKey === "escalate" && frame >= 262 && frame <= 400) ||
    (nodeKey === "twilio" && frame >= 300 && frame <= 420);

  const borderColor = isEscActive
    ? node.color
    : isActive
    ? node.color
    : node.color + "44";

  return (
    <div
      style={{
        position: "absolute",
        left: node.x - NW / 2,
        top: node.y - NH / 2,
        width: NW,
        height: NH,
        opacity: op,
        transform: `translateY(${ty}px)`,
      }}
    >
      {(isActive || isEscActive) && (
        <div
          style={{
            position: "absolute",
            inset: -8,
            borderRadius: 14,
            background: node.color,
            opacity: isEscActive ? 0.28 : 0.2,
            filter: "blur(18px)",
          }}
        />
      )}
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1e293b",
          border: `2px solid ${borderColor}`,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
          boxSizing: "border-box",
        }}
      >
        <span style={{ fontSize: 22 }}>{node.icon}</span>
        <div>
          <div
            style={{
              color: node.color,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "Inter, sans-serif",
              lineHeight: 1.2,
            }}
          >
            {node.label}
          </div>
          <div
            style={{
              color: "#475569",
              fontSize: 10,
              fontFamily: "Inter, sans-serif",
              marginTop: 2,
            }}
          >
            {node.sub}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Static edge ──────────────────────────────────────────────────────────────

const StaticEdge: React.FC<{
  from: NodeKey;
  to: NodeKey;
  transport: string;
  dashed?: boolean;
  appearFrame: number;
}> = ({ from, to, transport, dashed, appearFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { x1, y1, x2, y2 } = getEdgePoints(from, to);
  const mx = (x1 + x2) / 2;
  const pathD = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const pathLen = Math.sqrt(dx * dx + dy * dy) * 1.2;

  const progress = ease(frame, appearFrame, fps * 0.7);
  const dashOffset = dashed ? undefined : pathLen * (1 - progress);
  const lineOpacity = dashed ? progress : 1;
  const labelOp = interpolate(
    frame,
    [appearFrame + fps * 0.8, appearFrame + fps * 1.1],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const labelX = mx;
  const labelY = (y1 + y2) / 2 + (y2 > y1 ? -14 : 20);

  // Highlight escalation path after threshold breach
  const isEscPath =
    (from === "triage" && to === "escalate") ||
    (from === "escalate" && to === "twilio");
  const escHighlight =
    isEscPath && frame >= 228
      ? interpolate(frame, [228, 250], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 0;

  const strokeColor = escHighlight > 0.5 ? NODES[from].color : "#1e3a5f";

  return (
    <g>
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={escHighlight > 0.5 ? 2.5 : 1.5}
        strokeDasharray={dashed ? "6 4" : `${pathLen}`}
        strokeDashoffset={dashOffset}
        opacity={lineOpacity}
        markerEnd="url(#esc-arrow)"
      />
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        fill="#334155"
        fontSize={11}
        fontFamily="Inter, sans-serif"
        opacity={labelOp}
      >
        {transport}
      </text>
    </g>
  );
};

// ─── Traveling packet (dot only) ──────────────────────────────────────────────

const TravelingPacket: React.FC<{ packet: Packet }> = ({ packet }) => {
  const frame = useCurrentFrame();
  if (frame < packet.start || frame > packet.end + 8) return null;

  const t = interpolate(frame, [packet.start, packet.end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const { x1, y1, x2, y2 } = getEdgePoints(packet.from, packet.to);
  const { x, y } = bezierAt(t, x1, y1, x2, y2);

  const dotOp = interpolate(
    frame,
    [packet.start, packet.start + 6, packet.end, packet.end + 8],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const color = packet.urgent ? "#ef4444" : NODES[packet.from].color;
  const r = packet.urgent ? 9 : 7;

  return (
    <g opacity={dotOp}>
      <circle cx={x} cy={y} r={r + 8} fill={color} opacity={0.22} />
      <circle cx={x} cy={y} r={r} fill={color} />
    </g>
  );
};

// ─── Packet label (HTML layer) ────────────────────────────────────────────────

const PacketLabel: React.FC<{ packet: Packet }> = ({ packet }) => {
  const frame = useCurrentFrame();
  if (frame < packet.start || frame > packet.end + 8) return null;

  const t = interpolate(frame, [packet.start, packet.end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const { x1, y1, x2, y2 } = getEdgePoints(packet.from, packet.to);
  const { x, y } = bezierAt(t, x1, y1, x2, y2);

  const op = interpolate(
    frame,
    [packet.start + 8, packet.start + 18, packet.end - 8, packet.end + 4],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const color = packet.urgent ? "#ef4444" : NODES[packet.from].color;
  const lw = 320;

  return (
    <div
      style={{
        position: "absolute",
        left: x - lw / 2,
        top: y - 62,
        width: lw,
        opacity: op,
        background: "#0d1420",
        border: `1.5px solid ${color}88`,
        borderRadius: 8,
        padding: "6px 16px",
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color,
        textAlign: "center",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        boxShadow: `0 0 20px ${color}33`,
      }}
    >
      {packet.label}
    </div>
  );
};

// ─── Fork annotation ──────────────────────────────────────────────────────────

const ForkAnnotation: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 100 || frame > 165) return null;

  const op = interpolate(frame, [100, 112, 155, 165], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const { x, y } = NODES.fastapi;

  return (
    <div
      style={{
        position: "absolute",
        left: x - NW / 2 - 5,
        top: y - NH / 2 - 44,
        opacity: op,
        background: "#1e293b",
        border: "1px solid #4ade8055",
        borderRadius: 6,
        padding: "5px 14px",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        color: "#4ade80",
        whiteSpace: "nowrap",
      }}
    >
      async LLM call + BackgroundTask.add_task()
    </div>
  );
};

// ─── Main LLM thinking pulse ──────────────────────────────────────────────────

const MainLlmThinking: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 155 || frame > 278) return null;

  const op = interpolate(frame, [155, 166, 268, 278], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse = 0.5 + 0.5 * Math.sin((frame - 155) * 0.22);
  const { x, y } = NODES.main_llm;

  return (
    <g opacity={op}>
      <circle cx={x} cy={y} r={50 + pulse * 20} fill={NODES.main_llm.color} opacity={0.06 + pulse * 0.05} />
      <text
        x={x}
        y={y - 58}
        textAnchor="middle"
        fill={NODES.main_llm.color}
        fontSize={13}
        fontFamily="Inter, sans-serif"
        fontWeight={600}
      >
        ✦ antwoord genereren...
      </text>
    </g>
  );
};

// ─── Urgency score display ────────────────────────────────────────────────────

const ScoreDisplay: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 148 || frame > 390) return null;

  const rawScore = interpolate(frame, [152, 226], [0, 8.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const score = Math.min(Math.floor(rawScore), 8);
  const breached = score >= 7;

  const fadeIn = interpolate(frame, [148, 162], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [375, 390], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const op = Math.min(fadeIn, fadeOut);

  const alertPulse =
    breached ? 0.5 + 0.5 * Math.sin((frame - 228) * 0.25) : 0;

  const borderColor = breached
    ? `rgba(239,68,68,${0.45 + alertPulse * 0.55})`
    : "#f9731633";
  const scoreColor =
    score >= 8 ? "#ef4444" : score >= 7 ? "#f97316" : score >= 5 ? "#facc15" : "#4ade80";

  const { x, y } = NODES.triage;

  return (
    <div
      style={{
        position: "absolute",
        left: x - NW / 2 - 308,
        top: y - 88,
        width: 260,
        opacity: op,
        background: "#0d1420",
        border: `2px solid ${borderColor}`,
        borderRadius: 10,
        padding: "14px 20px",
        fontFamily: "Inter, sans-serif",
        pointerEvents: "none",
        boxShadow: breached ? `0 0 28px rgba(239,68,68,${alertPulse * 0.35})` : "none",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#64748b",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Urgentiescore
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 44,
            fontWeight: 800,
            color: scoreColor,
            lineHeight: 1,
          }}
        >
          {score}
        </span>
        <span style={{ fontSize: 20, color: "#475569" }}>/10</span>
      </div>
      {/* Progress bar */}
      <div
        style={{
          height: 7,
          background: "#1e293b",
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${score * 10}%`,
            background: scoreColor,
            borderRadius: 4,
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: "#475569" }}>drempel: 7</div>
      {breached && (
        <div
          style={{
            marginTop: 10,
            padding: "6px 10px",
            background: "#ef444422",
            border: "1px solid #ef444466",
            borderRadius: 6,
            fontSize: 12,
            color: "#ef4444",
            fontWeight: 700,
          }}
        >
          ⚠ DREMPEL OVERSCHREDEN
        </div>
      )}
    </div>
  );
};

// ─── Track labels (upper / lower) ─────────────────────────────────────────────

const TrackLabels: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 110 || frame > 420) return null;

  const op = interpolate(frame, [110, 125], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 620,
          top: NODES.main_llm.y - NH / 2 - 38,
          opacity: op,
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          color: "#facc15",
          fontWeight: 600,
          background: "#facc1515",
          border: "1px solid #facc1533",
          borderRadius: 6,
          padding: "4px 14px",
          whiteSpace: "nowrap",
        }}
      >
        ✦ Hoofd-track — chat antwoord genereren
      </div>
      <div
        style={{
          position: "absolute",
          left: 620,
          top: NODES.triage.y - NH / 2 - 38,
          opacity: op,
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          color: "#f97316",
          fontWeight: 600,
          background: "#f9731615",
          border: "1px solid #f9731633",
          borderRadius: 6,
          padding: "4px 14px",
          whiteSpace: "nowrap",
        }}
      >
        ⚡ Achtergrond-track — urgentie beoordelen
      </div>
    </>
  );
};

// ─── Phase label ──────────────────────────────────────────────────────────────

const PhaseLabel: React.FC = () => {
  const frame = useCurrentFrame();
  const phase = PHASES.find((p) => frame >= p.start && frame <= p.end + 12);
  if (!phase) return null;

  const fadeIn = interpolate(frame, [phase.start, phase.start + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [phase.end, phase.end + 12], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 108,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity: Math.min(fadeIn, fadeOut),
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 8,
          padding: "8px 24px",
          fontFamily: "Inter, sans-serif",
          fontSize: 15,
          color: "#94a3b8",
          maxWidth: 1200,
          textAlign: "center",
        }}
      >
        {phase.text}
      </div>
    </div>
  );
};

// ─── Title ────────────────────────────────────────────────────────────────────

const EscTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const op = ease(frame, 0, 20);

  return (
    <div
      style={{
        position: "absolute",
        top: 32,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: op,
      }}
    >
      <div
        style={{
          fontSize: 32,
          fontWeight: 800,
          color: "#f1f5f9",
          fontFamily: "Inter, sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        Anna Remembers — Escalatiemodel
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#64748b",
          fontFamily: "Inter, sans-serif",
          marginTop: 5,
        }}
      >
        twee modellen parallel · licht triage-model scoort urgentie op de achtergrond
      </div>
    </div>
  );
};

// ─── Root composition ─────────────────────────────────────────────────────────

export const EscalationDiagram: React.FC<{
  embedded?: boolean;
  zoomOnBackgroundTask?: boolean;
}> = ({ embedded = false, zoomOnBackgroundTask = true }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const standaloneOpacity = Math.min(
    interpolate(frame, [0, fps * 0.5], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }),
    interpolate(
      frame,
      [durationInFrames - fps * 0.5, durationInFrames],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    )
  );

  const crossfadeIn = embedded
    ? interpolate(frame, [0, 24], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  const crossfadeOut = embedded
    ? interpolate(
        frame,
        [ESCALATION_SEGMENT_FRAMES - 15, ESCALATION_SEGMENT_FRAMES],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )
    : 1;

  const sceneOpacity = embedded
    ? crossfadeIn * crossfadeOut
    : standaloneOpacity;

  const zoomScale = backgroundTaskZoom(frame, zoomOnBackgroundTask);

  const diagramOpacity = interpolate(
    frame,
    [20, 40, DIAGRAM_FADE_END - 30, DIAGRAM_FADE_END],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const overlayOpacity = interpolate(
    frame,
    [0, DIAGRAM_FADE_END - 30, DIAGRAM_FADE_END],
    [0.82, 0.82, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ background: "#0f172a", opacity: sceneOpacity }}>
      <RecordingVideo
        filename={RECORDING}
        placeholder={<AbsoluteFill style={{ background: "#0f172a" }} />}
      />

      <AbsoluteFill
        style={{
          background: "#0f172a",
          opacity: overlayOpacity,
          pointerEvents: "none",
        }}
      />

      <AbsoluteFill
        style={{
          opacity: diagramOpacity,
          transform: `scale(${zoomScale})`,
          transformOrigin: `${ZOOM_ORIGIN_X}px ${ZOOM_ORIGIN_Y}px`,
        }}
      >
      {/* SVG: edges + dots */}
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <defs>
          <marker
            id="esc-arrow"
            markerWidth="7"
            markerHeight="5"
            refX="7"
            refY="2.5"
            orient="auto"
          >
            <polygon points="0 0, 7 2.5, 0 5" fill="#1e3a5f" />
          </marker>
        </defs>

        {EDGES.map((e, i) => (
          <StaticEdge key={i} {...e} appearFrame={40 + i * 8} />
        ))}

        <MainLlmThinking />

        {PACKETS.map((p, i) => (
          <TravelingPacket key={i} packet={p} />
        ))}
      </svg>

      {/* HTML: nodes */}
      {NODE_ORDER.map((key, i) => (
        <EscNode key={key} nodeKey={key} appearFrame={20 + i * 8} />
      ))}

      {/* HTML: packet labels (always above SVG) */}
      {PACKETS.map((p, i) => (
        <PacketLabel key={i} packet={p} />
      ))}

      {/* HTML: annotations */}
      <ForkAnnotation />
      <TrackLabels />
      <ScoreDisplay />

      {/* HTML: UI */}
      <EscTitle />
      <PhaseLabel />
      </AbsoluteFill>

      <CaptionOverlay
        sceneId="04-escalation"
        mode="phrase"
        bottom={28}
        fontSize={26}
      />
    </AbsoluteFill>
  );
};
