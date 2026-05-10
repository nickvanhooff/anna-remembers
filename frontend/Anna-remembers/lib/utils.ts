import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtDate(d: string): string {
  const today = new Date("2026-05-10")
  const days = Math.floor((today.getTime() - new Date(d).getTime()) / 86400000)
  if (days === 0) return "vandaag"
  if (days === 1) return "gisteren"
  if (days < 7) return `${days} dagen geleden`
  if (days < 30) return `${Math.floor(days / 7)} wk geleden`
  return new Date(d).toLocaleDateString("nl-NL")
}

export function fmtTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}
