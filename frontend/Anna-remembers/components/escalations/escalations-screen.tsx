"use client"

import { useState, useMemo, useEffect } from "react"
import { AlertTriangle, ChevronRight, Check, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

import { StatusBadge } from "@/components/dashboard/status-badge"
import {
  EscalationReasonCompact,
  EscalationReasonDetail,
} from "@/components/escalations/escalation-reason-display"
import { fmtDate, fmtDateTime, fmtTimeOf } from "@/lib/utils"
import { getEscalations, updateEscalationStatus } from "@/lib/api"
import type { Escalation, EscalationStatus } from "@/types"

const URGENCY_PRIO: Record<string, number> = { urgent: 0, warning: 1, info: 2 }
const URGENCY_LABEL: Record<string, string>  = { urgent: "Urgent", warning: "Aandacht", info: "Info" }
const STATUS_LABEL:  Record<string, string>  = { open: "Open", in_progress: "In behandeling", closed: "Afgesloten" }

type FilterKey = "all" | EscalationStatus

export function EscalationsScreen() {
  const [items, setItems] = useState<Escalation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>("open")
  const [selected, setSelected] = useState<Escalation | null>(null)

  useEffect(() => {
    getEscalations()
      .then(setItems)
      .catch(() => toast.error("Escalaties konden niet worden geladen."))
      .finally(() => setLoading(false))
  }, [])

  const counts = useMemo(() => ({
    all:         items.length,
    open:        items.filter(i => i.status === "open").length,
    in_progress: items.filter(i => i.status === "in_progress").length,
    closed:      items.filter(i => i.status === "closed").length,
  }), [items])

  const visible = useMemo(() => {
    const arr = filter === "all" ? items : items.filter(i => i.status === filter)
    return [...arr].sort((a, b) => URGENCY_PRIO[a.urgency] - URGENCY_PRIO[b.urgency])
  }, [items, filter])

  async function setStatus(id: string, status: EscalationStatus) {
    try {
      const updated = await updateEscalationStatus(id, status)
      setItems(prev => prev.map(i => i.id === id ? updated : i))
      setSelected(null)
      toast.success(`Escalatie → ${STATUS_LABEL[status]}.`)
    } catch {
      toast.error("Status kon niet worden bijgewerkt.")
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <header className="flex h-14 items-center gap-3 border-b px-6 shrink-0 bg-background">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <span className="text-[13px] text-muted-foreground">
          Dashboard / <b className="text-foreground font-medium">Escalatiebeheer</b>
        </span>
      </header>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5 max-w-[1280px] w-full mx-auto">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">Escalatiebeheer</h1>
            <p className="text-[13.5px] text-muted-foreground mt-1">
              Anna escaleert wanneer patronen of patiëntmeldingen om actie vragen.{" "}
              {counts.open} open · {counts.in_progress} in behandeling.
            </p>
          </div>
        </div>

        <Card className="overflow-hidden rounded-xl">
          {/* Filter toolbar */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b">
            <Tabs value={filter} onValueChange={v => setFilter(v as FilterKey)}>
              <TabsList className="h-8">
                <TabsTrigger value="all"         className="text-xs px-3">Alle · {counts.all}</TabsTrigger>
                <TabsTrigger value="open"        className="text-xs px-3">Open · {counts.open}</TabsTrigger>
                <TabsTrigger value="in_progress" className="text-xs px-3">In behandeling · {counts.in_progress}</TabsTrigger>
                <TabsTrigger value="closed"      className="text-xs px-3">Afgesloten · {counts.closed}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground text-[13.5px]">
              <ShieldCheck className="size-8 opacity-40" />
              <p>Geen escalaties in deze categorie.</p>
              <p className="text-[13px]">Anna meldt het zodra er iets om aandacht vraagt.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28 text-xs">Urgentie</TableHead>
                  <TableHead className="text-xs">Patiënt &amp; reden</TableHead>
                  <TableHead className="w-36 text-xs">Geopend</TableHead>
                  <TableHead className="w-32 text-xs">Status</TableHead>
                  <TableHead className="w-24 text-xs">Kanaal</TableHead>
                  <TableHead className="w-12 text-xs" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(e => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => setSelected(e)}>
                    <TableCell><StatusBadge status={e.urgency} label={URGENCY_LABEL[e.urgency]} /></TableCell>
                    <TableCell>
                      <div className="font-medium text-[13.5px] mb-1">{e.name}</div>
                      <EscalationReasonCompact reason={e.reason} />
                    </TableCell>
                    <TableCell className="text-[12.5px] text-muted-foreground">
                      {fmtDate(e.opened)}
                      <br />
                      <span className="text-[11px] opacity-70">{fmtTimeOf(e.opened)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={e.status === "closed" ? "success" : e.status === "in_progress" ? "info" : "warning"}
                        label={STATUS_LABEL[e.status]}
                      />
                    </TableCell>
                    <TableCell className="text-[12.5px] text-muted-foreground">{e.channel}</TableCell>
                    <TableCell>
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {selected && (
        <EscalationDetail
          item={selected}
          onClose={() => setSelected(null)}
          onSetStatus={setStatus}
        />
      )}
    </div>
  )
}

// ─── Detail dialog ────────────────────────────────────────────────

function EscalationDetail({
  item,
  onClose,
  onSetStatus,
}: {
  item: Escalation
  onClose: () => void
  onSetStatus: (id: string, status: EscalationStatus) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)

  async function handle(status: EscalationStatus) {
    setSaving(true)
    await onSetStatus(item.id, status)
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            {URGENCY_LABEL[item.urgency]} · {STATUS_LABEL[item.status]} · geopend {fmtDate(item.opened)}
          </DialogDescription>
        </DialogHeader>

        {/* Escalatie callout */}
        <div
          className="flex gap-3 rounded-xl p-3.5"
          style={{ backgroundColor: "var(--warning-soft-bg)" }}
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: "var(--warning-soft-fg)" }} />
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Escalatie</div>
            <EscalationReasonDetail reason={item.reason} />
          </div>
        </div>

        {/* Detail grid */}
        <div className="grid grid-cols-2 gap-3.5">
          <DetailField label="Kanaal"   value={item.channel} />
          <DetailField label="Geopend"  value={fmtDateTime(item.opened)} />
        </div>

        {/* Clinical note */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-[12.5px]">Klinische notitie</Label>
          <Textarea className="min-h-[72px] resize-none" placeholder="Voeg een notitie toe voor het dossier…" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Sluiten</Button>
          {item.status !== "closed" && (
            <>
              {item.status === "open" && (
                <Button variant="outline" onClick={() => handle("in_progress")} disabled={saving}>
                  In behandeling
                </Button>
              )}
              <Button onClick={() => handle("closed")} disabled={saving}>
                <Check data-icon="inline-start" />
                Afsluiten
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className="text-[13.5px]">{value}</div>
    </div>
  )
}
