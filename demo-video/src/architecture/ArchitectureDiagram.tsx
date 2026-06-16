import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ─── Layout ───────────────────────────────────────────────────────────────────

const W = 1920;
const H = 1080;
const NODE_W = 210;
const NODE_H = 68;

const NODES = {
  browser:  { x: 100,  y: 500, label: "Gebruiker",     sub: "browser / Web Speech",    color: "#94a3b8", icon: "👤" },
  frontend: { x: 340,  y: 420, label: "Frontend",       sub: "Next.js :3001",           color: "#38bdf8", icon: "⚛️" },
  backend:  { x: 720,  y: 280, label: "Backend API",    sub: "FastAPI :8000",           color: "#4ade80", icon: "⚡" },
  mcp:      { x: 720,  y: 570, label: "MCP Server",     sub: "fastmcp :8001",           color: "#a78bfa", icon: "🔧" },
  postgres: { x: 1080, y: 200, label: "PostgreSQL",     sub: ":5432  sessions / msgs",  color: "#fb923c", icon: "🗄️" },
  chroma:   { x: 1080, y: 450, label: "ChromaDB",       sub: ":8002  RAG vectors",      color: "#f472b6", icon: "🧠" },
  // ── Switchable providers (right panel) ──
  ollama:   { x: 1490, y: 280, label: "Ollama",         sub: "lokaal  qwen2.5:3b + bge-m3", color: "#facc15", icon: "🦙" },
  portkey:  { x: 1490, y: 480, label: "Portkey / Cloud",sub: "GPT-5.4 · DeepSeek · Claude",  color: "#818cf8", icon: "☁️" },
  piper:    { x: 1390, y: 680, label: "Piper TTS",      sub: "lokaal  :5005  nl_NL-ronnie",  color: "#34d399", icon: "🔊" },
  xtts:     { x: 1620, y: 680, label: "XTTS v2",        sub: "GPU  :5006  stemkloning",      color: "#2dd4bf", icon: "🎙️" },
  // ── Cloud services ──
  langfuse: { x: 480,  y: 870, label: "Langfuse",       sub: "cloud  LLM tracing",      color: "#64748b", icon: "📊" },
  twilio:   { x: 940,  y: 870, label: "Twilio SMS",     sub: "cloud  escalaties",        color: "#f87171", icon: "📱" },
} as const;

type NodeKey = keyof typeof NODES;

// ─── Switchable-provider group bounding box ───────────────────────────────────

const GROUP = {
  x: 1320,
  y: 210,
  w: 490,
  h: 520,
};

// ─── Connections ──────────────────────────────────────────────────────────────

type Conn = { from: NodeKey; to: NodeKey; label: string; highlight?: boolean; dashed?: boolean };

const CONNECTIONS: Conn[] = [
  { from: "browser",  to: "frontend",  label: "UI / STT",           highlight: true  },
  { from: "frontend", to: "backend",   label: "REST / JSON",        highlight: true  },
  { from: "backend",  to: "mcp",       label: "HTTP /mcp",          highlight: true  },
  { from: "backend",  to: "postgres",  label: "SQLAlchemy",         highlight: true  },
  { from: "mcp",      to: "postgres",  label: "escalatie opslaan",  highlight: false },
  { from: "mcp",      to: "chroma",    label: "vector store/query", highlight: true  },
  { from: "backend",  to: "langfuse",  label: "tracing",            highlight: false },
  { from: "backend",  to: "twilio",    label: "SMS escalatie",      highlight: false },
  // LLM — switchable
  { from: "backend",  to: "ollama",    label: "LLM chat",           highlight: false, dashed: true },
  { from: "backend",  to: "portkey",   label: "LLM chat",           highlight: false, dashed: true },
  { from: "mcp",      to: "ollama",    label: "embeddings",         highlight: false, dashed: true },
  // TTS — switchable
  { from: "backend",  to: "piper",     label: "TTS",                highlight: false, dashed: true },
  { from: "backend",  to: "xtts",      label: "TTS",                highlight: false, dashed: true },
];

// ─── Node order for staggered appearance ──────────────────────────────────────

const NODE_ORDER: NodeKey[] = [
  "browser", "frontend", "backend", "mcp",
  "postgres", "chroma",
  "ollama", "portkey", "piper", "xtts",
  "langfuse", "twilio",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ease(frame: number, start: number, fps: number, sec = 0.55) {
  return interpolate(frame, [start, start + fps * sec], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

// ─── Group box ────────────────────────────────────────────────────────────────

const ProviderGroup: React.FC<{ appearFrame: number }> = ({ appearFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = ease(frame, appearFrame, fps);

  return (
    <g opacity={op}>
      <rect
        x={GROUP.x} y={GROUP.y}
        width={GROUP.w} height={GROUP.h}
        rx={14}
        fill="none"
        stroke="#334155"
        strokeWidth={1.5}
        strokeDasharray="8 5"
      />
      <rect x={GROUP.x + 12} y={GROUP.y - 13} width={220} height={26} rx={6} fill="#0f172a" />
      <text
        x={GROUP.x + 20} y={GROUP.y + 4}
        fill="#64748b"
        fontSize={13}
        fontFamily="Inter, sans-serif"
        fontWeight={600}
      >
        ⚙️  Instelbaar via Settings
      </text>
    </g>
  );
};

// ─── Edge ─────────────────────────────────────────────────────────────────────

const Edge: React.FC<{
  conn: Conn;
  appearFrame: number;
  highlightPhase: boolean;
}> = ({ conn, appearFrame, highlightPhase }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const src = NODES[conn.from];
  const dst = NODES[conn.to];

  const progress = ease(frame, appearFrame, fps, 0.8);

  const active = conn.highlight && highlightPhase;
  const glowOp = active
    ? interpolate(frame, [330, 360], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;

  const labelOp = interpolate(frame, [appearFrame + fps * 0.8, appearFrame + fps * 1.1], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Pick edge attachment sides
  const x1 = dst.x > src.x ? src.x + NODE_W / 2 : src.x - NODE_W / 2;
  const y1 = src.y;
  const x2 = dst.x > src.x ? dst.x - NODE_W / 2 : dst.x + NODE_W / 2;
  const y2 = dst.y;

  const mx = (x1 + x2) / 2;

  const pathD = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const pathLen = Math.sqrt(dx * dx + dy * dy) * 1.2;
  const dashOffset = pathLen * (1 - progress);

  const strokeColor = glowOp > 0 ? NODES[conn.from].color : "#1e3a5f";
  const strokeWidth = glowOp > 0 ? 2.5 : 1.5;
  const labelX = mx;
  const labelY = (y1 + y2) / 2 - 10;

  return (
    <g>
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={conn.dashed ? "6 4" : `${pathLen}`}
        strokeDashoffset={conn.dashed ? undefined : dashOffset}
        opacity={conn.dashed ? progress : 1}
        markerEnd="url(#arrow)"
      />
      <text x={labelX} y={labelY} textAnchor="middle"
        fill="#334155" fontSize={11} fontFamily="Inter, sans-serif" opacity={labelOp}>
        {conn.label}
      </text>
    </g>
  );
};

// ─── Node ─────────────────────────────────────────────────────────────────────

const Node: React.FC<{ nodeKey: NodeKey; appearFrame: number; highlightPhase: boolean }> = ({
  nodeKey, appearFrame, highlightPhase,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const node = NODES[nodeKey];

  const op = ease(frame, appearFrame, fps);
  const ty = interpolate(frame, [appearFrame, appearFrame + fps * 0.55], [18, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const highlightNodes: NodeKey[] = ["browser","frontend","backend","mcp","postgres","chroma"];
  const isHighlighted = highlightPhase && highlightNodes.includes(nodeKey);
  const glowOp = isHighlighted
    ? interpolate(frame, [330, 360], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;

  return (
    <div style={{
      position: "absolute",
      left: node.x - NODE_W / 2,
      top: node.y - NODE_H / 2,
      width: NODE_W,
      height: NODE_H,
      opacity: op,
      transform: `translateY(${ty}px)`,
    }}>
      {glowOp > 0 && (
        <div style={{
          position: "absolute", inset: -6, borderRadius: 14,
          background: node.color, opacity: glowOp * 0.2, filter: "blur(14px)",
        }} />
      )}
      <div style={{
        width: "100%", height: "100%",
        background: "#1e293b",
        border: `2px solid ${glowOp > 0 ? node.color : node.color + "44"}`,
        borderRadius: 10,
        display: "flex", alignItems: "center", gap: 10, padding: "0 12px",
        boxSizing: "border-box",
      }}>
        <span style={{ fontSize: 24 }}>{node.icon}</span>
        <div>
          <div style={{ color: node.color, fontSize: 14, fontWeight: 700, fontFamily: "Inter, sans-serif", lineHeight: 1.2 }}>
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

// ─── Title ────────────────────────────────────────────────────────────────────

const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = ease(frame, 0, fps);
  const ty = interpolate(frame, [0, fps * 0.55], [20, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <div style={{ position: "absolute", top: 30, left: 0, right: 0, textAlign: "center", opacity: op, transform: `translateY(${ty}px)` }}>
      <div style={{ fontSize: 34, fontWeight: 800, color: "#f1f5f9", fontFamily: "Inter, sans-serif", letterSpacing: "-0.02em" }}>
        Anna Remembers — Architectuur
      </div>
      <div style={{ fontSize: 15, color: "#64748b", fontFamily: "Inter, sans-serif", marginTop: 5 }}>
        Next.js · FastAPI · MCP · ChromaDB · PostgreSQL · Ollama · Portkey · Piper · XTTS
      </div>
    </div>
  );
};

// ─── Flow label ───────────────────────────────────────────────────────────────

const FlowLabel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = ease(frame, 350, fps);

  return (
    <div style={{
      position: "absolute", bottom: 36, left: 0, right: 0, textAlign: "center", opacity: op,
    }}>
      <div style={{
        display: "inline-block", background: "#1e293b",
        border: "1px solid #334155", borderRadius: 8,
        padding: "10px 28px", fontFamily: "Inter, sans-serif", fontSize: 15,
      }}>
        <span style={{ color: "#64748b" }}>Chat flow: </span>
        {[
          ["Gebruiker", "#94a3b8"], [" → "], ["Frontend", "#38bdf8"], [" → "],
          ["FastAPI", "#4ade80"], [" → "], ["MCP", "#a78bfa"], [" → "],
          ["ChromaDB", "#f472b6"], [" + "], ["PostgreSQL", "#fb923c"], [" → "],
          ["Ollama / Portkey", "#818cf8"],
        ].map(([text, color], i) =>
          color
            ? <span key={i} style={{ color }}>{text}</span>
            : <span key={i} style={{ color: "#475569" }}>{text}</span>
        )}
      </div>
    </div>
  );
};

// ─── Root composition ─────────────────────────────────────────────────────────

export const ArchitectureDiagram: React.FC = () => {
  const frame = useCurrentFrame();

  const highlightPhase = frame >= 330;

  const fadeOut = interpolate(frame, [480, 510], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "#0f172a", opacity: fadeOut }}>

      {/* SVG layer */}
      <svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <marker id="arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill="#1e3a5f" />
          </marker>
        </defs>

        {/* Provider group box */}
        <ProviderGroup appearFrame={100} />

        {/* Edges */}
        {CONNECTIONS.map((conn, i) => (
          <Edge key={i} conn={conn} appearFrame={180 + i * 13} highlightPhase={highlightPhase} />
        ))}
      </svg>

      {/* Title */}
      <Title />

      {/* Nodes */}
      {NODE_ORDER.map((key, i) => (
        <Node key={key} nodeKey={key} appearFrame={60 + i * 12} highlightPhase={highlightPhase} />
      ))}

      {/* Flow label */}
      {highlightPhase && (
        <Sequence from={350} durationInFrames={160} layout="none">
          <FlowLabel />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
