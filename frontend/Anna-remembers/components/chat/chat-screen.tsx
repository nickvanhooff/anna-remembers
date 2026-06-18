"use client"

import { useState, useEffect, useRef } from "react"
import {
  Plus,
  ChevronRight,
  Send,
  ScrollText,
  Mic,
  MessageSquare,
  ChevronsDown,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { VoiceMode } from "./voice-mode"
import { useChatSession } from "@/lib/hooks/useChatSession"
import { getPatients } from "@/lib/api"
import type { Patient, Message, MedicalSummaryJSON } from "@/types"

export function ChatScreen() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientId, setPatientId] = useState<string>("")
  const [loadingPts, setLoadingPts] = useState(true)

  const [draft, setDraft] = useState("")
  const [panelOpen, setPanelOpen] = useState(true)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [newSessionConfirm, setNewSessionConfirm] = useState(false)
  const streamRef = useRef<HTMLDivElement>(null)

  // Load patients on mount
  useEffect(() => {
    getPatients()
      .then((ps) => {
        setPatients(ps)
        if (ps.length > 0) setPatientId(ps[0].id)
      })
      .catch(() => toast.error("Kon patiëntenlijst niet laden"))
      .finally(() => setLoadingPts(false))
  }, [])

  const {
    sessions,
    activeId,
    setActiveId,
    loadingSessions,
    messages,
    loadingMsgs,
    typing,
    handleSendMessage,
    startNewSession,
  } = useChatSession(patientId, patients, setSummaryOpen, (updated) =>
    setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  )

  const patient = patients.find((p) => p.id === patientId)

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
    setShowScrollBtn(false)
  }, [messages.length, typing])

  useEffect(() => {
    const el = streamRef.current
    if (!el) return
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollBtn(distanceFromBottom > 120)
    }
    el.addEventListener("scroll", onScroll)
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

  async function send() {
    const text = draft.trim()
    if (!text) return
    setDraft("")
    await handleSendMessage(text)
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Topbar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <span className="text-[13px] text-muted-foreground">
          Dashboard / <b className="font-medium text-foreground">Chat</b>
        </span>
      </header>

      <div
        className="flex flex-1 overflow-hidden transition-all duration-200"
        style={{
          display: "grid",
          gridTemplateColumns: panelOpen ? "260px 1fr" : "0 1fr",
        }}
      >
        {/* Session rail */}
        <aside
          className="flex flex-col overflow-hidden border-r transition-all duration-200"
          style={{
            opacity: panelOpen ? 1 : 0,
            pointerEvents: panelOpen ? "auto" : "none",
          }}
        >
          {/* Patiënt selector */}
          <div className="flex flex-col gap-2 border-b p-3.5">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Patiënt
            </span>
            {loadingPts ? (
              <Skeleton className="h-8 w-full rounded-md" />
            ) : (
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger className="h-8 text-[13.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first} {p.last}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Sessie-header */}
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Sessies{sessions.length > 0 ? ` · ${sessions.length}` : ""}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              title="Sessie afsluiten en nieuw gesprek starten"
              onClick={() => setNewSessionConfirm(true)}
              disabled={!patientId}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>

          {/* Sessielijst */}
          <div className="flex flex-1 flex-col overflow-auto">
            {loadingSessions ? (
              <div className="flex flex-col gap-1 p-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-3.5 py-3 text-[12px] text-muted-foreground italic">
                Nog geen sessies
              </div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className="flex flex-col gap-0.5 px-3.5 py-2.5 text-left transition-colors duration-100"
                  style={{
                    background:
                      s.id === activeId ? "var(--accent)" : "transparent",
                    color:
                      s.id === activeId
                        ? "var(--accent-foreground)"
                        : "inherit",
                    borderLeft: `3px solid ${s.id === activeId ? "var(--primary)" : "transparent"}`,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium">{s.date}</span>
                    {s.isOpen && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: "var(--success-soft-bg)",
                          color: "var(--success-soft-fg)",
                        }}
                      >
                        open
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] opacity-70">
                    {s.messageCount} berichten
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat area */}
        <div className="flex flex-col overflow-hidden">
          {/* Patiënt header */}
          <div className="flex shrink-0 items-center gap-3 border-b bg-background px-7 py-3.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setPanelOpen((v) => !v)}
            >
              <ChevronRight
                className="size-3.5 transition-transform duration-200"
                style={{ transform: panelOpen ? "rotate(180deg)" : "none" }}
              />
            </Button>
            {loadingPts || !patient ? (
              <div className="flex flex-1 items-center gap-3">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-60" />
                </div>
              </div>
            ) : (
              <>
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback className="bg-accent text-sm font-medium text-accent-foreground">
                    {patient.first[0]}
                    {patient.last[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-medium">
                    {patient.first} {patient.last}
                  </div>
                  <div className="text-[12.5px] text-muted-foreground">
                    {patient.age} jaar · {patient.id} ·{" "}
                    {patient.meds || "geen medicatie geregistreerd"}
                  </div>
                </div>
                <StatusBadge status={patient.status} label={patient.label} />
                <Button
                  variant={voiceMode ? "default" : "ghost"}
                  size="sm"
                  className="gap-1.5 text-[12.5px]"
                  onClick={() => setVoiceMode(!voiceMode)}
                  title={
                    voiceMode ? "Terug naar text mode" : "Schakel stemmode in"
                  }
                >
                  {voiceMode ? (
                    <MessageSquare className="size-3.5" />
                  ) : (
                    <Mic className="size-3.5" />
                  )}
                  {voiceMode ? "Text" : "Spraak"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
                  onClick={() => setSummaryOpen(true)}
                  title="Medisch dossier bekijken"
                >
                  <ScrollText className="size-3.5" />
                  Dossier
                  {patient.medicalSummary && (
                    <span className="ml-0.5 size-1.5 rounded-full bg-green-500" />
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Berichtenstroom */}
          <div className="relative flex-1 overflow-hidden">
            {showScrollBtn && (
              <button
                onClick={() => streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" })}
                className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-[12px] text-muted-foreground shadow-md transition-opacity hover:text-foreground"
              >
                <ChevronsDown className="size-3.5" />
                Scroll naar beneden
              </button>
            )}
          <div
            ref={streamRef}
            className="flex h-full flex-col gap-3.5 overflow-auto bg-background px-7 py-5"
          >
            {loadingMsgs ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`flex max-w-[60%] gap-2.5 ${i % 2 === 0 ? "flex-row-reverse self-end" : ""}`}
                  >
                    <Skeleton className="size-7 shrink-0 rounded-full" />
                    <Skeleton className="h-12 w-48 rounded-2xl" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {!activeId && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <span className="text-[13px]">
                      Nog geen sessie geselecteerd.
                    </span>
                    <span className="text-[12px] opacity-70">
                      Kies een sessie links, of stuur een bericht om een nieuwe
                      te starten.
                    </span>
                  </div>
                )}

                {activeId && messages.length === 0 && !typing && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <span className="text-[13px]">Sessie leeg.</span>
                    <span className="text-[12px] opacity-70">
                      Stuur een bericht om te beginnen.
                    </span>
                  </div>
                )}

                {messages.length > 0 && (
                  <div className="relative py-1 text-center font-mono text-[11px] text-muted-foreground">
                    <span className="relative z-10 bg-background px-3">
                      {sessions.find((s) => s.id === activeId)?.date ?? today}
                    </span>
                    <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                  </div>
                )}

                {messages.map((m, i) => (
                  <div
                    key={i}
                    className="flex max-w-[78%] gap-2.5"
                    style={{
                      alignSelf: m.role === "me" ? "flex-end" : "flex-start",
                      flexDirection: m.role === "me" ? "row-reverse" : "row",
                    }}
                  >
                    <Avatar className="mt-0.5 size-7 shrink-0">
                      <AvatarFallback
                        className="text-xs font-medium"
                        style={
                          m.role === "them"
                            ? {
                                backgroundColor: "var(--primary)",
                                color: "var(--primary-foreground)",
                              }
                            : {
                                backgroundColor: "var(--accent)",
                                color: "var(--accent-foreground)",
                              }
                        }
                      >
                        {m.role === "them"
                          ? "A"
                          : `${patient?.first[0] ?? "?"}${patient?.last[0] ?? ""}`}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div
                        className="rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap"
                        style={
                          m.role === "them"
                            ? {
                                backgroundColor: "var(--accent)",
                                color: "var(--accent-foreground)",
                                borderTopLeftRadius: 4,
                              }
                            : {
                                backgroundColor: "var(--primary)",
                                color: "var(--primary-foreground)",
                                borderTopRightRadius: 4,
                              }
                        }
                      >
                        {m.tag && (
                          <span
                            className="mr-1.5 inline-flex h-5 items-center rounded-full px-1.5 text-[11px] font-medium"
                            style={{ backgroundColor: "oklch(1 0 0 / 0.20)" }}
                          >
                            {m.tag}
                          </span>
                        )}
                        {m.body}
                      </div>
                      <div
                        className="mt-1 font-mono text-[11px] text-muted-foreground"
                        style={{
                          textAlign: m.role === "me" ? "right" : "left",
                        }}
                      >
                        {m.who} · {m.t}
                      </div>
                    </div>
                  </div>
                ))}

                {typing && (
                  <div className="flex max-w-[78%] gap-2.5">
                    <Avatar className="mt-0.5 size-7 shrink-0">
                      <AvatarFallback
                        className="text-xs font-medium"
                        style={{
                          backgroundColor: "var(--primary)",
                          color: "var(--primary-foreground)",
                        }}
                      >
                        A
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className="rounded-2xl px-3.5 py-3"
                      style={{
                        backgroundColor: "var(--accent)",
                        borderTopLeftRadius: 4,
                      }}
                    >
                      <TypingDots />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          </div>

          {/* Composer */}
          <div className="flex shrink-0 items-end gap-2.5 border-t bg-card px-7 py-3">
            {voiceMode ? (
              <div className="min-w-0 flex-1">
                <VoiceMode
                  onUserSpeech={(transcript) => {
                    if (transcript) void handleSendMessage(transcript)
                  }}
                  messageText={
                    messages.length > 0 &&
                    messages[messages.length - 1].role === "them"
                      ? messages[messages.length - 1].body
                      : undefined
                  }
                  animation={
                    messages.length > 0 &&
                    messages[messages.length - 1].role === "them"
                      ? (messages[messages.length - 1].animation ??
                        "standard_waiting")
                      : "standard_waiting"
                  }
                />
              </div>
            ) : (
              <>
                <Textarea
                  className="max-h-[140px] min-h-[40px] flex-1 resize-none text-[14px]"
                  placeholder={
                    patient
                      ? `Typ als ${patient.first}…  (Enter om te versturen)`
                      : "Selecteer een patiënt…"
                  }
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  disabled={!patient || typing || loadingMsgs}
                />
                <Button
                  size="sm"
                  onClick={() => void send()}
                  disabled={!draft.trim() || !patient || typing || loadingMsgs}
                >
                  <Send data-icon="inline-start" />
                  Versturen
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent
          side="right"
          className="w-[420px] overflow-y-auto sm:w-[480px]"
        >
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <ScrollText className="size-4" />
              Medisch dossier — {patient?.first} {patient?.last}
            </SheetTitle>
          </SheetHeader>
          {patient?.medicalSummary ? (
            <DossierCard raw={patient.medicalSummary} />
          ) : (
            <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
              <p>Nog geen samenvatting beschikbaar.</p>
              <p className="text-[12px]">
                Na {10} berichten genereert Anna automatisch een medische
                samenvatting op basis van de gesprekken.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={newSessionConfirm} onOpenChange={setNewSessionConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nieuw gesprek starten?</AlertDialogTitle>
            <AlertDialogDescription>
              De huidige sessie wordt afgesloten. Anna start daarna een nieuwe
              wekelijkse check-in met {patient?.first ?? "de patiënt"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setNewSessionConfirm(false)
                void startNewSession()
              }}
            >
              Afsluiten &amp; nieuw gesprek
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 0.25 } 50% { opacity: 1 } }
        .dot-t { width:6px;height:6px;border-radius:999px;background:currentColor;opacity:.5;animation:blink 1.2s infinite; }
        .dot-t:nth-child(2){animation-delay:.15s}
        .dot-t:nth-child(3){animation-delay:.30s}
      `}</style>
    </div>
  )
}

function DossierCard({ raw }: { raw: string }) {
  let data: MedicalSummaryJSON | null = null
  try {
    data = JSON.parse(raw)
  } catch {
    /* legacy Markdown — toon als tekst */
  }

  if (!data) {
    return (
      <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-foreground">
        {raw}
      </div>
    )
  }

  const sections: { label: string; value: string | string[] | null }[] = [
    { label: "Symptomen", value: data.sym?.length ? data.sym : null },
    { label: "Medicatietrouw", value: data.med },
    { label: "Gewichtsverloop", value: data.wgt },
    { label: "Gedragspatronen", value: data.bhv },
    { label: "Overig", value: data.ovr?.length ? data.ovr : null },
  ]

  return (
    <div className="flex flex-col gap-4">
      {sections.map(({ label, value }) =>
        value ? (
          <div key={label}>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {label}
            </p>
            {Array.isArray(value) ? (
              <ul className="flex flex-col gap-0.5">
                {value.map((v, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[13px]">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                    {v}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px]">{value}</p>
            )}
          </div>
        ) : null
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <span
      className="inline-flex gap-1"
      style={{ color: "var(--accent-foreground)" }}
    >
      <span className="dot-t" />
      <span className="dot-t" />
      <span className="dot-t" />
    </span>
  )
}
