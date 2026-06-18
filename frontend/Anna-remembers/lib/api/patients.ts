import { get, post, patch, del } from "./_base"
import type { Patient, PatientStatus } from "@/types"

// ─── Backend response type ─────────────────────────────────────────

interface PatientAPI {
  id: string
  first_name: string
  last_name: string
  birth_date: string | null
  medication_schedule: Record<string, unknown>
  notes: string | null
  medical_summary: string | null
  status: PatientStatus
  session_count: number
  last_session_at: string | null
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
    sessions: p.session_count,
    lastSession: p.last_session_at,
    status: p.status,
    label: STATUS_LABEL[p.status],
    meds: medsString(p.medication_schedule),
    notes: p.notes ?? "",
    medicalSummary: p.medical_summary ?? null,
  }
}

// ─── Exports ──────────────────────────────────────────────────────

export interface PatientCreateInput {
  first: string
  last: string
  dob: string
  meds: string
  notes: string
}

export async function getPatients(): Promise<Patient[]> {
  const data = await get<PatientAPI[]>("/patients/")
  return data.map(toPatient)
}

export async function getPatient(id: string): Promise<Patient> {
  const data = await get<PatientAPI>(`/patients/${id}`)
  return toPatient(data)
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
