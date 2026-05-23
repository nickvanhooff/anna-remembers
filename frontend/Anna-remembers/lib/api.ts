import type {
  Patient,
  Session,
  Escalation,
  EscalationUrgency,
  EscalationStatus,
  TrendPoint,
  PatientStatus,
  Settings,
} from "@/types"
import { TRENDS, ESCALATIONS } from "./mock-data"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}

// ─── Backend response types ───────────────────────────────────────

interface PatientAPI {
  id: string
  first_name: string
  last_name: string
  birth_date: string | null
  medication_schedule: Record<string, unknown>
  notes: string | null
  medical_summary: string | null
  status: PatientStatus
  created_at: string
}

// ─── Mapping ──────────────────────────────────────────────────────

const STATUS_LABEL: Record<PatientStatus, string> = {
  success: "Stabiel",
  warning: "Aandacht",
  urgent: "Urgent",
  info: "Nieuw",
}

function calcAge(birthDate: string | null): number {
  if (!birthDate) return 0
  const diff = Date.now() - new Date(birthDate).getTime()
  return Math.floor(diff / 31_557_600_000)
}

function medsString(schedule: Record<string, unknown>): string {
  if (schedule.tekst && typeof schedule.tekst === "string")
    return schedule.tekst
  const all = Object.values(schedule).flatMap((v) =>
    Array.isArray(v) ? v : [v]
  )
  return all.filter(Boolean).join(" · ")
}

function toPatient(p: PatientAPI): Patient {
  return {
    id: p.id,
    first: p.first_name,
    last: p.last_name,
    dob: p.birth_date ?? "",
    age: calcAge(p.birth_date),
    sessions: 0,
    lastSession: null,
    status: p.status,
    label: STATUS_LABEL[p.status],
    meds: medsString(p.medication_schedule),
    notes: p.notes ?? "",
    medicalSummary: p.medical_summary ?? null,
  }
}

// ─── Patient API ──────────────────────────────────────────────────

export async function getPatients(): Promise<Patient[]> {
  const data = await get<PatientAPI[]>("/patients/")
  return data.map(toPatient)
}

export async function getPatient(id: string): Promise<Patient> {
  const data = await get<PatientAPI>(`/patients/${id}`)
  return toPatient(data)
}

export interface PatientCreateInput {
  first: string
  last: string
  dob: string
  meds: string
  notes: string
}

export async function createPatient(
  input: PatientCreateInput
): Promise<Patient> {
  const body = {
    first_name: input.first,
    last_name: input.last,
    birth_date: input.dob || null,
    medication_schedule: input.meds ? { tekst: input.meds } : {},
    notes: input.notes || null,
    status: "info",
  }
  const data = await post<PatientAPI>("/patients/", body)
  return toPatient(data)
}

export async function updatePatient(
  id: string,
  input: Partial<PatientCreateInput> & { status?: PatientStatus }
): Promise<Patient> {
  const body: Record<string, unknown> = {}
  if (input.first !== undefined) body.first_name = input.first
  if (input.last !== undefined) body.last_name = input.last
  if (input.dob !== undefined) body.birth_date = input.dob || null
  if (input.meds !== undefined)
    body.medication_schedule = input.meds ? { tekst: input.meds } : {}
  if (input.notes !== undefined) body.notes = input.notes || null
  if (input.status !== undefined) body.status = input.status
  const data = await patch<PatientAPI>(`/patients/${id}`, body)
  return toPatient(data)
}

export async function deletePatient(id: string): Promise<void> {
  await del(`/patients/${id}`)
}

// ─── Escalations ─────────────────────────────────────────────────

interface EscalationAPI {
  id: string
  patient_id: string
  patient_name: string
  session_id: string | null
  reason: string
  urgency: "low" | "medium" | "high"
  status: "open" | "acknowledged" | "resolved"
  notification_status: string
  created_at: string
}

const URGENCY_MAP: Record<EscalationAPI["urgency"], EscalationUrgency> = {
  high: "urgent",
  medium: "warning",
  low: "info",
}

const STATUS_MAP: Record<EscalationAPI["status"], EscalationStatus> = {
  open: "open",
  acknowledged: "in_progress",
  resolved: "closed",
}

const STATUS_MAP_REVERSE: Record<EscalationStatus, EscalationAPI["status"]> = {
  open: "open",
  in_progress: "acknowledged",
  closed: "resolved",
}

const CHANNEL_MAP: Record<EscalationAPI["urgency"], string> = {
  high: "Slack",
  medium: "E-mail",
  low: "E-mail",
}

function toEscalation(e: EscalationAPI): Escalation {
  return {
    id: e.id,
    patient: e.patient_id,
    name: e.patient_name,
    urgency: URGENCY_MAP[e.urgency],
    status: STATUS_MAP[e.status],
    reason: e.reason,
    channel: CHANNEL_MAP[e.urgency],
    assignee: null,
    opened: e.created_at,
    closed: null,
  }
}

export async function getEscalations(): Promise<Escalation[]> {
  const data = await get<EscalationAPI[]>("/escalations/")
  return data.map(toEscalation)
}

export async function updateEscalationStatus(
  id: string,
  status: EscalationStatus
): Promise<Escalation> {
  const data = await patch<EscalationAPI>(`/escalations/${id}/status`, {
    status: STATUS_MAP_REVERSE[status],
  })
  return toEscalation(data)
}

// ─── Trends (still mock) ──────────────────────────────────────────

export async function getTrends(patientId: string): Promise<TrendPoint[]> {
  // TODO: return get<TrendPoint[]>(`/patients/${patientId}/trends`)
  void patientId
  return Promise.resolve(TRENDS)
}

// ─── Chat ─────────────────────────────────────────────────────────

interface SessionAPI {
  id: string
  started_at: string
  ended_at: string | null
  message_count: number
  is_open: boolean
}

interface MessageResponseAPI {
  id: string
  session_id: string
  role: string
  content: string
  created_at: string
  animation?: string | null
  summary_update_triggered?: boolean
  escalation_triggered?: boolean
}

const CHAT_TIMEOUT_MS = 600_000

export interface ChatSession {
  id: string
  date: string
  messageCount: number
  isOpen: boolean
}

export async function closeSession(patientId: string): Promise<void> {
  await post(`/chat/${patientId}/sessions/close`, {})
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
): Promise<import("@/types").Message[]> {
  const data = await get<MessageResponseAPI[]>(
    `/chat/${patientId}/sessions/${sessionId}/messages`
  )
  const validAnimations = [
    "standard_waiting",
    "stand_look_around",
    "running_fast",
    "standard_walk_crouching",
    "flexing_arm",
    "gorilla",
    "laying_on_floor",
    "just_chilling",
    "angry",
    "Expressing_joy",
    "model",
    "model (13)",
  ] as const

  return data.map((m) => {
    const animation =
      m.role !== "user" &&
      m.animation &&
      (validAnimations as readonly string[]).includes(m.animation)
        ? (m.animation as import("@/types").Animation)
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
  animation: import("@/types").Animation
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
    const validAnimations = [
      "standard_waiting",
      "stand_look_around",
      "running_fast",
      "standard_walk_crouching",
      "flexing_arm",
      "gorilla",
      "laying_on_floor",
      "just_chilling",
      "angry",
      "Expressing_joy",
      "model",
      "model (13)",
    ] as const

    const animation =
      data.animation && (validAnimations as readonly string[]).includes(data.animation)
        ? (data.animation as import("@/types").Animation)
        : "standard_waiting"
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

// ─── Settings ─────────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  return get<Settings>("/settings")
}

export async function updateSetting(key: keyof Settings, value: string): Promise<void> {
  await put<{ key: string; value: string }>(`/settings/${key}`, { value })
}
