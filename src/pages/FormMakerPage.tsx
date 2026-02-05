import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { createForm, deleteForm, getForm, listForms } from "@/lib/formBuilderApi"
import { getCurrentApiBaseUrl, pingApi } from "@/lib/apiClient"
import type { FormDefinition, FormSummary, FormType } from "@/types/formBuilder"
import {
  ACTIVE_FORM_UPDATED_EVENT,
  getActiveFormId,
  readActiveFormConfig,
  setActiveFormId,
  syncActiveFormConfig,
} from "@/lib/activeForm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Folder, UploadCloud } from "lucide-react"

const statusStyles: Record<string, string> = {
  draft: "bg-slate-500",
  published: "bg-emerald-600",
  archived: "bg-zinc-600",
}

const formatDate = (value?: string | null) => {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

export default function FormMakerPage() {
  const navigate = useNavigate()
  const [forms, setForms] = useState<FormSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [pinging, setPinging] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FormSummary | null>(null)
  const [pushingId, setPushingId] = useState<string | null>(null)
  const [activeForms, setActiveForms] = useState(readActiveFormConfig)

  const fetchForms = async () => {
    setLoading(true)
    try {
      const results = await listForms()
      setForms(results)
    } catch (error) {
      console.error("Failed to load forms", error)
      toast.error("Could not load forms. Is the API running?")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchForms()
  }, [])

  useEffect(() => {
    let cancelled = false
    syncActiveFormConfig()
      .then((config) => {
        if (!cancelled) {
          setActiveForms(config)
        }
      })
      .catch((error) => {
        console.warn("Failed to sync active form config", error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleActiveUpdate = () => {
      setActiveForms(readActiveFormConfig())
    }
    window.addEventListener(ACTIVE_FORM_UPDATED_EVENT, handleActiveUpdate)
    return () => {
      window.removeEventListener(ACTIVE_FORM_UPDATED_EVENT, handleActiveUpdate)
    }
  }, [])

  const seasonFolders = useMemo(() => {
    const pickLatest = (current: FormSummary | undefined, candidate: FormSummary) => {
      if (!current) return candidate
      const currentStamp = Date.parse(current.updatedAt || current.createdAt || "") || 0
      const candidateStamp = Date.parse(candidate.updatedAt || candidate.createdAt || "") || 0
      return candidateStamp >= currentStamp ? candidate : current
    }

    const map = new Map<
      string,
      { match?: FormSummary; pit?: FormSummary; matchCount: number; pitCount: number }
    >()

    forms.forEach((form) => {
      const year = form.year || "Unknown"
      const entry = map.get(year) || { matchCount: 0, pitCount: 0 }
      const formType: FormType = form.type === "pit" ? "pit" : "match"
      if (formType === "pit") {
        entry.pitCount += 1
        entry.pit = pickLatest(entry.pit, form)
      } else {
        entry.matchCount += 1
        entry.match = pickLatest(entry.match, form)
      }
      map.set(year, entry)
    })

    if (map.size === 0) {
      const fallbackYear = new Date().getFullYear().toString()
      map.set(fallbackYear, { matchCount: 0, pitCount: 0 })
    }

    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [forms])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteForm(deleteTarget.id)
      toast.success(`Deleted ${deleteTarget.name}`)
      setForms((prev) => prev.filter((form) => form.id !== deleteTarget.id))
    } catch (error) {
      console.error("Failed to delete form", error)
      toast.error("Could not delete form.")
    } finally {
      setDeleteTarget(null)
    }
  }

  const handlePing = async () => {
    setPinging(true)
    try {
      const health = await pingApi()
      const base = getCurrentApiBaseUrl()
      const status = health.status ?? "ok"
      toast.success(`API OK (${status}). ${base}`)
    } catch (error) {
      console.error("API ping failed", error)
      toast.error("API ping failed. Check the backend URL and CORS settings.")
    } finally {
      setPinging(false)
    }
  }

  const createId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
    return `id_${Math.random().toString(36).slice(2, 10)}`
  }

  const toSummary = (form: { id: string; name: string; year: string; description?: string | null; type: FormType; status: string; createdAt?: string | null; updatedAt?: string | null }): FormSummary => ({
    id: form.id,
    name: form.name,
    year: form.year,
    description: form.description ?? null,
    type: form.type,
    status: form.status as FormSummary["status"],
    createdAt: form.createdAt ?? null,
    updatedAt: form.updatedAt ?? null,
  })

  const ensureBackupForSeason = async (type: FormType) => {
    const backupName = "2025 Scouting Season"
    const backupExists = forms.some(
      (form) => form.type === type && form.name.trim().toLowerCase() === backupName.toLowerCase()
    )
    if (backupExists) return

    const activeId = getActiveFormId(type)
    let sourceId = activeId

    if (!sourceId) {
      const candidate = forms
        .filter((form) => form.type === type && form.year === "2025")
        .sort((a, b) => {
          const aStamp = Date.parse(a.updatedAt || a.createdAt || "") || 0
          const bStamp = Date.parse(b.updatedAt || b.createdAt || "") || 0
          return bStamp - aStamp
        })[0]
      sourceId = candidate?.id || ""
    }

    if (!sourceId) return

    try {
      const sourceForm = await getForm(sourceId)
      const backupForm: FormDefinition = {
        ...sourceForm,
        id: createId(),
        name: backupName,
        year: "2025",
        status: "archived",
        createdAt: null,
        updatedAt: null,
      }
      const created = await createForm(backupForm)
      setForms((prev) => [...prev, toSummary(created)])
      localStorage.setItem("form_builder:backup_2025_done", "true")
    } catch (error) {
      console.warn("Failed to back up the existing form", error)
    }
  }

  const handlePushToScoutView = async (form: FormSummary) => {
    if (!form?.id) return
    setPushingId(form.id)
    try {
      if (localStorage.getItem("form_builder:backup_2025_done") !== "true") {
        await ensureBackupForSeason(form.type)
      }
      setActiveFormId(form.type, form.id)
      setActiveForms(readActiveFormConfig())
      toast.success(`Pushed "${form.name}" to scout view`)
    } catch (error) {
      console.error("Failed to push form to scout view", error)
      toast.error("Could not push form to scout view.")
    } finally {
      setPushingId(null)
    }
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Form Maker</h1>
          <p className="text-muted-foreground">
            Build scouting forms by season. Draft, publish, and iterate without touching code.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchForms} disabled={loading}>
            Refresh
          </Button>
          <Button variant="outline" onClick={handlePing} disabled={pinging}>
            {pinging ? "Pinging…" : "Ping API"}
          </Button>
          <Button onClick={() => navigate("/form-maker/new")}>New Form</Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardHeader>
            <CardTitle>Loading forms…</CardTitle>
            <CardDescription>Pulling the latest form definitions.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        seasonFolders.map(([year, entry]) => (
          <Card key={year} className="border-muted/60">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg border bg-muted p-2">
                  <Folder className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-xl">Season {year}</CardTitle>
                  <CardDescription>
                    Normal scouting and pit scouting forms live in this season folder.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {[
                { type: "match" as FormType, label: "Normal scouting", form: entry.match, count: entry.matchCount },
                { type: "pit" as FormType, label: "Pit scouting", form: entry.pit, count: entry.pitCount },
              ].map(({ type, label, form, count }) => (
                <Card key={`${year}-${type}`} className="flex h-full flex-col">
                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{label}</CardTitle>
                        <CardDescription>
                          {form?.name || "Not created yet."}
                        </CardDescription>
                      </div>
                      {form ? (
                        <Badge className={`${statusStyles[form.status] || "bg-slate-500"} text-white`}>
                          {form.status}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Missing</Badge>
                      )}
                    </div>
                    {form && (type === "match" ? activeForms.match === form.id : activeForms.pit === form.id) ? (
                      <Badge variant="secondary" className="w-fit">
                        Live in scout view
                      </Badge>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      {form
                        ? `Updated ${formatDate(form.updatedAt)} • Created ${formatDate(form.createdAt)}`
                        : "Create this form to start designing sections and fields."}
                    </div>
                  </CardHeader>
                  <CardContent className="mt-auto flex flex-wrap items-center gap-2">
                    {form ? (
                      <>
                        <Button variant="secondary" onClick={() => navigate(`/form-maker/${form.id}`)}>
                          Open builder
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handlePushToScoutView(form)}
                          disabled={pushingId === form.id}
                        >
                          <UploadCloud className="mr-2 h-4 w-4" />
                          {pushingId === form.id ? "Pushing…" : "Push to scout view"}
                        </Button>
                        <Button variant="outline" onClick={() => setDeleteTarget(form)}>
                          Delete
                        </Button>
                      </>
                    ) : (
                      <Button onClick={() => navigate(`/form-maker/new?year=${encodeURIComponent(year)}&type=${type}`)}>
                        Create form
                      </Button>
                    )}
                    {count > 1 ? (
                      <span className="text-xs text-muted-foreground">+{count - 1} more saved</span>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this form?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the form and its schema. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
