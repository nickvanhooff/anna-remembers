import { get, post, BASE, MessageResponseAPI, VALID_ANIMATIONS, resolveAnimation } from "./_base"
import type { Message, Animation } from "@/types"

// ─── Backend response type ─────────────────────────────────────────

interface SessionAPI {
  id: string
  started_at: string
  ended_at: string | null
  message_count: number
  is_open: boolean
}

// ─── Constants ────────────────────────────────────────────────────

const CHAT_TIMEOUT_MS = 600_000

// ─── Exported types ───────────────────────────────────────────────

export interface ChatSession {
  id: string
  date: string
  messageCount: number
  isOpen: boolean
}

// ─── Exports ──────────────────────────────────────────────────────

export async function closeSession(patientId: string): Promise<void> {
  await post(`/chat/${patientId}/sessions/close`, {})
}

export async function greetSession(patientId: string): Promise<{
  reply: string
  sessionId: string
  animation: Animation
} | null> {
  const res = await fetch(`${BASE}/chat/${patientId}/greet`, { method: "POST" })
  if (res.status === 409) return null
  if (!res.ok) throw new Error(`API ${res.status}`)
  const data = (await res.json()) as MessageResponseAPI
  return {
    reply: data.content,
    sessionId: data.session_id,
    animation: resolveAnimation(data.animation),
  }
}

export async function getChatSessions(
  patientId: string
): Promise<ChatSession[]> {
  const data = await get<SessionAPI[]>(`/chat/${patientId}/sessions`)
  return data.map((s) => ({
    id: s.id,
    date: s.started_at.slice(0, 10),
    messageCount: s.message_count,
    isOpen: s.is_open,
  }))
}

export async function getChatMessages(
  patientId: string,
  sessionId: string,
  patientFirst: string
): Promise<Message[]> {
  const data = await get<MessageResponseAPI[]>(
    `/chat/${patientId}/sessions/${sessionId}/messages`
  )

  return data.map((m) => {
    const animation =
      m.role !== "user" &&
      m.animation &&
      (VALID_ANIMATIONS as readonly string[]).includes(m.animation)
        ? (m.animation as Animation)
        : undefined

    return {
      role: m.role === "user" ? "me" : "them",
      who: m.role === "user" ? patientFirst : "Anna",
      t: new Date(m.created_at).toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      body: m.content,
      animation,
    }
  })
}

export async function sendMessage(
  patientId: string,
  content: string
): Promise<{
  reply: string
  sessionId: string
  animation: Animation
  summaryUpdateTriggered: boolean
  escalationTriggered: boolean
}> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE}/chat/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = (await res.json()) as MessageResponseAPI
    const animation = resolveAnimation(data.animation)
    return {
      reply: data.content,
      sessionId: data.session_id,
      animation,
      summaryUpdateTriggered: data.summary_update_triggered ?? false,
      escalationTriggered: data.escalation_triggered ?? false,
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("timeout")
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}
