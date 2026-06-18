import type { Animation } from "@/types"

export const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}

export async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}

export async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" })
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
}

// ─── Shared response types ─────────────────────────────────────────

export interface MessageResponseAPI {
  id: string
  session_id: string
  role: string
  content: string
  created_at: string
  animation?: string | null
  summary_update_triggered?: boolean
  escalation_triggered?: boolean
}

export const VALID_ANIMATIONS = [
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

export function resolveAnimation(raw: string | null | undefined): Animation {
  return raw && (VALID_ANIMATIONS as readonly string[]).includes(raw)
    ? (raw as Animation)
    : "standard_waiting"
}
