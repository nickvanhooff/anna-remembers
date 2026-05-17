"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus, MessageSquare, Pencil, Trash2, Users } from "lucide-react"
import { toast } from "sonner"

import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

import { StatusBadge } from "@/components/dashboard/status-badge"
import { fmtDate } from "@/lib/utils"
import { getPatients, createPatient, updatePatient, deletePatient as apiDeletePatient } from "@/lib/api"
import type { Patient, PatientStatus } from "@/types"

type StatusFilter = "all" | PatientStatus

export function PatientsScreen() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [addOpen, setAddOpen] = useState(false)
  const [editPatient, setEditPatient] = useState<Patient | null>(null)
  const [deletePatientState, setDeletePatientState] = useState<Patient | null>(null)

  useEffect(() => {
    getPatients()
      .then(setPatients)
      .catch(() => toast.error("Kon patiënten niet laden."))
      .finally(() => setLoading(false))
  }, [])

  const counts = useMemo(() => ({
    all:     patients.length,
    success: patients.filter(p => p.status === "success").length,
    warning: patients.filter(p => p.status === "warning").length,
    urgent:  patients.filter(p => p.status === "urgent").length,
  }), [patients])

  const filtered = useMemo(() => patients.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false
    if (query && !`${p.first} ${p.last} ${p.id}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [patients, query, statusFilter])

  async function savePatient(form: { first: string; last: string; dob: string; meds: string; notes: string }, isNew: boolean, id?: string) {
    try {
      if (isNew) {
        const created = await createPatient(form)
        setPatients(prev => [...prev, created])
        toast.success("Patiënt toegevoegd.")
      } else {
        const updated = await updatePatient(id!, form)
        setPatients(prev => prev.map(p => p.id === id ? updated : p))
        toast.success("Wijzigingen opgeslagen.")
      }
    } catch {
      toast.error("Opslaan mislukt. Controleer de verbinding met de backend.")
    }
  }

  async function removePatient(id: string) {
    try {
      await apiDeletePatient(id)
      setPatients(prev => prev.filter(p => p.id !== id))
      setDeletePatientState(null)
      toast.success("Patiënt verwijderd.")
    } catch {
      toast.error("Verwijderen mislukt.")
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <header className="flex h-14 items-center gap-3 border-b px-6 shrink-0 bg-background">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-[13px] text-muted-foreground">Dashboard / <b className="text-foreground font-medium">Patiëntbeheer</b></span>
        </header>
        <div className="flex-1 p-6 flex flex-col gap-3 max-w-[1280px] w-full mx-auto">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <header className="flex h-14 items-center gap-3 border-b px-6 shrink-0 bg-background">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <span className="text-[13px] text-muted-foreground">
          Dashboard / <b className="text-foreground font-medium">Patiëntbeheer</b>
        </span>
      </header>

      {/* Page content */}
      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5 max-w-[1280px] w-full mx-auto">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">Patiëntbeheer</h1>
            <p className="text-[13.5px] text-muted-foreground mt-1">
              {counts.all} patiënten · {counts.urgent} urgent · {counts.warning} aandacht
            </p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus data-icon="inline-start" />
            Nieuwe patiënt
          </Button>
        </div>

        <Card className="overflow-hidden rounded-xl">
          {/* Toolbar */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-[13.5px]"
                placeholder="Zoeken op naam of ID…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
              <TabsList className="h-8">
                <TabsTrigger value="all"     className="text-xs px-3">Alle · {counts.all}</TabsTrigger>
                <TabsTrigger value="success" className="text-xs px-3">Stabiel · {counts.success}</TabsTrigger>
                <TabsTrigger value="warning" className="text-xs px-3">Aandacht · {counts.warning}</TabsTrigger>
                <TabsTrigger value="urgent"  className="text-xs px-3">Urgent · {counts.urgent}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground text-[13.5px]">
              <Users className="size-8 opacity-40" />
              <p>Nog geen patiënten gevonden.</p>
              <p className="text-[13px]">Pas je filters aan of voeg een nieuwe patiënt toe.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 text-xs">ID</TableHead>
                  <TableHead className="text-xs">Patiënt</TableHead>
                  <TableHead className="w-20 text-xs">Leeftijd</TableHead>
                  <TableHead className="text-xs">Medicatie</TableHead>
                  <TableHead className="text-xs">Laatste sessie</TableHead>
                  <TableHead className="w-28 text-xs">Status</TableHead>
                  <TableHead className="w-24 text-xs" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id} className="cursor-pointer">
                    <TableCell className="font-mono text-[12px] text-muted-foreground">{String(p.id).slice(0, 8)}…</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-7 shrink-0">
                          <AvatarFallback className="text-xs bg-accent text-accent-foreground">
                            {p.first[0]}{p.last[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-[13.5px]">{p.first} {p.last}</div>
                          <div className="text-[11.5px] text-muted-foreground">Sessies · {p.sessions}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{p.age || "—"}</TableCell>
                    <TableCell className="text-[12.5px] text-muted-foreground max-w-[180px] truncate">{p.meds || "—"}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{p.lastSession ? fmtDate(p.lastSession) : "—"}</TableCell>
                    <TableCell><StatusBadge status={p.status} label={p.label} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="size-7" title="Chat openen"
                          onClick={e => { e.stopPropagation(); router.push(`/chat?patient=${p.id}`) }}>
                          <MessageSquare className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" title="Bewerken"
                          onClick={e => { e.stopPropagation(); setEditPatient(p) }}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" title="Verwijderen"
                          onClick={e => { e.stopPropagation(); setDeletePatientState(p) }}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Add / Edit dialog */}
      <PatientFormDialog
        open={addOpen || !!editPatient}
        patient={editPatient}
        onClose={() => { setAddOpen(false); setEditPatient(null) }}
        onSave={async (form, isNew) => {
          await savePatient(form, isNew, editPatient?.id)
          setAddOpen(false)
          setEditPatient(null)
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletePatientState} onOpenChange={() => setDeletePatientState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Patiënt verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle gespreksgeschiedenis en trends van {deletePatientState?.first} {deletePatientState?.last} gaan verloren.
              Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              style={{ backgroundColor: "var(--destructive-soft-bg)", color: "var(--destructive-soft-fg)" }}
              onClick={() => deletePatientState && removePatient(deletePatientState.id)}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── PatientFormDialog ───────────────────────────────────────────

interface PatientFormInput {
  first: string
  last: string
  dob: string
  meds: string
  notes: string
}

interface PatientFormProps {
  open: boolean
  patient: Patient | null
  onClose: () => void
  onSave: (form: PatientFormInput, isNew: boolean) => Promise<void>
}

function PatientFormDialog({ open, patient, onClose, onSave }: PatientFormProps) {
  const [first, setFirst] = useState(patient?.first ?? "")
  const [last,  setLast]  = useState(patient?.last  ?? "")
  const [dob,   setDob]   = useState(patient?.dob   ?? "")
  const [meds,  setMeds]  = useState(patient?.meds  ?? "")
  const [notes, setNotes] = useState(patient?.notes ?? "")
  const [errs,  setErrs]  = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setFirst(patient?.first ?? "")
    setLast(patient?.last ?? "")
    setDob(patient?.dob ?? "")
    setMeds(patient?.meds ?? "")
    setNotes(patient?.notes ?? "")
    setErrs({})
  }, [open, patient])

  async function submit() {
    const e: Record<string, string> = {}
    if (!first.trim()) e.first = "Voornaam is verplicht."
    if (!last.trim())  e.last  = "Achternaam is verplicht."
    if (!dob)          e.dob   = "Geboortedatum is verplicht."
    if (Object.keys(e).length) { setErrs(e); return }
    setSaving(true)
    await onSave({ first, last, dob, meds, notes }, !patient)
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{patient ? "Patiënt bewerken" : "Nieuwe patiënt"}</DialogTitle>
          <DialogDescription>
            {patient
              ? `${patient.id} · ${patient.first} ${patient.last}`
              : "Vul de basisgegevens in. Anna start automatisch met de eerste check-in."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3.5 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="first" className="text-[12.5px]">Voornaam</Label>
            <Input
              id="first" value={first} onChange={e => setFirst(e.target.value)}
              aria-invalid={!!errs.first}
              style={errs.first ? { borderColor: "var(--destructive)" } : {}}
            />
            {errs.first && <p className="text-[12px]" style={{ color: "var(--destructive-soft-fg)" }}>{errs.first}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="last" className="text-[12.5px]">Achternaam</Label>
            <Input
              id="last" value={last} onChange={e => setLast(e.target.value)}
              aria-invalid={!!errs.last}
              style={errs.last ? { borderColor: "var(--destructive)" } : {}}
            />
            {errs.last && <p className="text-[12px]" style={{ color: "var(--destructive-soft-fg)" }}>{errs.last}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dob" className="text-[12.5px]">Geboortedatum</Label>
            <Input
              id="dob" type="date" value={dob} onChange={e => setDob(e.target.value)}
              aria-invalid={!!errs.dob}
              style={errs.dob ? { borderColor: "var(--destructive)" } : {}}
            />
            {errs.dob && <p className="text-[12px]" style={{ color: "var(--destructive-soft-fg)" }}>{errs.dob}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12.5px]">Patiënt-ID</Label>
            <Input disabled value={patient?.id ?? "Automatisch toegekend"} className="opacity-55" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meds" className="text-[12.5px]">Medicatie</Label>
          <Input id="meds" value={meds} onChange={e => setMeds(e.target.value)}
            placeholder="Bijv. Furosemide 40 mg · Bisoprolol 5 mg" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes" className="text-[12.5px]">Notitie</Label>
          <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Klinische context, bijzonderheden, afspraken…"
            className="min-h-[72px] resize-none" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annuleren</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Bezig…" : patient ? "Opslaan" : "Patiënt aanmaken"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
