import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CaptionOverlay } from "../scenes/CaptionOverlay";
import { RecordingVideo } from "../scenes/RecordingVideo";

export const CHAT_ESCALATION_FRAMES = 570;

const RECORDING = "04-escalation.mp4";
const NW = 210;
const NH = 66;

/** Wanneer backend de LLM aanroept, verschijnt de background-task fork */
const BG_TASK_APPEAR = 268;
const ZOOM_IN_START = 278;
const ZOOM_IN_END = 302;
const ZOOM_OUT_START = 518;
const ZOOM_OUT_END = 552;
const ZOOM_SCALE = 1.65;
/** Centrum van achtergrond-track — onder MCP/ChromaDB, niet eroverheen */
const ZOOM_ORIGIN_X = 1280;
const ZOOM_ORIGIN_Y = 900;

type NodeDef = {
  x: number;
  y: number;
  label: string;
  sub: string;
  color: string;
  icon: string;
  bgTrack?: boolean;
};

const NODES = {
  browser:  { x: 150,  y: 500, label: "Gebruiker",           sub: "browser · Web Speech",        color: "#94a3b8", icon: "👤" },
  frontend: { x: 460,  y: 500, label: "Frontend",            sub: "Next.js :3001",               color: "#38bdf8", icon: "⚛️" },
  backend:  { x: 830,  y: 500, label: "Backend API",         sub: "FastAPI :8000",               color: "#4ade80", icon: "⚡" },
  postgres: { x: 1140, y: 240, label: "PostgreSQL",          sub: ":5432  sessies + dossier",    color: "#fb923c", icon: "🗄️" },
  mcp:      { x: 1140, y: 760, label: "MCP Server",          sub: "fastmcp :8001",               color: "#a78bfa", icon: "🔧" },
  chroma:   { x: 1490, y: 760, label: "ChromaDB",            sub: ":8002  RAG vectors",          color: "#f472b6", icon: "🧠" },
  llm:      { x: 1720, y: 420, label: "Hoofd LLM",           sub: "Portkey · chat antwoord",     color: "#facc15", icon: "🤖" },
  /** Achtergrond-track: eigen rij onder RAG-pad (MCP/ChromaDB) */
  triage:   { x: 950,  y: 900, label: "Triage Model",        sub: "BackgroundTask · qwen2.5:3b", color: "#f97316", icon: "🔍", bgTrack: true },
  escalate: { x: 1280, y: 900, label: "escalate_to_human()", sub: "MCP · urgency: dringend",     color: "#ef4444", icon: "🚨", bgTrack: true },
  twilio:   { x: 1610, y: 900, label: "Twilio SMS",          sub: "escalatie notificatie",       color: "#ec4899", icon: "📱", bgTrack: true },
} as const satisfies Record<string, NodeDef>;

type NodeKey = keyof typeof NODES;

const MAIN_NODE_ORDER: NodeKey[] = ["browser", "frontend", "backend", "postgres", "mcp", "chroma", "llm"];
const BG_NODE_ORDER: NodeKey[] = ["triage", "escalate", "twilio"];

type Edge = { from: NodeKey; to: NodeKey; transport: string; dashed?: boolean; bgTrack?: boolean };

const EDGES: Edge[] = [
  { from: "browser",  to: "frontend", transport: "Web Speech / UI" },
  { from: "frontend", to: "backend",  transport: "REST / JSON" },
  { from: "backend",  to: "postgres", transport: "SQLAlchemy" },
  { from: "backend",  to: "mcp",      transport: "recall_context()" },
  { from: "mcp",      to: "chroma",   transport: "vector search bge-m3" },
  { from: "backend",  to: "llm",      transport: "assembled prompt (3 lagen)" },
  { from: "backend",  to: "triage",   transport: "BackgroundTask.add_task()", dashed: true, bgTrack: true },
  { from: "triage",   to: "escalate", transport: "score ≥ drempel",           dashed: true, bgTrack: true },
  { from: "escalate", to: "twilio",   transport: "Twilio REST API",           bgTrack: true },
];

type Packet = { from: NodeKey; to: NodeKey; start: number; end: number; label: string; urgent?: boolean };

const PACKETS: Packet[] = [
  { from: "browser",  to: "frontend", start: 50,  end: 85,  label: '"Ik voel me kortademig"' },
  { from: "frontend", to: "backend",  start: 88,  end: 118, label: "POST /api/chat" },
  { from: "backend",  to: "postgres", start: 125, end: 155, label: "sessiehistorie + dossier" },
  { from: "backend",  to: "mcp",      start: 125, end: 155, label: "recall_context()" },
  { from: "mcp",      to: "chroma",   start: 158, end: 185, label: "embed → vector search" },
  { from: "chroma",   to: "mcp",      start: 188, end: 208, label: "top-3 herinneringen" },
  { from: "postgres", to: "backend",  start: 188, end: 208, label: "history + JSON dossier" },
  { from: "mcp",      to: "backend",  start: 212, end: 228, label: "RAG context terug" },
  { from: "backend",  to: "llm",      start: 235, end: 265, label: "hoofd-LLM prompt" },
  { from: "backend",  to: "triage",   start: 268, end: 350, label: "create_task(score_urgency)" },
  { from: "triage",   to: "escalate", start: 450, end: 478, label: "score 8 ≥ drempel 7 ⚠", urgent: true },
  { from: "escalate", to: "twilio",   start: 483, end: 510, label: "escalate_to_human('dringend')", urgent: true },
  { from: "llm",      to: "backend",  start: 305, end: 340, label: "chat-antwoord (parallel)" },
];

const PHASES: { start: number; end: number; text: string }[] = [
  { start: 48,  end: 118, text: "① Bericht via Frontend naar Backend API" },
  { start: 118, end: 232, text: "② Context ophalen — PostgreSQL + MCP/ChromaDB parallel" },
  { start: 230, end: 268, text: "③ Prompt naar hoofd-LLM — zelfde request, zelfde proces" },
  { start: 265, end: 545, text: "④ BackgroundTask: triage op achtergrond → escalatie + SMS" },
];

function ease(frame: number, start: number, dur: number) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

function bgReveal(frame: number): number {
  return interpolate(frame, [BG_TASK_APPEAR - 8, BG_TASK_APPEAR + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function diagramZoom(frame: number): number {
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

const DiagramNode: React.FC<{ nodeKey: NodeKey; appearFrame: number }> = ({
  nodeKey,
  appearFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const node = NODES[nodeKey];
  const isBg = nodeKey === "triage" || nodeKey === "escalate" || nodeKey === "twilio";
  const reveal = isBg ? bgReveal(frame) : 1;

  const op = ease(frame, appearFrame, fps * 0.5) * reveal;
  const ty = interpolate(frame, [appearFrame, appearFrame + fps * 0.5], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const isActive = PACKETS.some(
    (p) =>
      (p.to === nodeKey && frame >= p.end - 3 && frame <= p.end + 40) ||
      (p.from === nodeKey && frame >= p.start && frame <= p.start + 18)
  );

  const isEscActive =
    isBg &&
    ((nodeKey === "triage" && frame >= 318) ||
      (nodeKey === "escalate" && frame >= 478) ||
      (nodeKey === "twilio" && frame >= 510));

  const borderColor = isEscActive || isActive ? node.color : node.color + "44";

  if (op <= 0) return null;

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
          <div style={{ color: node.color, fontSize: 13, fontWeight: 700, fontFamily: "Inter, sans-serif", lineHeight: 1.2 }}>
            {node.label}
          </div>
          <div style={{ color: "#475569", fontSize: 10, fontFamily: "Inter, sans-serif", marginTop: 2 }}>
            {node.sub}
          </div>
        </div>
      </div>
    </div>
  );
};

const StaticEdge: React.FC<{ edge: Edge; appearFrame: number }> = ({ edge, appearFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = edge.bgTrack ? bgReveal(frame) : 1;
  if (reveal <= 0) return null;

  const { x1, y1, x2, y2 } = getEdgePoints(edge.from, edge.to);
  const mx = (x1 + x2) / 2;
  const pathD = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  const pathLen = Math.hypot(x2 - x1, y2 - y1) * 1.2;

  const progress = ease(frame, appearFrame, fps * 0.7);
  const dashOffset = edge.dashed ? undefined : pathLen * (1 - progress);
  const lineOpacity = (edge.dashed ? progress : 1) * reveal;

  const escHighlight =
    edge.bgTrack &&
    frame >= 445
      ? interpolate(frame, [445, 465], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 0;

  const strokeColor = escHighlight > 0.5 ? NODES[edge.from].color : "#1e3a5f";

  return (
    <g opacity={lineOpacity}>
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={escHighlight > 0.5 ? 2.5 : 1.5}
        strokeDasharray={edge.dashed ? "6 4" : `${pathLen}`}
        strokeDashoffset={dashOffset}
        markerEnd="url(#ce-arrow)"
      />
      <text
        x={mx}
        y={(y1 + y2) / 2 + (y2 > y1 ? -14 : 20)}
        textAnchor="middle"
        fill="#334155"
        fontSize={11}
        fontFamily="Inter, sans-serif"
        opacity={progress}
      >
        {edge.transport}
      </text>
    </g>
  );
};

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
    [
      packet.start + 8,
      packet.start + 18,
      Math.max(packet.start + 19, packet.end - 8),
      packet.end + 4,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const color = packet.urgent ? "#ef4444" : NODES[packet.from].color;

  return (
    <div
      style={{
        position: "absolute",
        left: x - 155,
        top: y - 62,
        width: 310,
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
      }}
    >
      {packet.label}
    </div>
  );
};

const BackgroundTaskReveal: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < BG_TASK_APPEAR - 5 || frame > BG_TASK_APPEAR + 55) return null;

  const op = interpolate(
    frame,
    [BG_TASK_APPEAR - 5, BG_TASK_APPEAR + 8, BG_TASK_APPEAR + 48, BG_TASK_APPEAR + 58],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const { x, y } = NODES.backend;

  return (
    <div
      style={{
        position: "absolute",
        left: x - NW / 2 + 20,
        top: y + NH / 2 + 28,
        opacity: op,
        background: "#f9731622",
        border: "2px solid #f97316",
        borderRadius: 8,
        padding: "8px 16px",
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color: "#f97316",
        whiteSpace: "nowrap",
        boxShadow: "0 0 24px #f9731633",
      }}
    >
      ⚡ BackgroundTask.add_task() — parallel aan hoofd-LLM
    </div>
  );
};

const ForkTracks: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < BG_TASK_APPEAR || frame > 545) return null;

  const op = interpolate(frame, [BG_TASK_APPEAR, BG_TASK_APPEAR + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 1180,
          top: NODES.llm.y - NH / 2 - 34,
          opacity: op,
          fontFamily: "Inter, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: "#facc15",
          background: "#facc1515",
          border: "1px solid #facc1533",
          borderRadius: 6,
          padding: "4px 12px",
        }}
      >
        hoofd-track — chat antwoord
      </div>
      <div
        style={{
          position: "absolute",
          left: 900,
          top: NODES.triage.y - NH / 2 - 34,
          opacity: op * bgReveal(frame),
          fontFamily: "Inter, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: "#f97316",
          background: "#f9731615",
          border: "1px solid #f9731633",
          borderRadius: 6,
          padding: "4px 12px",
        }}
      >
        achtergrond-track — urgentie triage
      </div>
    </>
  );
};

const ScoreDisplay: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 310 || frame > 505) return null;

  const rawScore = interpolate(frame, [318, 450], [0, 8.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const score = Math.min(Math.floor(rawScore), 8);
  const breached = score >= 7;
  const op = interpolate(frame, [310, 322, 495, 505], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scoreColor =
    score >= 8 ? "#ef4444" : score >= 7 ? "#f97316" : score >= 5 ? "#facc15" : "#4ade80";
  const { x, y } = NODES.triage;

  return (
    <div
      style={{
        position: "absolute",
        left: x - NW / 2 - 250,
        top: y - 75,
        width: 230,
        opacity: op,
        background: "#0d1420",
        border: `2px solid ${breached ? "#ef4444" : "#f9731633"}`,
        borderRadius: 10,
        padding: "12px 16px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>
        URGENTIESCORE
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 40, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 18, color: "#475569" }}>/10</span>
      </div>
      {breached ? (
        <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444", fontWeight: 700 }}>⚠ DREMPEL OVERSCHREDEN</div>
      ) : null}
    </div>
  );
};

const PhaseLabel: React.FC = () => {
  const frame = useCurrentFrame();
  const phase = PHASES.find((p) => frame >= p.start && frame <= p.end + 10);
  if (!phase) return null;

  const fadeIn = interpolate(frame, [phase.start, phase.start + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [phase.end, phase.end + 10], [1, 0], {
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
          maxWidth: 1100,
          textAlign: "center",
        }}
      >
        {phase.text}
      </div>
    </div>
  );
};

const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const op = ease(frame, 0, 20);

  return (
    <div style={{ position: "absolute", top: 32, left: 0, right: 0, textAlign: "center", opacity: op }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: "#f1f5f9", fontFamily: "Inter, sans-serif" }}>
        Anna Remembers — Chat & Escalatie
      </div>
      <div style={{ fontSize: 14, color: "#64748b", fontFamily: "Inter, sans-serif", marginTop: 5 }}>
        één request · hoofd-LLM + BackgroundTask parallel vanuit FastAPI
      </div>
    </div>
  );
};

/** Eén doorlopende scene: chatflow → bij Backend API splitst BackgroundTask af → zoom op triage/escalatie */
export const ChatEscalationDiagram: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const sceneOpacity = Math.min(
    interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(frame, [durationInFrames - fps * 0.4, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  const overlayOpacity = interpolate(
    frame,
    [0, ZOOM_IN_END, ZOOM_OUT_START],
    [0.78, 0.78, 0.55],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const zoom = diagramZoom(frame);

  return (
    <AbsoluteFill style={{ background: "#0f172a", opacity: sceneOpacity }}>
      <RecordingVideo
        filename={RECORDING}
        placeholder={<AbsoluteFill style={{ background: "#0f172a" }} />}
      />

      <AbsoluteFill style={{ background: "#0f172a", opacity: overlayOpacity, pointerEvents: "none" }} />

      <AbsoluteFill
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: `${ZOOM_ORIGIN_X}px ${ZOOM_ORIGIN_Y}px`,
        }}
      >
        <svg width={1920} height={1080} style={{ position: "absolute", top: 0, left: 0 }}>
          <defs>
            <marker id="ce-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="#1e3a5f" />
            </marker>
          </defs>
          {EDGES.map((edge, i) => (
            <StaticEdge key={`${edge.from}-${edge.to}`} edge={edge} appearFrame={edge.bgTrack ? BG_TASK_APPEAR : 36 + i * 6} />
          ))}
          {PACKETS.map((p) => (
            <TravelingPacket key={`${p.from}-${p.start}`} packet={p} />
          ))}
        </svg>

        {MAIN_NODE_ORDER.map((key, i) => (
          <DiagramNode key={key} nodeKey={key} appearFrame={18 + i * 6} />
        ))}
        {BG_NODE_ORDER.map((key, i) => (
          <DiagramNode key={key} nodeKey={key} appearFrame={BG_TASK_APPEAR + i * 8} />
        ))}

        {PACKETS.map((p) => (
          <PacketLabel key={`lbl-${p.from}-${p.start}`} packet={p} />
        ))}

        <BackgroundTaskReveal />
        <ForkTracks />
        <ScoreDisplay />
        <Title />
        <PhaseLabel />
      </AbsoluteFill>

      <CaptionOverlay sceneId="04-escalation" mode="phrase" bottom={28} fontSize={26} />
    </AbsoluteFill>
  );
};
