import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CaptionOverlay } from "../scenes/CaptionOverlay";

export const SYMPTOM_TRENDS_FRAMES = 1200;

const NW = 210;
const NH = 66;

/** Wanneer de sessie wordt afgesloten, start symptom extractie */
const EXTRACT_START = 200;
const JSON_REVEAL = 380;
const CHART_START = 780;
const DETAIL_START = 980;

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
  browser:   { x: 140,  y: 420, label: "Patiënt",              sub: "check-in gesprek",              color: "#94a3b8", icon: "👤" },
  frontend:  { x: 400,  y: 420, label: "Frontend",             sub: "Next.js chat",                  color: "#38bdf8", icon: "⚛️" },
  backend:   { x: 680,  y: 420, label: "Backend API",          sub: "FastAPI · POST /chat",          color: "#4ade80", icon: "⚡" },
  llm_chat:  { x: 980,  y: 320, label: "Hoofd LLM",            sub: "Portkey · Anna antwoordt",      color: "#facc15", icon: "🤖" },
  pg_sessions:{ x: 680,  y: 200, label: "PostgreSQL",           sub: "sessions + messages",           color: "#fb923c", icon: "🗄️" },
  extract:   { x: 980,  y: 560, label: "Extractiemodel",       sub: "BackgroundTask · JSON mode",    color: "#a78bfa", icon: "🔬", bgTrack: true },
  pg_symptoms:{ x: 1280, y: 560, label: "symptom_observations", sub: "PostgreSQL · 1 rij/sessie",    color: "#fb923c", icon: "📊", bgTrack: true },
  trends_api:{ x: 1280, y: 420, label: "GET /symptom-trends",   sub: "weekaggregatie · laatste N wkn", color: "#38bdf8", icon: "📈" },
  dashboard: { x: 1580, y: 420, label: "Trends Dashboard",      sub: "grafieken + detailmodal",       color: "#22d3ee", icon: "📉" },
} as const satisfies Record<string, NodeDef>;

type NodeKey = keyof typeof NODES;

const MAIN_ORDER: NodeKey[] = ["browser", "frontend", "backend", "llm_chat", "pg_sessions", "trends_api", "dashboard"];
const BG_ORDER: NodeKey[] = ["extract", "pg_symptoms"];

type Edge = { from: NodeKey; to: NodeKey; transport: string; dashed?: boolean; bgTrack?: boolean };

const EDGES: Edge[] = [
  { from: "browser",    to: "frontend",   transport: "bericht + antwoord" },
  { from: "frontend",   to: "backend",    transport: "REST / JSON" },
  { from: "backend",    to: "llm_chat",   transport: "assembled prompt" },
  { from: "llm_chat",   to: "backend",    transport: "chat-antwoord" },
  { from: "backend",    to: "pg_sessions",transport: "berichten opslaan" },
  { from: "backend",    to: "extract",    transport: "BackgroundTask.add_task()", dashed: true, bgTrack: true },
  { from: "extract",    to: "pg_symptoms",transport: "UPSERT JSON scores", bgTrack: true },
  { from: "pg_symptoms",to: "trends_api", transport: "SQLAlchemy query" },
  { from: "trends_api", to: "dashboard",  transport: "TrendPoint[] JSON" },
];

type Packet = { from: NodeKey; to: NodeKey; start: number; end: number; label: string; accent?: boolean };

const PACKETS: Packet[] = [
  { from: "browser",     to: "frontend",    start: 40,  end: 75,  label: '"Enkels zijn dikker geworden"' },
  { from: "frontend",    to: "backend",     start: 78,  end: 108, label: "POST /api/chat" },
  { from: "backend",     to: "llm_chat",    start: 115, end: 145, label: "hoofd-LLM prompt" },
  { from: "llm_chat",    to: "backend",     start: 150, end: 178, label: "Anna antwoordt" },
  { from: "backend",     to: "pg_sessions", start: 150, end: 178, label: "messages commit" },
  { from: "backend",     to: "extract",     start: 200, end: 260, label: "POST /sessions/close" },
  { from: "extract",     to: "pg_symptoms", start: 520, end: 560, label: "dyspnea:2 edema:2 …", accent: true },
  { from: "pg_symptoms", to: "trends_api",  start: 680, end: 720, label: "GET ?weeks=8" },
  { from: "trends_api",  to: "dashboard",   start: 725, end: 760, label: "wekelijkse punten" },
];

const PHASES: { start: number; end: number; text: string }[] = [
  { start: 38,  end: 185, text: "① Check-in gesprek — patiënt meldt klachten, Anna antwoordt" },
  { start: 195, end: 370, text: "② Sessie afsluiten → BackgroundTask met volledig transcript" },
  { start: 375, end: 515, text: "③ Gestructureerde JSON — scores 0–3, null = niet besproken" },
  { start: 515, end: 665, text: "④ Opslag in symptom_observations — één rij per sessie + ISO-week" },
  { start: 670, end: 960, text: "⑤ Dashboard haalt trends op — kortademigheid, oedeem, gewicht …" },
  { start: 975, end: 1170, text: "⑥ Per datapunt: redenering + patiëntcitaat (nooit Anna's tekst)" },
];

/** Voorbeelddata patiënt 2 — geleidelijke verslechtering */
const CHART_WEEKS = [
  { week: "W01", dyspnea: 1, edema: 0 },
  { week: "W02", dyspnea: 1, edema: 1 },
  { week: "W03", dyspnea: 2, edema: 1 },
  { week: "W04", dyspnea: 2, edema: 2 },
];

const TRANSCRIPT_LINES = [
  { role: "user", text: "Mijn enkels zijn de afgelopen dagen dikker geworden." },
  { role: "assistant", text: "Dat klinkt zorgwekkend. Hoe ervaar je je ademhaling?" },
  { role: "user", text: "Ik ben benauwd na het traplopen, vooral 's avonds." },
];

const EXTRACT_JSON = `{
  "dyspnea": 2,
  "edema": 2,
  "fatigue": null,
  "medication": 0,
  "weight_kg": 79.5,
  "reasoning": {
    "dyspnea": "benauwd na traplopen",
    "edema": "enkels dikker geworden"
  }
}`;

function ease(frame: number, start: number, dur: number) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

function bgReveal(frame: number): number {
  return interpolate(frame, [EXTRACT_START - 8, EXTRACT_START + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
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

const DiagramNode: React.FC<{ nodeKey: NodeKey; appearFrame: number }> = ({ nodeKey, appearFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const node = NODES[nodeKey];
  const isBg = node.bgTrack === true;
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

  const isExtractActive = nodeKey === "extract" && frame >= 260 && frame <= 510;
  const isChartActive = nodeKey === "dashboard" && frame >= CHART_START;

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
      {(isActive || isExtractActive || isChartActive) && (
        <div
          style={{
            position: "absolute",
            inset: -8,
            borderRadius: 14,
            background: node.color,
            opacity: isExtractActive || isChartActive ? 0.28 : 0.2,
            filter: "blur(18px)",
          }}
        />
      )}
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1e293b",
          border: `2px solid ${isActive || isExtractActive || isChartActive ? node.color : node.color + "44"}`,
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

  return (
    <g opacity={(edge.dashed ? progress : 1) * reveal}>
      <path
        d={pathD}
        fill="none"
        stroke="#1e3a5f"
        strokeWidth={1.5}
        strokeDasharray={edge.dashed ? "6 4" : `${pathLen}`}
        strokeDashoffset={dashOffset}
        markerEnd="url(#st-arrow)"
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

  const color = packet.accent ? "#a78bfa" : NODES[packet.from].color;

  return (
    <g opacity={dotOp}>
      <circle cx={x} cy={y} r={packet.accent ? 9 : 7} fill={color} opacity={0.22} />
      <circle cx={x} cy={y} r={packet.accent ? 9 : 7} fill={color} />
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
    [packet.start + 8, packet.start + 18, Math.max(packet.start + 19, packet.end - 8), packet.end + 4],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        position: "absolute",
        left: x - 155,
        top: y - 62,
        width: 310,
        opacity: op,
        background: "#0d1420",
        border: `1.5px solid ${NODES[packet.from].color}88`,
        borderRadius: 8,
        padding: "6px 16px",
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color: packet.accent ? "#a78bfa" : NODES[packet.from].color,
        textAlign: "center",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {packet.label}
    </div>
  );
};

const BackgroundTaskBadge: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < EXTRACT_START - 5 || frame > EXTRACT_START + 55) return null;

  const op = interpolate(
    frame,
    [EXTRACT_START - 5, EXTRACT_START + 8, EXTRACT_START + 48, EXTRACT_START + 58],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const { x, y } = NODES.backend;

  return (
    <div
      style={{
        position: "absolute",
        left: x - NW / 2 + 10,
        top: y + NH / 2 + 18,
        opacity: op,
        background: "#a78bfa22",
        border: "2px solid #a78bfa",
        borderRadius: 8,
        padding: "8px 16px",
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color: "#a78bfa",
        whiteSpace: "nowrap",
      }}
    >
      ⚡ Sessie afsluiten — volledig transcript naar extractiemodel
    </div>
  );
};

const TranscriptPanel: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 220 || frame > 520) return null;

  const op = interpolate(frame, [220, 240, 500, 520], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        top: 720,
        width: 520,
        opacity: op,
        background: "#0d1420",
        border: "1px solid #334155",
        borderRadius: 12,
        padding: "16px 20px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 12 }}>
        TRANSCRIPT → EXTRACTIEMODEL
      </div>
      {TRANSCRIPT_LINES.map((line, i) => {
        const lineOp = ease(frame, 240 + i * 25, 18);
        const isUser = line.role === "user";
        return (
          <div
            key={i}
            style={{
              opacity: lineOp,
              marginBottom: 10,
              padding: "8px 12px",
              borderRadius: 8,
              background: isUser ? "#1e3a5f44" : "#1e293b",
              borderLeft: `3px solid ${isUser ? "#38bdf8" : "#475569"}`,
            }}
          >
            <div style={{ fontSize: 10, color: isUser ? "#38bdf8" : "#64748b", fontWeight: 700, marginBottom: 4 }}>
              {isUser ? "PATIËNT (user)" : "Anna (assistant) — niet gebruikt voor scores"}
            </div>
            <div style={{ fontSize: 13, color: isUser ? "#e2e8f0" : "#64748b", lineHeight: 1.4 }}>
              {line.text}
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 8, fontSize: 11, color: "#a78bfa", fontStyle: "italic" }}>
        Redenering mag alleen patiënt-uitspraken citeren — nooit Anna's tekst
      </div>
    </div>
  );
};

const JsonPanel: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < JSON_REVEAL || frame > 660) return null;

  const op = interpolate(frame, [JSON_REVEAL, JSON_REVEAL + 20, 640, 660], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const chars = Math.floor(
    interpolate(frame, [JSON_REVEAL + 15, JSON_REVEAL + 120], [0, EXTRACT_JSON.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 640,
        top: 720,
        width: 480,
        opacity: op,
        background: "#0d1420",
        border: "2px solid #a78bfa66",
        borderRadius: 12,
        padding: "16px 20px",
        fontFamily: "JetBrains Mono, monospace",
      }}
    >
      <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>
        JSON OUTPUT — format=json · scores 0–3 · null = niet besproken
      </div>
      <pre
        style={{
          margin: 0,
          fontSize: 13,
          color: "#c4b5fd",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
        }}
      >
        {EXTRACT_JSON.slice(0, chars)}
        {chars < EXTRACT_JSON.length ? "▌" : ""}
      </pre>
      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { label: "0", desc: "expliciet afwezig" },
          { label: "1–3", desc: "mild → ernstig" },
          { label: "null", desc: "niet besproken" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: "#1e293b",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 11,
              color: "#94a3b8",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <span style={{ color: "#facc15", fontWeight: 700 }}>{item.label}</span> = {item.desc}
          </div>
        ))}
      </div>
    </div>
  );
};

const TrendChart: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < CHART_START - 20 || frame > DETAIL_START + 180) return null;

  const op = interpolate(frame, [CHART_START - 20, CHART_START, DETAIL_START + 160, DETAIL_START + 180], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const chartW = 520;
  const chartH = 220;
  const padL = 40;
  const padB = 36;
  const padT = 20;
  const innerW = chartW - padL - 20;
  const innerH = chartH - padB - padT;

  const progress = interpolate(frame, [CHART_START, CHART_START + 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const points = CHART_WEEKS.map((w, i) => ({
    x: padL + (i / (CHART_WEEKS.length - 1)) * innerW,
    y: padT + innerH - (w.dyspnea / 3) * innerH,
    week: w.week,
    val: w.dyspnea,
  }));

  const visibleCount = Math.ceil(progress * points.length);
  const pathD = points
    .slice(0, visibleCount)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const activeIdx = Math.min(visibleCount - 1, CHART_WEEKS.length - 1);
  const showDetail = frame >= DETAIL_START;

  return (
    <div
      style={{
        position: "absolute",
        right: 80,
        top: 700,
        width: chartW + (showDetail ? 340 : 0),
        opacity: op,
        display: "flex",
        gap: 20,
      }}
    >
      <div
        style={{
          width: chartW,
          background: "#0d1420",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: "16px 12px 8px",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", fontFamily: "Inter, sans-serif", marginBottom: 4 }}>
          Kortademigheid — 4 weken
        </div>
        <div style={{ fontSize: 10, color: "#64748b", fontFamily: "Inter, sans-serif", marginBottom: 8 }}>
          GET /patients/{`{id}`}/symptom-trends?weeks=4
        </div>
        <svg width={chartW} height={chartH}>
          {[0, 1, 2, 3].map((v) => {
            const y = padT + innerH - (v / 3) * innerH;
            return (
              <g key={v}>
                <line x1={padL} y1={y} x2={chartW - 20} y2={y} stroke="#1e293b" strokeWidth={1} />
                <text x={padL - 8} y={y + 4} textAnchor="end" fill="#475569" fontSize={10} fontFamily="Inter, sans-serif">
                  {v}
                </text>
              </g>
            );
          })}
          {pathD && (
            <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth={2.5} strokeLinecap="round" />
          )}
          {points.slice(0, visibleCount).map((p, i) => (
            <g key={p.week}>
              <circle
                cx={p.x}
                cy={p.y}
                r={showDetail && i === activeIdx ? 8 : 5}
                fill={showDetail && i === activeIdx ? "#ef4444" : "#38bdf8"}
                stroke={showDetail && i === activeIdx ? "#fca5a5" : "none"}
                strokeWidth={2}
              />
              <text x={p.x} y={chartH - 8} textAnchor="middle" fill="#64748b" fontSize={10} fontFamily="Inter, sans-serif">
                {p.week}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {showDetail && (
        <div
          style={{
            width: 320,
            background: "#0d1420",
            border: "2px solid #ef444466",
            borderRadius: 12,
            padding: "16px 18px",
            fontFamily: "Inter, sans-serif",
            opacity: ease(frame, DETAIL_START, 20),
          }}
        >
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>
            SYMPTOOMDETAIL — W04
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#ef4444", marginBottom: 12 }}>
            Kortademigheid: 2/3
          </div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 6 }}>REDENERING (model)</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 14, lineHeight: 1.4 }}>
            "benauwd na traplopen"
          </div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 6 }}>PATIËNTCITAAT</div>
          <div
            style={{
              fontSize: 13,
              color: "#e2e8f0",
              background: "#1e3a5f44",
              borderLeft: "3px solid #38bdf8",
              padding: "8px 12px",
              borderRadius: 6,
              lineHeight: 1.4,
            }}
          >
            "Ik ben benauwd na het traplopen, vooral 's avonds."
          </div>
        </div>
      )}
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
        Anna Remembers — Symptoomtrends
      </div>
      <div style={{ fontSize: 14, color: "#64748b", fontFamily: "Inter, sans-serif", marginTop: 5 }}>
        automatische extractie per sessie · geen handmatige invoer
      </div>
    </div>
  );
};

/** Standalone visualisatie: chat → extractie → PostgreSQL → dashboard grafiek */
export const SymptomTrendsDiagram: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const sceneOpacity = Math.min(
    interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(frame, [durationInFrames - fps * 0.4, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  return (
    <AbsoluteFill style={{ background: "#0f172a", opacity: sceneOpacity }}>
      <svg width={1920} height={1080} style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <marker id="st-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill="#1e3a5f" />
          </marker>
        </defs>
        {EDGES.map((edge, i) => (
          <StaticEdge
            key={`${edge.from}-${edge.to}`}
            edge={edge}
            appearFrame={edge.bgTrack ? EXTRACT_START : 24 + i * 6}
          />
        ))}
        {PACKETS.map((p) => (
          <TravelingPacket key={`${p.from}-${p.start}`} packet={p} />
        ))}
      </svg>

      {MAIN_ORDER.map((key, i) => (
        <DiagramNode key={key} nodeKey={key} appearFrame={18 + i * 6} />
      ))}
      {BG_ORDER.map((key, i) => (
        <DiagramNode key={key} nodeKey={key} appearFrame={EXTRACT_START + i * 8} />
      ))}

      {PACKETS.map((p) => (
        <PacketLabel key={`lbl-${p.from}-${p.start}`} packet={p} />
      ))}

      <BackgroundTaskBadge />
      <TranscriptPanel />
      <JsonPanel />
      <TrendChart />
      <Title />
      <PhaseLabel />

      <CaptionOverlay sceneId="05-trends-diagram" mode="phrase" bottom={28} fontSize={26} />
    </AbsoluteFill>
  );
};
