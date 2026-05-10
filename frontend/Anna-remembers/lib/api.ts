import type { Patient, Session, Escalation, TrendPoint } from "@/types"
import { PATIENTS, CHAT, TRENDS, ESCALATIONS } from "./mock-data"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return res.json() as Promise<T>
}

// TODO: vervang elke mock return door de echte get<>() aanroep zodra de backend actief is.

export async function getPatients(): Promise<Patient[]> {
  // return get<Patient[]>("/patients")
  return Promise.resolve(PATIENTS)
}

export async function getSessions(patientId: string): Promise<Session[]> {
  // return get<Session[]>(`/patients/${patientId}/sessions`)
  void patientId
  return Promise.resolve(CHAT)
}

export async function getTrends(patientId: string): Promise<TrendPoint[]> {
  // return get<TrendPoint[]>(`/patients/${patientId}/trends`)
  void patientId
  return Promise.resolve(TRENDS)
}

export async function getEscalations(): Promise<Escalation[]> {
  // return get<Escalation[]>("/escalations")
  return Promise.resolve(ESCALATIONS)
}

export async function sendMessage(patientId: string, sessionId: string, body: string): Promise<{ reply: string; tag?: string }> {
  // return post<...>(`/patients/${patientId}/sessions/${sessionId}/messages`, { body })
  void patientId; void sessionId
  const lower = body.toLowerCase()
  let reply: string
  let tag: string | undefined
  if (lower.includes("moe") || lower.includes("slaap")) {
    reply = "Vervelend om te horen. Heeft u een idee waardoor het komt — was er iets bijzonders deze week?"
  } else if (lower.includes("beter") || lower.includes("goed")) {
    reply = "Fijn dat het beter gaat. Ik zal dit noteren in uw dossier."
    tag = "Anna vermoedt"
  } else if (lower.includes("kortademig") || lower.includes("adem")) {
    reply = "Begrijp ik. Wanneer merkt u het het sterkst — bij inspanning, of ook in rust?"
  } else {
    reply = "Dank u. Mag ik vragen hoe het deze week met uw gewicht en medicatie is gegaan?"
  }
  return new Promise(resolve => setTimeout(() => resolve({ reply, tag }), 1100))
}
