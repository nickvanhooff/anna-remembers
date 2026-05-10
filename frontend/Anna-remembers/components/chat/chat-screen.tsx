"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, ChevronRight, Send } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { fmtTime } from "@/lib/utils"
import { PATIENTS, CHAT } from "@/lib/mock-data"
import { sendMessage } from "@/lib/api"
import type { Patient, Session, Message } from "@/types"

export function ChatScreen() {
  const [patientId, setPatientId] = useState(PATIENTS[0].id)
  const [sessions, setSessions]   = useState<Session[]>(CHAT)
  const [activeId, setActiveId]   = useState(CHAT[0].sid)
  const [draft, setDraft]         = useState("")
  const [typing, setTyping]       = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const streamRef = useRef<HTMLDivElement>(null)

  const patient = PATIENTS.find(p => p.id === patientId) ?? PATIENTS[0]
  const session = sessions.find(s => s.sid === activeId) ?? sessions[0]

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [session.msgs.length, typing])

  async function send() {
    const text = draft.trim()
    if (!text) return
    setDraft("")

    const userMsg: Message = { role: "me", who: patient.first, t: fmtTime(), body: text }
    setSessions(prev => prev.map(s => s.sid === activeId ? { ...s, msgs: [...s.msgs, userMsg] } : s))
    setTyping(true)

    const { reply, tag } = await sendMessage(patient.id, activeId, text)
    const annaMsg: Message = { role: "them", who: "Anna", t: fmtTime(), body: reply, tag }
    setSessions(prev => prev.map(s => s.sid === activeId ? { ...s, msgs: [...s.msgs, annaMsg] } : s))
    setTyping(false)
  }

  function startNewSession() {
    const sid = `session-${sessions.length + 20}`
    const newSession: Session = {
      sid,
      date: new Date().toISOString().slice(0, 10),
      msgs: [{
        role: "them", who: "Anna", t: fmtTime(),
        body: `Goedemorgen ${patient.first}. Ik weet nog dat we vorige week hebben gesproken — hoe is het sindsdien gegaan?`,
      }],
    }
    setSessions(prev => [newSession, ...prev])
    setActiveId(sid)
  }

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

      {/* Body: session rail + chat */}
      <div
        className="flex flex-1 overflow-hidden transition-all duration-200"
        style={{ gridTemplateColumns: panelOpen ? "260px 1fr" : "0 1fr", display: "grid" }}
      >
        {/* Session rail */}
        <aside
          className="flex flex-col border-r overflow-hidden transition-all duration-200"
          style={{ opacity: panelOpen ? 1 : 0, pointerEvents: panelOpen ? "auto" : "none" }}
        >
          {/* Patient selector */}
          <div className="p-3.5 border-b flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Patiënt</span>
            <select
              className="h-8 px-2.5 rounded-md border border-input bg-background text-[13.5px] outline-none focus:ring-2 focus:ring-ring/50 w-full"
              value={patientId}
              onChange={e => { setPatientId(e.target.value); setSessions(CHAT); setActiveId(CHAT[0].sid) }}
            >
              {PATIENTS.map(p => (
                <option key={p.id} value={p.id}>{p.first} {p.last} · {p.id}</option>
              ))}
            </select>
          </div>

          {/* Session list */}
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Sessies · {sessions.length}
            </span>
            <Button variant="ghost" size="icon" className="size-6" onClick={startNewSession} title="Nieuwe sessie">
              <Plus className="size-3.5" />
            </Button>
          </div>

          <div className="flex flex-col overflow-auto flex-1">
            {sessions.map(s => (
              <button
                key={s.sid}
                onClick={() => setActiveId(s.sid)}
                className="text-left px-3.5 py-2.5 flex flex-col gap-0.5 transition-colors duration-100"
                style={{
                  background: s.sid === activeId ? "var(--accent)" : "transparent",
                  color:      s.sid === activeId ? "var(--accent-foreground)" : "inherit",
                  borderLeft: `3px solid ${s.sid === activeId ? "var(--primary)" : "transparent"}`,
                }}
              >
                <span className="text-[13px] font-medium">{s.sid.replace("session-", "Sessie ")}</span>
                <span className="font-mono text-[11px] opacity-70">{s.date} · {s.msgs.length} berichten</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Chat area */}
        <div className="flex flex-col overflow-hidden">
          {/* Patient header */}
          <div className="flex items-center gap-3 px-7 py-3.5 border-b shrink-0">
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setPanelOpen(v => !v)}>
              <ChevronRight className="size-3.5 transition-transform duration-200" style={{ transform: panelOpen ? "rotate(180deg)" : "none" }} />
            </Button>
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
          </div>

          {/* Message stream */}
          <div ref={streamRef} className="flex-1 overflow-auto px-7 py-5 flex flex-col gap-3.5 bg-background">
            <div className="text-center text-[11px] text-muted-foreground font-mono py-1 relative">
              <span className="relative z-10 bg-background px-3">{session.date}</span>
              <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
            </div>

            {session.msgs.map((m, i) => (
              <div
                key={i}
                className="flex gap-2.5 max-w-[78%]"
                style={{ alignSelf: m.role === "me" ? "flex-end" : "flex-start", flexDirection: m.role === "me" ? "row-reverse" : "row" }}
              >
                <Avatar className="size-7 shrink-0 mt-0.5">
                  <AvatarFallback
                    className="text-xs font-medium"
                    style={m.role === "them"
                      ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
                      : { backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
                  >
                    {m.role === "them" ? "A" : `${patient.first[0]}${patient.last[0]}`}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div
                    className="px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap"
                    style={m.role === "them"
                      ? { backgroundColor: "var(--accent)", color: "var(--accent-foreground)", borderTopLeftRadius: 4 }
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
                  <AvatarFallback className="text-xs font-medium" style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}>A</AvatarFallback>
                </Avatar>
                <div className="px-3.5 py-3 rounded-2xl" style={{ backgroundColor: "var(--accent)", borderTopLeftRadius: 4 }}>
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="flex items-end gap-2.5 px-7 py-3 border-t bg-card shrink-0">
            <Textarea
              className="flex-1 min-h-[40px] max-h-[140px] resize-none text-[14px]"
              placeholder={`Typ als ${patient.first}…  (Enter om te versturen)`}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            />
            <Button size="sm" onClick={send} disabled={!draft.trim() || typing}>
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
