import type { Patient, Session, Escalation, TrendPoint, PatientStatus } from "@/types"
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

// ─── Backend response types ───────────────────────────────────────

interface PatientAPI {
  id: string
  first_name: string
  last_name: string
  birth_date: string | null
  medication_schedule: Record<string, unknown>
  notes: string | null
  status: PatientStatus
  created_at: string
}

// ─── Mapping ──────────────────────────────────────────────────────

const STATUS_LABEL: Record<PatientStatus, string> = {
  success: "Stabiel",
  warning: "Aandacht",
  urgent:  "Urgent",
  info:    "Nieuw",
}

function calcAge(birthDate: string | null): number {
  if (!birthDate) return 0
  const diff = Date.now() - new Date(birthDate).getTime()
  return Math.floor(diff / 31_557_600_000)
}

function medsString(schedule: Record<string, unknown>): string {
  if (schedule.tekst && typeof schedule.tekst === "string") return schedule.tekst
  const all = Object.values(schedule).flatMap(v => Array.isArray(v) ? v : [v])
  return all.filter(Boolean).join(" · ")
}

function toPatient(p: PatientAPI): Patient {
  return {
    id:          p.id,
    first:       p.first_name,
    last:        p.last_name,
    dob:         p.birth_date ?? "",
    age:         calcAge(p.birth_date),
    sessions:    0,
    lastSession: null,
    status:      p.status,
    label:       STATUS_LABEL[p.status],
    meds:        medsString(p.medication_schedule),
    notes:       p.notes ?? "",
  }
}

// ─── Patient API ──────────────────────────────────────────────────

export async function getPatients(): Promise<Patient[]> {
  const data = await get<PatientAPI[]>("/patients/")
  return data.map(toPatient)
}

export interface PatientCreateInput {
  first: string
  last: string
  dob: string
  meds: string
  notes: string
}

export async function createPatient(input: PatientCreateInput): Promise<Patient> {
  const body = {
    first_name: input.first,
    last_name:  input.last,
    birth_date: input.dob || null,
    medication_schedule: input.meds ? { tekst: input.meds } : {},
    notes: input.notes || null,
    status: "info",
  }
  const data = await post<PatientAPI>("/patients/", body)
  return toPatient(data)
}

export async function updatePatient(id: string, input: Partial<PatientCreateInput> & { status?: PatientStatus }): Promise<Patient> {
  const body: Record<string, unknown> = {}
  if (input.first !== undefined) body.first_name = input.first
  if (input.last  !== undefined) body.last_name  = input.last
  if (input.dob   !== undefined) body.birth_date = input.dob || null
  if (input.meds  !== undefined) body.medication_schedule = input.meds ? { tekst: input.meds } : {}
  if (input.notes !== undefined) body.notes  = input.notes || null
  if (input.status !== undefined) body.status = input.status
  const data = await patch<PatientAPI>(`/patients/${id}`, body)
  return toPatient(data)
}

export async function deletePatient(id: string): Promise<void> {
  await del(`/patients/${id}`)
}

// ─── Overige endpoints (nog mock) ────────────────────────────────

export async function getTrends(patientId: string): Promise<TrendPoint[]> {
  // TODO: return get<TrendPoint[]>(`/patients/${patientId}/trends`)
  void patientId
  return Promise.resolve(TRENDS)
}

export async function getEscalations(): Promise<Escalation[]> {
  // TODO: return get<Escalation[]>("/escalations")
  return Promise.resolve(ESCALATIONS)
}

// ─── Chat ─────────────────────────────────────────────────────────

interface MessageResponseAPI {
  id: string
  session_id: string
  role: string
  content: string
  created_at: string
}

const CHAT_TIMEOUT_MS = 90_000

export async function sendMessage(
  patientId: string,
  content: string,
): Promise<{ reply: string; sessionId: string }> {
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
    const data = await res.json() as MessageResponseAPI
    return { reply: data.content, sessionId: data.session_id }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("timeout")
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}
