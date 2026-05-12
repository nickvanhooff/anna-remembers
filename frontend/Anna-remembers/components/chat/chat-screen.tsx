"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, ChevronRight, Send } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarTrigger } from "@/components/ui/sidebar"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { fmtTime } from "@/lib/utils"
import { getPatients, getChatSessions, getChatMessages, sendMessage, closeSession } from "@/lib/api"
import type { ChatSession } from "@/lib/api"
import type { Patient, Message } from "@/types"

export function ChatScreen() {
  const [patients, setPatients]         = useState<Patient[]>([])
  const [patientId, setPatientId]       = useState<string>("")
  const [loadingPts, setLoadingPts]     = useState(true)

  const [sessions, setSessions]         = useState<ChatSession[]>([])
  const [activeId, setActiveId]         = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)

  // berichten per sessie-id
  const [msgMap, setMsgMap]             = useState<Record<string, Message[]>>({})
  const [loadingMsgs, setLoadingMsgs]   = useState(false)

  const [draft, setDraft]               = useState("")
  const [typing, setTyping]             = useState(false)
  const [panelOpen, setPanelOpen]       = useState(true)
  const streamRef = useRef<HTMLDivElement>(null)

  // Patiënten laden bij mount
  useEffect(() => {
    getPatients()
      .then(ps => {
        setPatients(ps)
        if (ps.length > 0) setPatientId(ps[0].id)
      })
      .catch(() => toast.error("Kon patiëntenlijst niet laden"))
      .finally(() => setLoadingPts(false))
  }, [])

  // Sessies laden bij patiëntwisseling
  useEffect(() => {
    if (!patientId) return
    setLoadingSessions(true)
    setSessions([])
    setActiveId(null)
    setMsgMap({})

    getChatSessions(patientId)
      .then(ss => {
        setSessions(ss)
        // open sessie automatisch selecteren
        const open = ss.find(s => s.isOpen) ?? ss[0] ?? null
        if (open) setActiveId(open.id)
      })
      .catch(() => toast.error("Kon sessies niet laden"))
      .finally(() => setLoadingSessions(false))
  }, [patientId])

  // Berichten laden bij sessiewisseling
  useEffect(() => {
    if (!activeId || !patientId) return
    if (msgMap[activeId]) return   // al geladen

    const patient = patients.find(p => p.id === patientId)
    if (!patient) return

    setLoadingMsgs(true)
    getChatMessages(patientId, activeId, patient.first)
      .then(msgs => setMsgMap(prev => ({ ...prev, [activeId]: msgs })))
      .catch(() => toast.error("Kon gesprekshistorie niet laden"))
      .finally(() => setLoadingMsgs(false))
  }, [activeId, patientId, patients, msgMap])

  const patient  = patients.find(p => p.id === patientId)
  const messages = activeId ? (msgMap[activeId] ?? []) : []

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [messages.length, typing])

  async function send() {
    if (!patient) return
    const text = draft.trim()
    if (!text) return
    setDraft("")

    const userMsg: Message = { role: "me", who: patient.first, t: fmtTime(), body: text }
    const currentId = activeId

    if (currentId) {
      setMsgMap(prev => ({ ...prev, [currentId]: [...(prev[currentId] ?? []), userMsg] }))
    }
    setTyping(true)

    try {
      const { reply, sessionId } = await sendMessage(patient.id, text)
      const annaMsg: Message = { role: "them", who: "Anna", t: fmtTime(), body: reply }

      if (!currentId) {
        // eerste bericht van een nieuwe sessie — sessie bestaat nu in de backend
        const newSession: ChatSession = { id: sessionId, date: new Date().toISOString().slice(0, 10), messageCount: 2, isOpen: true }
        setSessions(prev => [newSession, ...prev])
        setActiveId(sessionId)
        setMsgMap(prev => ({ ...prev, [sessionId]: [userMsg, annaMsg] }))
      } else {
        setMsgMap(prev => ({ ...prev, [currentId]: [...(prev[currentId] ?? []), annaMsg] }))
        setSessions(prev => prev.map(s => s.id === currentId ? { ...s, messageCount: s.messageCount + 2 } : s))
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "timeout"
      toast.error(
        isTimeout
          ? "Anna reageert niet (time-out na 90 s). Probeer opnieuw."
          : "Anna kon niet antwoorden. Controleer de verbinding en probeer opnieuw."
      )
      if (currentId) {
        setMsgMap(prev => ({ ...prev, [currentId]: (prev[currentId] ?? []).slice(0, -1) }))
      }
    } finally {
      setTyping(false)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <header className="flex h-14 items-center gap-3 border-b px-6 shrink-0 bg-background">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <span className="text-[13px] text-muted-foreground">
          Dashboard / <b className="text-foreground font-medium">Chat</b>
        </span>
      </header>

      <div
        className="flex flex-1 overflow-hidden transition-all duration-200"
        style={{ display: "grid", gridTemplateColumns: panelOpen ? "260px 1fr" : "0 1fr" }}
      >
        {/* Session rail */}
        <aside
          className="flex flex-col border-r overflow-hidden transition-all duration-200"
          style={{ opacity: panelOpen ? 1 : 0, pointerEvents: panelOpen ? "auto" : "none" }}
        >
          {/* Patiënt selector */}
          <div className="p-3.5 border-b flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Patiënt</span>
            {loadingPts ? (
              <Skeleton className="h-8 w-full rounded-md" />
            ) : (
              <select
                className="h-8 px-2.5 rounded-md border border-input bg-background text-[13.5px] outline-none focus:ring-2 focus:ring-ring/50 w-full"
                value={patientId}
                onChange={e => setPatientId(e.target.value)}
              >
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.first} {p.last}</option>
                ))}
              </select>
            )}
          </div>

          {/* Sessie-header */}
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Sessies{sessions.length > 0 ? ` · ${sessions.length}` : ""}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              title="Sessie afsluiten en nieuw gesprek starten"
              onClick={async () => {
                if (!patientId) return
                try {
                  await closeSession(patientId)
                  // Sessies herladen — gesloten sessie staat nu in de lijst, activeId wordt null
                  const ss = await getChatSessions(patientId)
                  setSessions(ss)
                  setActiveId(null)
                  setMsgMap({})
                } catch {
                  toast.error("Kon sessie niet afsluiten")
                }
              }}
              disabled={!sessions.some(s => s.isOpen)}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>

          {/* Sessielijst */}
          <div className="flex flex-col overflow-auto flex-1">
            {loadingSessions ? (
              <div className="flex flex-col gap-1 p-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded" />)}
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-3.5 py-3 text-[12px] text-muted-foreground italic">
                Nog geen sessies
              </div>
            ) : (
              sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className="text-left px-3.5 py-2.5 flex flex-col gap-0.5 transition-colors duration-100"
                  style={{
                    background:  s.id === activeId ? "var(--accent)"   : "transparent",
                    color:       s.id === activeId ? "var(--accent-foreground)" : "inherit",
                    borderLeft:  `3px solid ${s.id === activeId ? "var(--primary)" : "transparent"}`,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium">{s.date}</span>
                    {s.isOpen && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: "var(--success-soft-bg)", color: "var(--success-soft-fg)" }}>
                        open
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] opacity-70">{s.messageCount} berichten</span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat area */}
        <div className="flex flex-col overflow-hidden">
          {/* Patiënt header */}
          <div className="flex items-center gap-3 px-7 py-3.5 border-b shrink-0">
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setPanelOpen(v => !v)}>
              <ChevronRight
                className="size-3.5 transition-transform duration-200"
                style={{ transform: panelOpen ? "rotate(180deg)" : "none" }}
              />
            </Button>
            {loadingPts || !patient ? (
              <div className="flex items-center gap-3 flex-1">
                <Skeleton className="size-10 rounded-full shrink-0" />
                <div className="flex flex-col gap-1.5 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-60" />
                </div>
              </div>
            ) : (
              <>
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback className="text-sm font-medium bg-accent text-accent-foreground">
                    {patient.first[0]}{patient.last[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-medium">{patient.first} {patient.last}</div>
                  <div className="text-[12.5px] text-muted-foreground">
                    {patient.age} jaar · {patient.id} · {patient.meds || "geen medicatie geregistreerd"}
                  </div>
                </div>
                <StatusBadge status={patient.status} label={patient.label} />
              </>
            )}
          </div>

          {/* Berichtenstroom */}
          <div ref={streamRef} className="flex-1 overflow-auto px-7 py-5 flex flex-col gap-3.5 bg-background">
            {loadingMsgs ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`flex gap-2.5 max-w-[60%] ${i % 2 === 0 ? "self-end flex-row-reverse" : ""}`}>
                    <Skeleton className="size-7 rounded-full shrink-0" />
                    <Skeleton className="h-12 w-48 rounded-2xl" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {!activeId && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                    <span className="text-[13px]">Nog geen sessie geselecteerd.</span>
                    <span className="text-[12px] opacity-70">Kies een sessie links, of stuur een bericht om een nieuwe te starten.</span>
                  </div>
                )}

                {activeId && messages.length === 0 && !typing && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                    <span className="text-[13px]">Sessie leeg.</span>
                    <span className="text-[12px] opacity-70">Stuur een bericht om te beginnen.</span>
                  </div>
                )}

                {messages.length > 0 && (
                  <div className="text-center text-[11px] text-muted-foreground font-mono py-1 relative">
                    <span className="relative z-10 bg-background px-3">
                      {sessions.find(s => s.id === activeId)?.date ?? today}
                    </span>
                    <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                  </div>
                )}

                {messages.map((m, i) => (
                  <div
                    key={i}
                    className="flex gap-2.5 max-w-[78%]"
                    style={{
                      alignSelf:     m.role === "me" ? "flex-end" : "flex-start",
                      flexDirection: m.role === "me" ? "row-reverse" : "row",
                    }}
                  >
                    <Avatar className="size-7 shrink-0 mt-0.5">
                      <AvatarFallback
                        className="text-xs font-medium"
                        style={m.role === "them"
                          ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
                          : { backgroundColor: "var(--accent)",  color: "var(--accent-foreground)" }}
                      >
                        {m.role === "them" ? "A" : `${patient?.first[0] ?? "?"}${patient?.last[0] ?? ""}`}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div
                        className="px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap"
                        style={m.role === "them"
                          ? { backgroundColor: "var(--accent)",  color: "var(--accent-foreground)",  borderTopLeftRadius:  4 }
                          : { backgroundColor: "var(--primary)", color: "var(--primary-foreground)", borderTopRightRadius: 4 }}
                      >
                        {m.tag && (
                          <span
                            className="inline-flex items-center h-5 px-1.5 rounded-full text-[11px] font-medium mr-1.5"
                            style={{ backgroundColor: "oklch(1 0 0 / 0.20)" }}
                          >
                            {m.tag}
                          </span>
                        )}
                        {m.body}
                      </div>
                      <div
                        className="text-[11px] text-muted-foreground font-mono mt-1"
                        style={{ textAlign: m.role === "me" ? "right" : "left" }}
                      >
                        {m.who} · {m.t}
                      </div>
                    </div>
                  </div>
                ))}

                {typing && (
                  <div className="flex gap-2.5 max-w-[78%]">
                    <Avatar className="size-7 shrink-0 mt-0.5">
                      <AvatarFallback
                        className="text-xs font-medium"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                      >
                        A
                      </AvatarFallback>
                    </Avatar>
                    <div className="px-3.5 py-3 rounded-2xl" style={{ backgroundColor: "var(--accent)", borderTopLeftRadius: 4 }}>
                      <TypingDots />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Composer */}
          <div className="flex items-end gap-2.5 px-7 py-3 border-t bg-card shrink-0">
            <Textarea
              className="flex-1 min-h-[40px] max-h-[140px] resize-none text-[14px]"
              placeholder={patient ? `Typ als ${patient.first}…  (Enter om te versturen)` : "Selecteer een patiënt…"}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send() } }}
              disabled={!patient || typing || loadingMsgs}
            />
            <Button size="sm" onClick={() => void send()} disabled={!draft.trim() || !patient || typing || loadingMsgs}>
              <Send data-icon="inline-start" />
              Versturen
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 0.25 } 50% { opacity: 1 } }
        .dot-t { width:6px;height:6px;border-radius:999px;background:currentColor;opacity:.5;animation:blink 1.2s infinite; }
        .dot-t:nth-child(2){animation-delay:.15s}
        .dot-t:nth-child(3){animation-delay:.30s}
      `}</style>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1" style={{ color: "var(--accent-foreground)" }}>
      <span className="dot-t" /><span className="dot-t" /><span className="dot-t" />
    </span>
  )
}
