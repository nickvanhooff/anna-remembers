/** Structured view of `escalations.reason` (backend `format_escalation_reason`). */

export interface ParsedEscalationReason {
  raw: string
  layer?: string
  patientMessage?: string
  detail?: string
  /** No `Patiëntbericht: «…»` — legacy Layer-1 bracket text or bare keyword line */
  isLegacy: boolean
}

const NEW_FORMAT_RE =
  /^(.+?)\s*·\s*Patiëntbericht:\s*«([\s\S]*?)»(?:\s*·\s*([\s\S]+))?$/u

const LEGACY_LAYER1_RE = /^\[Layer\s*(\d+)\s*—\s*([^\]]+)\]\s*([\s\S]*)$/u

/** Parses reason string from PostgreSQL into layer, patient message, and detail. */
export function parseEscalationReason(reason: string): ParsedEscalationReason {
  const raw = reason.trim()
  if (!raw) {
    return { raw, isLegacy: true }
  }

  const modern = raw.match(NEW_FORMAT_RE)
  if (modern) {
    return {
      raw,
      layer: modern[1].trim(),
      patientMessage: modern[2].trim(),
      detail: modern[3]?.trim() || undefined,
      isLegacy: false,
    }
  }

  const legacyL1 = raw.match(LEGACY_LAYER1_RE)
  if (legacyL1) {
    return {
      raw,
      layer: `Laag ${legacyL1[1]} (${legacyL1[2].trim()})`,
      detail: legacyL1[3].trim() || undefined,
      isLegacy: true,
    }
  }

  if (
    raw.startsWith("Kritiek sleutelwoord") ||
    raw.startsWith("Waarschuwingssleutelwoord")
  ) {
    return {
      raw,
      layer: "Laag 0 (keywords)",
      detail: raw,
      isLegacy: true,
    }
  }

  return { raw, isLegacy: true }
}

/** Short label for table badge, e.g. "Laag 0" or "Laag 1". */
export function escalationLayerShort(layer?: string): string | null {
  if (!layer) return null
  const m = layer.match(/Laag\s*(\d+)/i)
  return m ? `Laag ${m[1]}` : layer.length > 24 ? `${layer.slice(0, 22)}…` : layer
}
