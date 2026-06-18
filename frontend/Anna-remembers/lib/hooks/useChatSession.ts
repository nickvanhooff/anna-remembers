"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { fmtTime } from "@/lib/utils"
import {
  getChatSessions,
  getChatMessages,
  sendMessage,
  closeSession,
  greetSession,
  getPatient,
} from "@/lib/api"
import type { ChatSession } from "@/lib/api"
import type { Patient, Message } from "@/types"

export function useChatSession(
  patientId: string,
  patients: Patient[],
  setSummaryOpen: (open: boolean) => void,
  onPatientRefresh?: (updated: Patient) => void
) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)

  // messages per session id
  const [msgMap, setMsgMap] = useState<Record<string, Message[]>>({})
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [typing, setTyping] = useState(false)

  // Load sessions when patient changes
  useEffect(() => {
    if (!patientId) return
    setLoadingSessions(true)
    setSessions([])
    setActiveId(null)
    setMsgMap({})

    getChatSessions(patientId)
      .then((ss) => {
        setSessions(ss)
        // auto-select open session
        const open = ss.find((s) => s.isOpen) ?? ss[0] ?? null
        if (open) setActiveId(open.id)
      })
      .catch(() => toast.error("Kon sessies niet laden"))
      .finally(() => setLoadingSessions(false))
  }, [patientId])

  // Load messages when session changes; auto-greet if session is empty and open
  useEffect(() => {
    if (!activeId || !patientId) return
    if (msgMap[activeId]) return // already loaded

    const patient = patients.find((p) => p.id === patientId)
    if (!patient) return

    const isOpenSession = sessions.find((s) => s.id === activeId)?.isOpen ?? false

    setLoadingMsgs(true)
    getChatMessages(patientId, activeId, patient.first)
      .then(async (msgs) => {
        if (msgs.length === 0 && isOpenSession) {
          // Lege open sessie — Anna opent het gesprek
          setLoadingMsgs(false)
          setTyping(true)
          try {
            const greeting = await greetSession(patientId)
            if (greeting) {
              const annaMsg: Message = {
                role: "them",
                who: "Anna",
                t: fmtTime(),
                body: greeting.reply,
                animation: greeting.animation,
              }
              setMsgMap((prev) => ({ ...prev, [activeId]: [annaMsg] }))
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === activeId ? { ...s, messageCount: 1 } : s
                )
              )
            } else {
              // 409: er zijn al berichten — opnieuw laden
              const fresh = await getChatMessages(patientId, activeId, patient.first)
              setMsgMap((prev) => ({ ...prev, [activeId]: fresh }))
            }
          } catch {
            toast.error("Anna kon de check-in niet starten")
            setMsgMap((prev) => ({ ...prev, [activeId]: [] }))
          } finally {
            setTyping(false)
          }
        } else {
          setMsgMap((prev) => ({ ...prev, [activeId]: msgs }))
          setLoadingMsgs(false)
        }
      })
      .catch(() => {
        toast.error("Kon gesprekshistorie niet laden")
        setLoadingMsgs(false)
      })
  }, [activeId, patientId, patients, msgMap, sessions])

  async function handleSendMessage(text: string) {
    const patient = patients.find((p) => p.id === patientId)
    if (!patient) return
    const trimmedText = text.trim()
    if (!trimmedText) return

    const userMsg: Message = {
      role: "me",
      who: patient.first,
      t: fmtTime(),
      body: trimmedText,
    }
    const currentId = activeId

    if (currentId) {
      setMsgMap((prev) => ({
        ...prev,
        [currentId]: [...(prev[currentId] ?? []), userMsg],
      }))
    }
    setTyping(true)

    try {
      const {
        reply,
        sessionId,
        animation,
        summaryUpdateTriggered,
        escalationTriggered,
      } = await sendMessage(patient.id, trimmedText)
      const annaMsg: Message = {
        role: "them",
        who: "Anna",
        t: fmtTime(),
        body: reply,
        animation,
      }

      if (escalationTriggered) {
        toast.warning("Escalatie aangemaakt", {
          description:
            "Anna heeft een urgente situatie gemeld aan de zorgverlener.",
          duration: 8000,
        })
      }

      if (summaryUpdateTriggered) {
        toast("Patiëntsamenvatting wordt bijgewerkt", {
          description:
            "Op de achtergrond wordt een nieuw medisch dossier gegenereerd.",
          duration: 5000,
          action: { label: "Bekijk", onClick: () => setSummaryOpen(true) },
        })
        // Refresh patient data after 8s — gives the background task time to finish
        setTimeout(() => {
          getPatient(patient.id)
            .then((updated) => {
              onPatientRefresh?.(updated)
            })
            .catch(() => {
              /* fail silently — not critical */
            })
        }, 8000)
      }

      if (!currentId) {
        // first message of a new session — session now exists in the backend
        const newSession: ChatSession = {
          id: sessionId,
          date: new Date().toISOString().slice(0, 10),
          messageCount: 2,
          isOpen: true,
        }
        setSessions((prev) => [newSession, ...prev])
        setActiveId(sessionId)
        setMsgMap((prev) => ({ ...prev, [sessionId]: [userMsg, annaMsg] }))
      } else {
        setMsgMap((prev) => ({
          ...prev,
          [currentId]: [...(prev[currentId] ?? []), annaMsg],
        }))
        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentId ? { ...s, messageCount: s.messageCount + 2 } : s
          )
        )
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "timeout"
      toast.error(
        isTimeout
          ? "Anna reageert niet (time-out na 90 s). Probeer opnieuw."
          : "Anna kon niet antwoorden. Controleer de verbinding en probeer opnieuw."
      )
      if (currentId) {
        setMsgMap((prev) => ({
          ...prev,
          [currentId]: (prev[currentId] ?? []).slice(0, -1),
        }))
      }
    } finally {
      setTyping(false)
    }
  }

  async function startNewSession() {
    if (!patientId) return
    try {
      await closeSession(patientId)
    } catch {
      toast.error("Kon sessie niet afsluiten")
      return
    }
    // Start nieuwe sessie: Anna stuurt de check-in openingsvraag
    setActiveId(null)
    setMsgMap({})
    setTyping(true)
    try {
      const greeting = await greetSession(patientId)
      if (greeting) {
        const newSession: ChatSession = {
          id: greeting.sessionId,
          date: new Date().toISOString().slice(0, 10),
          messageCount: 1,
          isOpen: true,
        }
        const ss = await getChatSessions(patientId)
        setSessions(
          ss.some((s) => s.id === greeting.sessionId) ? ss : [newSession, ...ss]
        )
        setActiveId(greeting.sessionId)
        const annaMsg: Message = {
          role: "them",
          who: "Anna",
          t: fmtTime(),
          body: greeting.reply,
          animation: greeting.animation,
        }
        setMsgMap({ [greeting.sessionId]: [annaMsg] })
      }
    } catch {
      toast.error("Anna kon de check-in niet starten")
      const ss = await getChatSessions(patientId)
      setSessions(ss)
    } finally {
      setTyping(false)
    }
  }

  const messages = activeId ? (msgMap[activeId] ?? []) : []

  return {
    sessions,
    activeId,
    setActiveId,
    loadingSessions,
    messages,
    loadingMsgs,
    typing,
    handleSendMessage,
    startNewSession,
    patients,
  }
}
