export type PatientStatus = "success" | "warning" | "urgent" | "info"
export type EscalationUrgency = "urgent" | "warning" | "info"
export type EscalationStatus = "open" | "in_progress" | "closed"

export interface MedicalSummaryJSON {
  sym: string[]
  med: string | null
  wgt: string | null
  bhv: string | null
  ovr: string[]
}

export interface Patient {
  id: string
  first: string
  last: string
  dob: string
  age: number
  sessions: number
  lastSession: string | null
  status: PatientStatus
  label: string
  meds: string
  notes: string
  medicalSummary: string | null
}

// Mood = animatie/model-key uit de backend (komt overeen met .glb bestandsnamen in /public, zonder extensie)
export type Mood =
  | "standard_waiting"
  | "stand_look_around"
  | "running_fast"
  | "standard_walk_crouching"
  | "flexing_arm"
  | "gorilla"
  | "laying_on_floor"
  | "just_chilling"
  | "angry"
  | "Expressing_joy"
  | "model"
  | "model (13)"

export interface Message {
  role: "me" | "them"
  who: string
  t: string
  body: string
  tag?: string
  mood?: Mood
}

export interface Session {
  sid: string
  date: string
  msgs: Message[]
}

export interface Escalation {
  id: string
  patient: string
  name: string
  urgency: EscalationUrgency
  status: EscalationStatus
  reason: string
  channel: string
  assignee: string | null
  opened: string
  closed?: string | null
}

export interface TrendPoint {
  date: string
  kortademigheid: number
  gewicht: number
  oedeem: number
  medicatietrouw: number
  vermoeidheid: number
}
