"use client"

import { useState, useMemo, useEffect } from "react"
import { Wind, Scale, Droplet, Pill, HeartPulse } from "lucide-react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { toast } from "sonner"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { getPatients, getTrends } from "@/lib/api"
import type { TrendPoint, Patient } from "@/types"
import { SymptomDetailModal } from "./symptom-detail-modal"

type Range = "7d" | "14d" | "28d"
type SymptomKey = "dyspnea" | "weight_kg" | "edema" | "medication" | "fatigue"

const weeksMap: Record<Range, number> = { "7d": 1, "14d": 2, "28d": 4 }

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
  { key: "dyspnea",    label: "Kortademigheid", unit: "/3", kind: "line", domain: [0, 3],   color: "var(--chart-1)", Icon: Wind,       accentStatus: "warning" },
  { key: "weight_kg",  label: "Gewicht",        unit: "kg",  kind: "line", domain: [70, 90], color: "var(--chart-2)", Icon: Scale,      accentStatus: "info" },
  { key: "edema",      label: "Oedeem",         unit: "/3", kind: "bar",  domain: [0, 3],   color: "var(--chart-3)", Icon: Droplet,    accentStatus: "info" },
  { key: "medication", label: "Medicatietrouw", unit: "/3", kind: "bar",  domain: [0, 3],   color: "var(--chart-4)", Icon: Pill,       accentStatus: "success" },
  { key: "fatigue",    label: "Vermoeidheid",   unit: "/3", kind: "line", domain: [0, 3],   color: "var(--chart-5)", Icon: HeartPulse, accentStatus: "warning" },
]

export function TrendsScreen() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientId, setPatientId] = useState("")
  const [active, setActive] = useState<SymptomKey>("dyspnea")
  const [range, setRange] = useState<Range>("28d")
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [trendsLoading, setTrendsLoading] = useState(false)
  const [modalSessionId, setModalSessionId] = useState<string | null>(null)

  const patient = patients.find(p => p.id === patientId)

  useEffect(() => {
    getPatients()
      .then(data => {
        setPatients(data)
        if (data.length > 0) {
          setPatientId(data[0].id)
        }
      })
      .catch(err => {
        console.error(err)
        toast.error("Kon patiënten niet laden.")
      })
      .finally(() => setPatientsLoading(false))
  }, [])

  useEffect(() => {
    if (!patientId) return

    const timer = setTimeout(() => {
      setTrendsLoading(true)
    }, 0)

    getTrends(patientId, weeksMap[range])
      .then(setTrendData)
      .catch(err => {
        console.error(err)
        toast.error("Kon symptoomtrends niet laden.")
      })
      .finally(() => {
        setTrendsLoading(false)
      })

    return () => {
      clearTimeout(timer)
    }
  }, [patientId, range])

  const stats = useMemo(() => SYMPTOMS.map(s => {
    const nonNullVals = trendData.map(d => d[s.key]).filter((v): v is number => v !== null && v !== undefined)
    const cur = nonNullVals.length > 0 ? nonNullVals[nonNullVals.length - 1] : null
    const prev = nonNullVals.length > 0 ? nonNullVals[0] : null
    const delta = (cur !== null && prev !== null) ? cur - prev : 0

    const vals = trendData.map(d => ({
      x: d.week ? d.week.slice(5) : "",
      y: d[s.key],
      session_id: d.session_id
    }))

    let domain = s.domain
    if (s.key === "weight_kg" && nonNullVals.length > 0) {
      const minWeight = Math.min(...nonNullVals)
      const maxWeight = Math.max(...nonNullVals)
      if (minWeight === maxWeight) {
        domain = [minWeight - 2, minWeight + 2]
      } else {
        domain = [minWeight - 1, maxWeight + 1]
      }
    }

    return { ...s, cur, prev, delta, vals, calculatedDomain: domain }
  }), [trendData])

  const activeStat = stats.find(s => s.key === active)!
  const sym = activeStat

  if (patientsLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Topbar skeleton */}
        <header className="flex h-14 items-center gap-3 border-b px-6 shrink-0 bg-background">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-[13px] text-muted-foreground">
            Dashboard / <b className="text-foreground font-medium">Symptoomtrends</b>
          </span>
        </header>
        <div className="flex-1 p-6 flex flex-col gap-5 max-w-[1280px] w-full mx-auto">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-96 mt-2" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-52" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
          <Skeleton className="h-[72px] w-full rounded-xl" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[380px] w-full rounded-xl" />
        </div>
      </div>
    )
  }

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
              {patients.map(p => (
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
                {patient ? `${patient.first[0]}${patient.last[0]}` : ""}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-medium">{patient ? `${patient.first} ${patient.last}` : "Patiënt laden..."}</div>
              <div className="text-[12.5px] text-muted-foreground">
                {patient ? `${patient.age} jaar · ${patient.sessions} sessies · ${patient.meds}` : ""}
              </div>
            </div>
            {patient && <StatusBadge status={patient.status} label={patient.label} />}
          </div>
        </Card>

        {trendsLoading && trendData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[300px]">
            <Skeleton className="h-[300px] w-full rounded-xl" />
          </div>
        ) : trendData.length === 0 ? (
          <Card className="rounded-xl flex-1 flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
            <HeartPulse className="size-12 opacity-30 mb-3 text-primary" />
            <h3 className="text-base font-medium text-foreground">Nog geen symptoomdata beschikbaar</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Er zijn in de geselecteerde periode nog geen symptoommetingen geregistreerd voor deze patiënt.
            </p>
          </Card>
        ) : (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {stats.map(s => {
                const isGood = s.key === "medication" ? s.delta >= 0 : s.delta <= 0
                const arrow  = s.delta > 0 ? "↑" : s.delta < 0 ? "↓" : ""
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
                      {s.cur !== null && (
                        <span
                          className="text-[11px] flex items-center gap-0.5"
                          style={{ color: s.delta === 0 ? "var(--muted-foreground)" : isGood ? "var(--success-soft-fg)" : "var(--warning-soft-fg)" }}
                        >
                          {arrow}{Math.abs(s.delta).toFixed(s.key === "weight_kg" ? 1 : 0)}{s.unit}
                        </span>
                      )}
                    </div>
                    <div className="text-[28px] font-medium leading-none tabular-nums" style={{ letterSpacing: "-0.01em" }}>
                      {s.cur !== null ? s.cur.toFixed(s.key === "weight_kg" ? 1 : 0) : "—"}
                      {s.cur !== null && <span className="text-[14px] text-muted-foreground font-normal ml-0.5">{s.unit}</span>}
                    </div>
                    <div className="mt-2">
                      <Sparkline
                        values={s.vals.map(v => v.y).filter((v): v is number => v !== null && v !== undefined)}
                        domain={s.calculatedDomain}
                        color={s.color}
                      />
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
                      {range === "7d" ? "afgelopen week" : range === "14d" ? "afgelopen 2 weken" : "afgelopen 4 weken"}
                    </p>
                  </div>
                  <StatusBadge status={sym.accentStatus} label="Geregistreerd" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {trendsLoading && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg">
                      <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={260}>
                    {sym.kind === "line" ? (
                      <LineChart data={activeStat.vals} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="x" tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis domain={sym.calculatedDomain} tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                        <Tooltip
                          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: "var(--foreground)" }}
                          formatter={(v) => [v !== null && v !== undefined ? `${Number(v).toFixed(sym.key === "weight_kg" ? 1 : 0)}${sym.unit}` : "—", sym.label]}
                        />
                        <Line
                          dataKey="y"
                          stroke={sym.color}
                          strokeWidth={2}
                          connectNulls={true}
                          dot={(props: unknown) => {
                            const p = props as { cx?: number; cy?: number; payload?: { session_id?: string }; r?: number }
                            return (
                              <circle
                                key={`dot-${p.payload?.session_id}`}
                                cx={p.cx}
                                cy={p.cy}
                                r={4}
                                fill={sym.color}
                                stroke="none"
                                style={{ cursor: "pointer" }}
                                onClick={() => { if (p.payload?.session_id) setModalSessionId(p.payload.session_id) }}
                              />
                            )
                          }}
                          activeDot={{
                            r: 6,
                            cursor: "pointer",
                            onClick: (_event: unknown, payload: unknown) => {
                              const p = payload as { payload?: { session_id?: string } }
                              if (p?.payload?.session_id) setModalSessionId(p.payload.session_id)
                            },
                          }}
                        />
                      </LineChart>
                    ) : (
                      <BarChart data={activeStat.vals} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="x" tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis domain={sym.calculatedDomain} tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                        <Tooltip
                          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                          formatter={(v) => [v !== null && v !== undefined ? `${Number(v).toFixed(0)}${sym.unit}` : "—", sym.label]}
                        />
                        <Bar
                          dataKey="y"
                          fill={sym.color}
                          radius={[2, 2, 0, 0]}
                          fillOpacity={0.85}
                          cursor="pointer"
                          onClick={(data: unknown) => {
                            const d = data as { payload?: { session_id?: string }; session_id?: string }
                            if (d && d.payload && d.payload.session_id) {
                              setModalSessionId(d.payload.session_id)
                            } else if (d && d.session_id) {
                              setModalSessionId(d.session_id)
                            }
                          }}
                        />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>

                {/* Observations instruction */}
                <div className="mt-4 pt-4 border-t">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Anna&apos;s observaties
                  </div>
                  <div className="text-[13px] text-muted-foreground flex items-center gap-2">
                    <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: sym.color }} />
                    <span>Klik op een meting in de grafiek om Anna&apos;s toelichting en klinische onderbouwing te openen.</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <SymptomDetailModal
        sessionId={modalSessionId}
        patientId={patientId}
        onClose={() => setModalSessionId(null)}
      />
    </div>
  )
}

// ─── Sparkline (SVG) ─────────────────────────────────────────────

function Sparkline({ values, domain, color }: { values: number[]; domain: [number, number]; color: string }) {
  if (values.length === 0) return <div className="h-8" />
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
