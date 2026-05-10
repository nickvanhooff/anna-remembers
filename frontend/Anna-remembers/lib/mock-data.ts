import type { Patient, Session, Escalation, TrendPoint } from "@/types"

export const PATIENTS: Patient[] = [
  { id: "P-001", first: "Greta",   last: "de Vries",  dob: "1951-04-12", age: 74, sessions: 12, lastSession: "2026-05-06", status: "success", label: "Stabiel",   meds: "Furosemide 40 mg · Bisoprolol 5 mg",          notes: "Voelt zich kortademig bij de trap. Gewicht stabiel." },
  { id: "P-002", first: "Hendrik", last: "Bakker",    dob: "1957-09-30", age: 68, sessions: 10, lastSession: "2026-05-03", status: "warning", label: "Aandacht",  meds: "Losartan 50 mg",                               notes: "Slaapt onrustig. Gewicht +1.2 kg afgelopen 2 weken." },
  { id: "P-003", first: "Marja",   last: "Kuipers",   dob: "1944-12-01", age: 81, sessions: 11, lastSession: "2026-05-08", status: "urgent",  label: "Urgent",    meds: "Furosemide 80 mg · Spironolacton 25 mg",      notes: "Zware kortademigheid sinds maandag. Anna heeft geëscaleerd." },
  { id: "P-004", first: "Johan",   last: "van Dijk",  dob: "1948-07-22", age: 77, sessions: 9,  lastSession: "2026-04-30", status: "success", label: "Stabiel",   meds: "Bisoprolol 2.5 mg",                           notes: "Doet wandelingen, voelt zich beter dan vorige maand." },
  { id: "P-005", first: "Truus",   last: "Hendriks",  dob: "1953-02-15", age: 73, sessions: 8,  lastSession: "2026-05-04", status: "success", label: "Stabiel",   meds: "Losartan 100 mg · Furosemide 20 mg",          notes: "" },
  { id: "P-006", first: "Ad",      last: "Janssen",   dob: "1959-11-08", age: 66, sessions: 6,  lastSession: "2026-05-07", status: "warning", label: "Aandacht",  meds: "Bisoprolol 5 mg · Furosemide 40 mg",          notes: "Vermoeidheid toegenomen. Zegt medicatie wel goed te nemen." },
]

export const CHAT: Session[] = [
  {
    sid: "session-12",
    date: "2026-05-06",
    msgs: [
      { role: "them", who: "Anna",  t: "09:42", body: "Goedemorgen mevrouw De Vries. Vorige week vertelde u dat u 's nachts wat onrustig sliep — hoe is dat deze week gegaan?" },
      { role: "me",   who: "Greta", t: "09:43", body: "Het ging beter. Ik heb maar één keer wakker gelegen." },
      { role: "them", who: "Anna",  t: "09:43", body: "Fijn om te horen. En de kortademigheid bij het traplopen — komt die nog terug?" },
      { role: "me",   who: "Greta", t: "09:44", body: "Soms nog wel, vooral als ik de trap snel op ga. Maar minder dan vorige week." },
      { role: "them", who: "Anna",  t: "09:45", body: "Begrijp ik. Heeft u uw gewicht deze week gemeten?" },
      { role: "me",   who: "Greta", t: "09:46", body: "78,2 kilo. Net zoveel als vorige week." },
      { role: "them", who: "Anna",  t: "09:46", body: "Dat is goed nieuws — uw gewicht is al drie weken stabiel.", tag: "Anna vermoedt" },
    ],
  },
  {
    sid: "session-11",
    date: "2026-04-29",
    msgs: [
      { role: "them", who: "Anna",  t: "09:38", body: "Goedemorgen mevrouw De Vries. Hoe gaat het met u vandaag?" },
      { role: "me",   who: "Greta", t: "09:39", body: "Ik ben moe vandaag. Ik heb slecht geslapen." },
      { role: "them", who: "Anna",  t: "09:39", body: "Wat vervelend. Wakker geweest van kortademigheid, of iets anders?" },
      { role: "me",   who: "Greta", t: "09:40", body: "Ik heb een paar keer wakker gelegen." },
    ],
  },
]

export const ESCALATIONS: Escalation[] = [
  { id: "E-2026-014", patient: "P-003", name: "Marja Kuipers",   urgency: "urgent",  status: "open",        opened: "2026-05-08T09:42:00", reason: "Zware kortademigheid sinds maandag. Patiënt meldt drie keer per nacht wakker te worden.",       channel: "Slack #zorg-urgent",  assignee: null },
  { id: "E-2026-013", patient: "P-002", name: "Hendrik Bakker",  urgency: "warning", status: "in_progress", opened: "2026-05-05T11:15:00", reason: "Patroon van toenemende kortademigheid en gewichtstoename (+1.2 kg) over 2 weken.",             channel: "Email · J. de Wit",   assignee: "J. de Wit" },
  { id: "E-2026-012", patient: "P-006", name: "Ad Janssen",      urgency: "warning", status: "in_progress", opened: "2026-05-04T08:30:00", reason: "Anna vermoedt verminderde medicatietrouw. Patiënt zegt het wel goed te doen.",                  channel: "Email · M. Visser",   assignee: "M. Visser" },
  { id: "E-2026-011", patient: "P-001", name: "Greta de Vries",  urgency: "info",    status: "closed",      opened: "2026-04-22T10:05:00", closed: "2026-04-25T14:00:00", reason: "Gemelde slaapproblemen. Beoordeeld — geen interventie nodig.", channel: "Email · J. de Wit",   assignee: "J. de Wit" },
  { id: "E-2026-010", patient: "P-004", name: "Johan van Dijk",  urgency: "info",    status: "closed",      opened: "2026-04-18T09:50:00", closed: "2026-04-20T11:30:00", reason: "Routine review na 8 sessies — alles in orde.",                  channel: "Email · M. Visser",   assignee: "M. Visser" },
]

export const TRENDS: TrendPoint[] = (() => {
  const days = 28
  const start = new Date("2026-04-10")
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return {
      date: d.toISOString().slice(0, 10),
      kortademigheid: Math.max(0, Math.min(10, 2 + Math.round(Math.sin(i / 6) * 1.2 + i * 0.1 + (Math.random() * 0.6 - 0.3)))),
      gewicht:        parseFloat((82 + i * 0.04 + Math.sin(i / 7) * 0.4).toFixed(1)),
      oedeem:         Math.max(0, Math.min(10, 1 + Math.round(Math.cos(i / 5) * 0.8 + i * 0.06))),
      medicatietrouw: i < 14 ? 100 : i < 22 ? 90 : 80,
      vermoeidheid:   Math.max(0, Math.min(10, 3 + Math.round(Math.sin(i / 8) * 1 + i * 0.05))),
    }
  })
})()
