import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ─── Layout ───────────────────────────────────────────────────────────────────

const NW = 210;
const NH = 66;

const NODES = {
  browser:  { x: 150,  y: 500, label: "Gebruiker",    sub: "browser · Web Speech",        color: "#94a3b8", icon: "👤" },
  frontend: { x: 460,  y: 500, label: "Frontend",     sub: "Next.js :3001",                color: "#38bdf8", icon: "⚛️" },
  backend:  { x: 830,  y: 500, label: "Backend API",  sub: "FastAPI :8000",                color: "#4ade80", icon: "⚡" },
  postgres: { x: 1140, y: 240, label: "PostgreSQL",   sub: ":5432  sessies + dossier",     color: "#fb923c", icon: "🗄️" },
  mcp:      { x: 1140, y: 760, label: "MCP Server",   sub: "fastmcp :8001",                color: "#a78bfa", icon: "🔧" },
  chroma:   { x: 1490, y: 760, label: "ChromaDB",     sub: ":8002  RAG vectors",           color: "#f472b6", icon: "🧠" },
  llm:      { x: 1720, y: 500, label: "LLM Provider", sub: "Ollama :11434 · Portkey ☁",   color: "#facc15", icon: "🤖" },
} as const;

type NodeKey = keyof typeof NODES;

const NODE_ORDER: NodeKey[] = ["browser", "frontend", "backend", "postgres", "mcp", "chroma", "llm"];

// ─── Static edges ─────────────────────────────────────────────────────────────

const EDGES: { from: NodeKey; to: NodeKey; transport: string }[] = [
  { from: "browser",  to: "frontend", transport: "Web Speech / UI" },
  { from: "frontend", to: "backend",  transport: "REST / JSON (HTTP)" },
  { from: "backend",  to: "postgres", transport: "SQLAlchemy (TCP :5432)" },
  { from: "backend",  to: "mcp",      transport: "HTTP POST /mcp (fastmcp v3)" },
  { from: "mcp",      to: "chroma",   transport: "HTTP :8002 (chromadb-client)" },
  { from: "backend",  to: "llm",      transport: "HTTP (provider-agnostic)" },
];

// ─── Animated packets ─────────────────────────────────────────────────────────

type Packet = { from: NodeKey; to: NodeKey; start: number; end: number; label: string };

const PACKETS: Packet[] = [
  // Request path
  { from: "browser",  to: "frontend", start: 80,  end: 118, label: '"Ik voel me kortademig"' },
  { from: "frontend", to: "backend",  start: 120, end: 158, label: "POST /api/chat/{session_id}" },
  // Parallel context fetch
  { from: "backend",  to: "postgres", start: 165, end: 205, label: "laad sessiehistorie + dossier" },
  { from: "backend",  to: "mcp",      start: 165, end: 205, label: "recall_context(query, patient_id)" },
  // RAG lookup
  { from: "mcp",      to: "chroma",   start: 210, end: 248, label: "embed(query) → vector search bge-m3" },
  // Results converge
  { from: "chroma",   to: "mcp",      start: 253, end: 283, label: "top-3 relevante herinneringen" },
  { from: "postgres", to: "backend",  start: 253, end: 283, label: "history + JSON samenvatting" },
  { from: "mcp",      to: "backend",  start: 288, end: 318, label: "RAG context teruggestuurd" },
  // LLM call
  { from: "backend",  to: "llm",      start: 328, end: 368, label: "assembled prompt (3 lagen)" },
  // Response path
  { from: "llm",      to: "backend",  start: 408, end: 438, label: "gegenereerd antwoord" },
  { from: "backend",  to: "frontend", start: 443, end: 470, label: "JSON { message, audio_url }" },
  { from: "frontend", to: "browser",  start: 475, end: 505, label: "TTS afspelen + chat update" },
];

// ─── Phase annotations ────────────────────────────────────────────────────────

const PHASES: { start: number; end: number; text: string }[] = [
  { start: 78,  end: 162, text: "① Gebruiker stelt een vraag" },
  { start: 163, end: 322, text: "② Context ophalen — parallelle aanroepen naar PostgreSQL & MCP/ChromaDB" },
  { start: 326, end: 406, text: "③ 3-laags prompt opgebouwd en verstuurd naar LLM" },
  { start: 406, end: 510, text: "④ Antwoord gegenereerd en teruggestuurd naar gebruiker via TTS" },
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

// Cubic Bezier point at t, matching the SVG path C mx y1, mx y2
function bezierAt(t: number, x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const ti = 1 - t;
  return {
    x: ti * ti * ti * x1 + 3 * ti * ti * t * mx + 3 * ti * t * t * mx + t * t * t * x2,
    y: ti * ti * ti * y1 + 3 * ti * ti * t * y1 + 3 * ti * t * t * y2 + t * t * t * y2,
  };
}

// ─── Node ─────────────────────────────────────────────────────────────────────

const FlowNode: React.FC<{ nodeKey: NodeKey; appearFrame: number }> = ({ nodeKey, appearFrame }) => {
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
      (p.to === nodeKey && frame >= p.end - 3 && frame <= p.end + 40) ||
      (p.from === nodeKey && frame >= p.start && frame <= p.start + 18)
  );

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
      {isActive && (
        <div
          style={{
            position: "absolute",
            inset: -8,
            borderRadius: 14,
            background: node.color,
            opacity: 0.22,
            filter: "blur(18px)",
          }}
        />
      )}
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1e293b",
          border: `2px solid ${isActive ? node.color : node.color + "44"}`,
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
  appearFrame: number;
}> = ({ from, to, transport, appearFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { x1, y1, x2, y2 } = getEdgePoints(from, to);
  const mx = (x1 + x2) / 2;
  const pathD = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const pathLen = Math.sqrt(dx * dx + dy * dy) * 1.2;
  const progress = ease(frame, appearFrame, fps * 0.7);
  const dashOffset = pathLen * (1 - progress);
  const labelOp = interpolate(
    frame,
    [appearFrame + fps * 0.8, appearFrame + fps * 1.1],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Transport label: offset perpendicular to keep it readable
  const labelX = mx;
  const labelY = (y1 + y2) / 2 + (y2 > y1 ? -14 : 20);

  return (
    <g>
      <path
        d={pathD}
        fill="none"
        stroke="#1e3a5f"
        strokeWidth={1.5}
        strokeDasharray={`${pathLen}`}
        strokeDashoffset={dashOffset}
        markerEnd="url(#cf-arrow)"
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

// ─── Traveling packet (dot only — label rendered in HTML layer) ───────────────

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

  const color = NODES[packet.from].color;

  return (
    <g opacity={dotOp}>
      <circle cx={x} cy={y} r={15} fill={color} opacity={0.22} />
      <circle cx={x} cy={y} r={7} fill={color} />
    </g>
  );
};

// ─── Packet label (HTML layer — always above SVG edges) ───────────────────────

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

  const color = NODES[packet.from].color;
  const lw = 310;

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
        boxShadow: `0 0 18px ${color}33`,
      }}
    >
      {packet.label}
    </div>
  );
};

// ─── LLM thinking pulse ───────────────────────────────────────────────────────

const LlmThinking: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 368 || frame > 412) return null;

  const op = interpolate(frame, [368, 378, 402, 412], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse = 0.5 + 0.5 * Math.sin((frame - 368) * 0.28);
  const { x, y } = NODES.llm;

  return (
    <g opacity={op}>
      <circle cx={x} cy={y} r={55 + pulse * 22} fill={NODES.llm.color} opacity={0.06 + pulse * 0.06} />
      <text
        x={x}
        y={y - 62}
        textAnchor="middle"
        fill={NODES.llm.color}
        fontSize={13}
        fontFamily="Inter, sans-serif"
        fontWeight={600}
      >
        ✦ genereert antwoord...
      </text>
    </g>
  );
};

// ─── Parallel annotation ──────────────────────────────────────────────────────

const ParallelAnnotation: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 165 || frame > 212) return null;

  const op = interpolate(frame, [165, 175, 202, 212], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const { x, y } = NODES.backend;

  return (
    <div
      style={{
        position: "absolute",
        left: x - NW / 2 - 5,
        top: y + NH / 2 + 12,
        opacity: op,
        background: "#1e293b",
        border: "1px solid #4ade8033",
        borderRadius: 6,
        padding: "5px 14px",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        color: "#4ade80",
        whiteSpace: "nowrap",
      }}
    >
      asyncio.gather() — 2 parallelle aanroepen
    </div>
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
        bottom: 44,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      <div
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 8,
          padding: "10px 28px",
          fontFamily: "Inter, sans-serif",
          fontSize: 16,
          color: "#94a3b8",
        }}
      >
        {phase.text}
      </div>
    </div>
  );
};

// ─── Title ────────────────────────────────────────────────────────────────────

const FlowTitle: React.FC = () => {
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
        Anna Remembers — Chat Flow
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#64748b",
          fontFamily: "Inter, sans-serif",
          marginTop: 5,
        }}
      >
        één bericht van spraak tot antwoord · met transports
      </div>
    </div>
  );
};

// ─── Root composition ─────────────────────────────────────────────────────────

export const ChatFlowDiagram: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const frame = useCurrentFrame();
  const fadeOut = embedded
    ? interpolate(frame, [516, 540], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : interpolate(frame, [510, 540], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  return (
    <AbsoluteFill style={{ background: "#0f172a", opacity: fadeOut }}>
      {/* SVG layer: edges + packets */}
      <svg
        width={1920}
        height={1080}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <defs>
          <marker
            id="cf-arrow"
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

        <LlmThinking />

        {PACKETS.map((p, i) => (
          <TravelingPacket key={i} packet={p} />
        ))}
      </svg>

      {/* HTML layer: nodes */}
      {NODE_ORDER.map((key, i) => (
        <FlowNode key={key} nodeKey={key} appearFrame={20 + i * 7} />
      ))}

      {/* Packet labels — HTML layer so they always render above SVG edges */}
      {PACKETS.map((p, i) => (
        <PacketLabel key={i} packet={p} />
      ))}

      {/* Annotations */}
      <ParallelAnnotation />

      {/* UI */}
      <FlowTitle />
      <PhaseLabel />
    </AbsoluteFill>
  );
};
