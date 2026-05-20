"use client"

import { useMemo } from "react"

import { cn } from "@/lib/utils"
import {
  escalationLayerShort,
  parseEscalationReason,
} from "@/lib/parse-escalation-reason"

function LayerBadge({ layer }: { layer: string }) {
  const short = escalationLayerShort(layer) ?? layer
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5",
        "text-[10px] font-medium uppercase tracking-wide",
        "bg-muted text-muted-foreground border border-border/60",
      )}
    >
      {short}
    </span>
  )
}

/** Table cell: layer badge + patient message prominent, assessment secondary. */
export function EscalationReasonCompact({ reason }: { reason: string }) {
  const parsed = useMemo(() => parseEscalationReason(reason), [reason])

  return (
    <div className="space-y-1 min-w-0">
      {parsed.layer ? <LayerBadge layer={parsed.layer} /> : null}
      {parsed.patientMessage ? (
        <>
          <p className="text-[12.5px] text-foreground leading-snug line-clamp-2 font-medium">
            «{parsed.patientMessage}»
          </p>
          {parsed.detail ? (
            <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1">
              {parsed.detail}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-[12.5px] text-muted-foreground leading-snug line-clamp-2">
          {parsed.detail ?? parsed.raw}
        </p>
      )}
    </div>
  )
}

/** Detail dialog: structured sections Patiëntbericht / Beoordeling / Laag. */
export function EscalationReasonDetail({ reason }: { reason: string }) {
  const parsed = useMemo(() => parseEscalationReason(reason), [reason])

  return (
    <div className="space-y-3 min-w-0">
      {parsed.layer ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Detectie
          </span>
          <LayerBadge layer={parsed.layer} />
          <span className="text-[11px] text-muted-foreground">{parsed.layer}</span>
        </div>
      ) : null}

      {parsed.patientMessage ? (
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
            Patiëntbericht
          </div>
          <blockquote className="rounded-lg border bg-background/80 px-3 py-2.5 text-[15px] leading-relaxed text-foreground not-italic">
            {parsed.patientMessage}
          </blockquote>
        </div>
      ) : null}

      {parsed.detail ? (
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Beoordeling
          </div>
          <p className="text-[13.5px] text-muted-foreground leading-relaxed">{parsed.detail}</p>
        </div>
      ) : null}

      {!parsed.patientMessage && !parsed.detail ? (
        <p className="text-[14px] leading-relaxed text-muted-foreground">{parsed.raw}</p>
      ) : null}

      {parsed.isLegacy && !parsed.patientMessage ? (
        <p className="text-[11px] text-muted-foreground/80 border-t pt-2">
          Oud formaat — het originele patiëntbericht staat niet in dit record.
        </p>
      ) : null}
    </div>
  )
}
