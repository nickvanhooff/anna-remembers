import { get } from "./_base"
import type { TrendPoint, SymptomObservationRead, SessionMemory } from "@/types"

export async function getTrends(
  patientId: string,
  weeks: number
): Promise<TrendPoint[]> {
  const data = await get<{ data: TrendPoint[] }>(
    `/patients/${patientId}/symptom-trends?weeks=${weeks}`
  )
  return data.data
}

export async function getSymptomObservation(
  patientId: string,
  sessionId: string
): Promise<SymptomObservationRead> {
  return get<SymptomObservationRead>(
    `/patients/${patientId}/symptom-observations/${sessionId}`
  )
}

export async function getSessionMemories(
  patientId: string,
  sessionId: string
): Promise<SessionMemory[]> {
  return get<SessionMemory[]>(
    `/patients/${patientId}/sessions/${sessionId}/memories`
  )
}
