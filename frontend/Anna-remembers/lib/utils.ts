import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function parseBackendDate(d: string): Date {
  // Backend stuurt naive UTC datetimes (datetime.utcnow zonder timezone-suffix).
  // Voeg "Z" toe zodat de browser het als UTC parseert en correct naar lokale tijd vertaalt.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(d)) return new Date(d)
  return new Date(d + "Z")
}

export function fmtDate(d: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = parseBackendDate(d)
  target.setHours(0, 0, 0, 0)
  const days = Math.floor((today.getTime() - target.getTime()) / 86400000)
  if (days === 0) return "vandaag"
  if (days === 1) return "gisteren"
  if (days < 7) return `${days} dagen geleden`
  if (days < 30) return `${Math.floor(days / 7)} wk geleden`
  return target.toLocaleDateString("nl-NL")
}

export function fmtDateTime(d: string): string {
  return parseBackendDate(d).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export function fmtTimeOf(d: string): string {
  return parseBackendDate(d).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
}

export function fmtTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}
