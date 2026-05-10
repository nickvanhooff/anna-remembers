import type { PatientStatus, EscalationUrgency } from "@/types"

const STYLES: Record<string, { bg: string; fg: string }> = {
  success: { bg: "var(--success-soft-bg)", fg: "var(--success-soft-fg)" },
  warning: { bg: "var(--warning-soft-bg)", fg: "var(--warning-soft-fg)" },
  urgent:  { bg: "var(--destructive-soft-bg)", fg: "var(--destructive-soft-fg)" },
  info:    { bg: "var(--info-soft-bg)", fg: "var(--info-soft-fg)" },
  in_progress: { bg: "var(--info-soft-bg)", fg: "var(--info-soft-fg)" },
  open:    { bg: "var(--warning-soft-bg)", fg: "var(--warning-soft-fg)" },
  closed:  { bg: "var(--success-soft-bg)", fg: "var(--success-soft-fg)" },
}

interface StatusBadgeProps {
  status: PatientStatus | EscalationUrgency | string
  label: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const s = STYLES[status] ?? STYLES.info
  return (
    <span
      className="inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <span className="size-1.5 rounded-full bg-current shrink-0" />
      {label}
    </span>
  )
}
