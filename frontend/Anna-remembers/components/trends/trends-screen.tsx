"use client"

import { useState, useMemo } from "react"
import { Wind, Scale, Droplet, Pill, HeartPulse } from "lucide-react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { PATIENTS, TRENDS } from "@/lib/mock-data"
import type { TrendPoint } from "@/types"

type Range = "7d" | "14d" | "28d"
type SymptomKey = "kortademigheid" | "gewicht" | "oedeem" | "medicatietrouw" | "vermoeidheid"

interface Symptom {
  key: SymptomKey
  label: string
  unit: string
  kind: "line" | "bar"
  domain: [number, number]
  color: string
  Icon: React.ComponentType<{ className?: string }>
  accentStatus: string
}

const SYMPTOMS: Symptom[] = [
  { key: "kortademigheid", label: "Kortademigheid", unit: "/10", kind: "line", domain: [0, 10],    color: "var(--chart-1)", Icon: Wind,       accentStatus: "warning" },
  { key: "gewicht",        label: "Gewicht",        unit: "kg",  kind: "line", domain: [80, 86],   color: "var(--chart-2)", Icon: Scale,      accentStatus: "info" },
  { key: "oedeem",         label: "Oedeem",         unit: "/10", kind: "bar",  domain: [0, 10],    color: "var(--chart-3)", Icon: Droplet,    accentStatus: "info" },
  { key: "medicatietrouw", label: "Medicatietrouw", unit: "%",   kind: "bar",  domain: [60, 100],  color: "var(--chart-4)", Icon: Pill,       accentStatus: "success" },
  { key: "vermoeidheid",   label: "Vermoeidheid",   unit: "/10", kind: "line", domain: [0, 10],    color: "var(--chart-5)", Icon: HeartPulse, accentStatus: "warning" },
]

const OBSERVATIONS: Record<SymptomKey, string[]> = {
  kortademigheid: [
    "Geleidelijke toename in 4 weken — gemiddelde stijging van ~0.1 per dag.",
    "Patiënt linkt het aan inspanning, maar pieken correleren met gewichtstoename.",
  ],
  gewicht: [
    "Boven drempelwaarde van +1 kg/week op 14 april — zorgvuldig volgen.",
  ],
  oedeem: [
    "Stabiel rond enkels, lichte toename na 20 april.",
    "Patiënt rapporteert dit zelf consistent — geen escalatie nodig.",
  ],
  medicatietrouw: [
    "Gedaald naar 80% in week 4 — patiënt vergeet avonddosis.",
    "Anna heeft hier 2 keer naar gevraagd; gesprek lopend.",
  ],
  vermoeidheid: [
    "Toename volgt patroon van kortademigheid — waarschijnlijk gerelateerd.",
  ],
}

export function TrendsScreen() {
  const [patientId, setPatientId] = useState("P-002")
  const [active, setActive] = useState<SymptomKey>("kortademigheid")
  const [range, setRange] = useState<Range>("28d")

  const patient = PATIENTS.find(p => p.id === patientId) ?? PATIENTS[0]
  const sym = SYMPTOMS.find(s => s.key === active)!

  const sliced = useMemo<TrendPoint[]>(() => {
    if (range === "7d")  return TRENDS.slice(-7)
    if (range === "14d") return TRENDS.slice(-14)
    return TRENDS
  }, [range])

  const stats = useMemo(() => SYMPTOMS.map(s => {
    const vals = sliced.map(d => d[s.key])
    const cur  = vals[vals.length - 1]
    const prev = vals[0]
    return { ...s, cur, delta: cur - prev, vals: sliced.map(d => ({ x: d.date.slice(5), y: d[s.key] })) }
  }), [sliced])

  const activeStat = stats.find(s => s.key === active)!

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <header className="flex h-14 items-center gap-3 border-b px-6 shrink-0 bg-background">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <span className="text-[13px] text-muted-foreground">
          Dashboard / <b className="text-foreground font-medium">Symptoomtrends</b>
        </span>
      </header>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5 max-w-[1280px] w-full mx-auto">
        {/* Page head */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">Symptoomtrends</h1>
            <p className="text-[13.5px] text-muted-foreground mt-1">
              Anna registreert symptomen per sessie. Gebruik trends om patronen te spotten.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-8 px-2.5 rounded-md border border-input bg-background text-[13.5px] outline-none focus:ring-2 focus:ring-ring/50 w-52"
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
            >
              {PATIENTS.map(p => (
                <option key={p.id} value={p.id}>{p.first} {p.last} · {p.id}</option>
              ))}
            </select>
            <Tabs value={range} onValueChange={v => setRange(v as Range)}>
              <TabsList className="h-8">
                <TabsTrigger value="7d"  className="text-xs px-3">7d</TabsTrigger>
                <TabsTrigger value="14d" className="text-xs px-3">14d</TabsTrigger>
                <TabsTrigger value="28d" className="text-xs px-3">28d</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Patient context */}
        <Card className="rounded-xl">
          <div className="flex items-center gap-4 p-4">
            <Avatar className="size-10 shrink-0">
              <AvatarFallback className="text-sm font-medium bg-accent text-accent-foreground">
                {patient.first[0]}{patient.last[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-medium">{patient.first} {patient.last}</div>
              <div className="text-[12.5px] text-muted-foreground">
                {patient.age} jaar · {patient.sessions} sessies · {patient.meds}
              </div>
            </div>
            <StatusBadge status={patient.status} label={patient.label} />
          </div>
        </Card>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {stats.map(s => {
            const isGood = s.key === "medicatietrouw" ? s.delta >= 0 : s.delta <= 0
            const arrow  = s.delta >= 0 ? "↑" : "↓"
            return (
              <button
                key={s.key}
                className="text-left rounded-xl p-3.5 border bg-card transition-all duration-100 outline-none"
                style={active === s.key ? { borderColor: "var(--primary)", boxShadow: "0 0 0 3px var(--ring)" } : {}}
                onClick={() => setActive(s.key)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5" style={{ color: s.color }}>
                    <s.Icon className="size-3.5" />
                    <span className="text-[12px] text-muted-foreground font-medium">{s.label}</span>
                  </div>
                  <span
                    className="text-[11px] flex items-center gap-0.5"
                    style={{ color: isGood ? "var(--success-soft-fg)" : "var(--warning-soft-fg)" }}
                  >
                    {arrow}{Math.abs(s.delta).toFixed(s.key === "gewicht" ? 1 : 0)}{s.unit}
                  </span>
                </div>
                <div className="text-[28px] font-medium leading-none tabular-nums" style={{ letterSpacing: "-0.01em" }}>
                  {s.cur.toFixed(s.key === "gewicht" ? 1 : 0)}
                  <span className="text-[14px] text-muted-foreground font-normal ml-0.5">{s.unit}</span>
                </div>
                <div className="mt-2">
                  <Sparkline values={s.vals.map(v => v.y)} domain={s.domain} color={s.color} />
                </div>
              </button>
            )
          })}
        </div>

        {/* Big chart */}
        <Card className="rounded-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2" style={{ color: sym.color }}>
                  <sym.Icon className="size-5" />
                  <h2 className="text-lg font-medium text-foreground">{sym.label}</h2>
                </div>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">
                  Schaal {sym.unit} ·{" "}
                  {range === "7d" ? "afgelopen 7 dagen" : range === "14d" ? "afgelopen 14 dagen" : "afgelopen 4 weken"}
                </p>
              </div>
              <StatusBadge status={sym.accentStatus} label="Geregistreerd" />
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              {sym.kind === "line" ? (
                <LineChart data={activeStat.vals} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="x" tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis domain={sym.domain} tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "var(--foreground)" }}
                    formatter={(v) => [`${Number(v).toFixed(sym.key === "gewicht" ? 1 : 0)}${sym.unit}`, sym.label]}
                  />
                  <Line dataKey="y" stroke={sym.color} strokeWidth={2} dot={{ r: 2.5, fill: sym.color, strokeWidth: 0 }} activeDot={{ r: 4 }} />
                </LineChart>
              ) : (
                <BarChart data={activeStat.vals} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="x" tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis domain={sym.domain} tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [`${Number(v).toFixed(0)}${sym.unit}`, sym.label]}
                  />
                  <Bar dataKey="y" fill={sym.color} radius={[2, 2, 0, 0]} fillOpacity={0.85} />
                </BarChart>
              )}
            </ResponsiveContainer>

            {/* Observations */}
            <div className="mt-4 pt-4 border-t">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Anna&apos;s observaties
              </div>
              <div className="flex flex-col gap-2">
                {OBSERVATIONS[active].map((obs, i) => (
                  <div key={i} className="flex items-start gap-2 text-[13px]">
                    <span className="mt-1.5 size-1.5 rounded-full shrink-0" style={{ backgroundColor: sym.color }} />
                    <span>{obs}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Sparkline (SVG) ─────────────────────────────────────────────

function Sparkline({ values, domain, color }: { values: number[]; domain: [number, number]; color: string }) {
  const w = 200, h = 32, p = 2
  const [lo, hi] = domain
  const pts = values.map((v, i): [number, number] => {
    const x = p + (i / Math.max(values.length - 1, 1)) * (w - 2 * p)
    const y = h - p - ((v - lo) / Math.max(hi - lo, 1)) * (h - 2 * p)
    return [x, y]
  })
  const d    = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const area = `${d} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={area} fill={color} fillOpacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}
