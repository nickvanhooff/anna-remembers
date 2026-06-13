"use client"

import { useEffect, useState } from "react"
import { Wind, Scale, Droplet, Pill, HeartPulse, Loader2, AlertCircle } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getSymptomObservation } from "@/lib/api"
import type { SymptomObservationRead } from "@/types"

interface SymptomDetailModalProps {
  sessionId: string | null
  patientId: string
  onClose: () => void
}

interface SymptomMeta {
  key: "dyspnea" | "weight_kg" | "edema" | "medication" | "fatigue"
  label: string
  color: string
  Icon: React.ComponentType<{ className?: string }>
}

const SYMPTOM_METAS: SymptomMeta[] = [
  { key: "dyspnea",    label: "Kortademigheid", color: "var(--chart-1)", Icon: Wind },
  { key: "weight_kg",  label: "Gewicht",        color: "var(--chart-2)", Icon: Scale },
  { key: "edema",      label: "Oedeem",         color: "var(--chart-3)", Icon: Droplet },
  { key: "medication", label: "Medicatietrouw", color: "var(--chart-4)", Icon: Pill },
  { key: "fatigue",    label: "Vermoeidheid",   color: "var(--chart-5)", Icon: HeartPulse },
]

export function SymptomDetailModal({
  sessionId,
  patientId,
  onClose,
}: SymptomDetailModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [observation, setObservation] = useState<SymptomObservationRead | null>(null)

  useEffect(() => {
    if (!sessionId) {
      const timer = setTimeout(() => {
        setObservation(null)
        setError(null)
      }, 0)
      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)
    }, 0)

    getSymptomObservation(patientId, sessionId)
      .then(setObservation)
      .catch(err => {
        console.error(err)
        setError("Kon de symptoomdetails niet ophalen.")
      })
      .finally(() => {
        setLoading(false)
      })

    return () => {
      clearTimeout(timer)
    }
  }, [sessionId, patientId])

  const formattedDate = observation?.observed_at
    ? new Date(observation.observed_at).toLocaleDateString("nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""

  return (
    <Dialog open={!!sessionId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Klinische toelichting</DialogTitle>
          <DialogDescription>
            {observation ? (
              <span>
                Sessie details · Week {observation.week_number}, {observation.year}
                {formattedDate && <span className="block text-xs mt-0.5 text-muted-foreground">Geregistreerd op {formattedDate}</span>}
              </span>
            ) : (
              "Symptoomobservatie details laden..."
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="size-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Gegevens ophalen bij de backend...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive-soft-bg text-destructive-soft-fg border border-destructive/20 my-2 font-normal">
            <AlertCircle className="size-5 shrink-0" />
            <span className="text-[13px]">{error}</span>
          </div>
        ) : observation ? (
          <div className="flex flex-col gap-4 py-2">
            {SYMPTOM_METAS.map((meta) => {
              const score = observation[meta.key]
              const reasoningText = observation.reasoning[meta.key]
              const isWeight = meta.key === "weight_kg"

              return (
                <div
                  key={meta.key}
                  className="p-3.5 rounded-xl border bg-card/50 flex flex-col gap-2.5 transition-all hover:bg-card"
                >
                  {/* Header info */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2" style={{ color: meta.color }}>
                      <meta.Icon className="size-4 shrink-0" />
                      <span className="text-[14px] font-medium text-foreground">{meta.label}</span>
                    </div>

                    <div className="text-[13.5px] font-semibold tabular-nums">
                      {score === null ? (
                        <span className="text-muted-foreground font-normal text-xs">(niet besproken)</span>
                      ) : isWeight ? (
                        <span style={{ color: meta.color }}>{score} kg</span>
                      ) : (
                        <span style={{ color: meta.color }}>Score: {score}/3</span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar for 0-3 score symptoms */}
                  {score !== null && !isWeight && (
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${(score / 3) * 100}%`,
                          backgroundColor: meta.color,
                        }}
                      />
                    </div>
                  )}

                  {/* Reasoning block */}
                  {reasoningText ? (
                    <div className="text-[12.5px] leading-relaxed text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/40 font-normal">
                      <div className="text-[10.5px] uppercase font-bold text-muted-foreground/60 mb-0.5 tracking-wider">
                        Onderbouwing Anna
                      </div>
                      &ldquo;{reasoningText}&rdquo;
                    </div>
                  ) : score !== null ? (
                    <div className="text-[12px] italic text-muted-foreground/80 pl-2 border-l border-border/80">
                      Geen specifieke toelichting geregistreerd.
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
