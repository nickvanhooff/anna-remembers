import { get, patch } from "./_base"
import type { Escalation, EscalationUrgency, EscalationStatus } from "@/types"

// ─── Backend response type ─────────────────────────────────────────

interface EscalationAPI {
  id: string
  patient_id: string
  patient_name: string
  session_id: string | null
  reason: string
  urgency: "low" | "medium" | "high"
  status: "open" | "acknowledged" | "resolved"
  notification_status: string
  notes: string | null
  created_at: string
}

// ─── Mapping ──────────────────────────────────────────────────────

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
    notes: e.notes,
  }
}

// ─── Exports ──────────────────────────────────────────────────────

export async function getEscalations(): Promise<Escalation[]> {
  const data = await get<EscalationAPI[]>("/escalations/")
  return data.map(toEscalation)
}

export async function updateEscalationStatus(
  id: string,
  status: EscalationStatus,
  notes?: string
): Promise<Escalation> {
  const data = await patch<EscalationAPI>(`/escalations/${id}/status`, {
    status: STATUS_MAP_REVERSE[status],
    ...(notes !== undefined && { notes }),
  })
  return toEscalation(data)
}
