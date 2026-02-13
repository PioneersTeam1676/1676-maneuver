import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { createForm, deleteForm, getForm, getSeasonDbConfig, listForms, updateForm, updateSeasonDbConfig } from "@/lib/formBuilderApi"
import { getCurrentApiBaseUrl, pingApi } from "@/lib/apiClient"
import type { FormDbConfig, FormDefinition, FormSummary, FormType } from "@/types/formBuilder"
import { UI_PRESET_OPTIONS, getUiPreset, type UiPresetKey } from "@/lib/formSchema"
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
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Folder, UploadCloud, Import } from "lucide-react"

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
  const [importing, setImporting] = useState(false)
  const [presetKey, setPresetKey] = useState<UiPresetKey>("default")
  const [applyingPreset, setApplyingPreset] = useState(false)
  const [seasonDbDialog, setSeasonDbDialog] = useState<{ open: boolean; year: string }>({ open: false, year: "" })
  const [seasonDbLoading, setSeasonDbLoading] = useState(false)
  const [seasonDbSaving, setSeasonDbSaving] = useState(false)
  const [seasonDbUpdatedAt, setSeasonDbUpdatedAt] = useState<string | null>(null)
  const [seasonDbConfig, setSeasonDbConfig] = useState<FormDbConfig>({
    host: "",
    name: "",
    user: "",
    pass: "",
    engine: "mysql",
  })

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
      { match?: FormSummary; pit?: FormSummary; drive?: FormSummary; matchCount: number; pitCount: number; driveCount: number }
    >()

    forms.forEach((form) => {
      const year = form.year || "Unknown"
      const entry = map.get(year) || { matchCount: 0, pitCount: 0, driveCount: 0 }
      const formType: FormType = form.type === "pit" ? "pit" : form.type === "drive" ? "drive" : "match"
      
      if (formType === "pit") {
        entry.pitCount += 1
        entry.pit = pickLatest(entry.pit, form)
      } else if (formType === "drive") {
        entry.driveCount += 1
        entry.drive = pickLatest(entry.drive, form)
      } else {
        entry.matchCount += 1
        entry.match = pickLatest(entry.match, form)
      }
      map.set(year, entry)
    })

    if (map.size === 0) {
      const fallbackYear = new Date().getFullYear().toString()
      map.set(fallbackYear, { matchCount: 0, pitCount: 0, driveCount: 0 })
    }

    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [forms])

  const selectedPreset = useMemo(
    () => UI_PRESET_OPTIONS.find((option) => option.key === presetKey),
    [presetKey]
  )

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

  const handleImport = (file?: File | null) => {
    if (!file) return
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result
      if (typeof text !== "string") {
        setImporting(false)
        return
      }
      try {
        const json = JSON.parse(text)
        if (!json.name || !json.schema) {
          throw new Error("Invalid form format")
        }
        // Force new ID and status
        const payload: FormDefinition = {
          ...json,
          id: createId(),
          name: `${json.name} (Imported)`,
          status: "draft",
          createdAt: null,
          updatedAt: null,
        }
        const created = await createForm(payload)
        setForms(prev => [...prev, toSummary(created)])
        toast.success("Form imported successfully.")
        navigate(`/form-maker/${created.id}`)
      } catch (error) {
        console.error("Import failed", error)
        toast.error("Failed to import form. Invalid JSON?")
      } finally {
        setImporting(false)
      }
    }
    reader.onerror = () => {
      toast.error("Failed to read file")
      setImporting(false)
    }
    reader.readAsText(file)
  }

  const handleApplyPresetAll = async () => {
    if (forms.length === 0) {
      toast.error("No forms available to update.")
      return
    }
    setApplyingPreset(true)
    const preset = getUiPreset(presetKey)
    const updated: FormSummary[] = []
    let failed = 0

    for (const summary of forms) {
      try {
        const full = await getForm(summary.id)
        const payload: FormDefinition = {
          ...full,
          schema: {
            ...full.schema,
            ui: preset,
          },
        }
        const saved = await updateForm(payload)
        updated.push(toSummary(saved))
      } catch (error) {
        failed += 1
        console.error("Failed to update form preset", summary.id, error)
      }
    }

    if (updated.length > 0) {
      const updatedMap = new Map(updated.map((item) => [item.id, item]))
      setForms((prev) => prev.map((form) => updatedMap.get(form.id) ?? form))
    }

    if (failed > 0) {
      toast.error(`Updated ${updated.length} forms, ${failed} failed.`)
    } else {
      toast.success(`Applied "${selectedPreset?.label || presetKey}" to ${updated.length} forms.`)
    }

    setApplyingPreset(false)
  }

  const openSeasonDbModal = async (year: string) => {
    const normalizedYear = (year.match(/(19|20)\d{2}/) || [])[0] || ""
    if (!normalizedYear) return

    setSeasonDbDialog({ open: true, year: normalizedYear })
    setSeasonDbLoading(true)
    setSeasonDbUpdatedAt(null)
    try {
      const response = await getSeasonDbConfig(normalizedYear)
      setSeasonDbConfig({
        host: response.db.host || "",
        name: response.db.name || "",
        user: response.db.user || "",
        pass: "",
        engine: response.db.engine || "mysql",
      })
      setSeasonDbUpdatedAt(response.updatedAt || null)
    } catch (error) {
      console.error("Failed to load season DB config", error)
      toast.error("Could not load season DB config.")
      setSeasonDbDialog({ open: false, year: "" })
    } finally {
      setSeasonDbLoading(false)
    }
  }

  const handleSaveSeasonDbConfig = async () => {
    if (!seasonDbDialog.year) return
    setSeasonDbSaving(true)
    try {
      const response = await updateSeasonDbConfig(seasonDbDialog.year, seasonDbConfig)
      setSeasonDbConfig({
        host: response.db.host || "",
        name: response.db.name || "",
        user: response.db.user || "",
        pass: "",
        engine: response.db.engine || "mysql",
      })
      setSeasonDbUpdatedAt(response.updatedAt || null)
      toast.success(`Saved shared DB config for Season ${seasonDbDialog.year}.`)
      await fetchForms()
    } catch (error) {
      console.error("Failed to save season DB config", error)
      toast.error("Could not save season DB config.")
    } finally {
      setSeasonDbSaving(false)
    }
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-4 pb-8 pt-0 animate-in fade-in-0 duration-300">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/50 px-3 py-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">Form Maker</h1>
          <p className="text-xs text-muted-foreground">
            Build scouting forms by season. Draft, publish, and iterate without touching code.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchForms} disabled={loading}>
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={handlePing} disabled={pinging}>
            {pinging ? "Pinging…" : "Ping API"}
          </Button>
          <div className="relative">
            <Button size="sm" variant="outline" disabled={importing}>
              <Import className="mr-2 h-4 w-4" />
              {importing ? "Importing…" : "Import"}
              <input
                type="file"
                className="absolute inset-0 cursor-pointer opacity-0"
                accept=".json"
                onChange={(e) => {
                  handleImport(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
            </Button>
          </div>
          <Button size="sm" onClick={() => navigate("/form-maker/new")}>New Form</Button>
        </div>
      </div>

      <Card className="border-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
        <CardHeader>
          <CardTitle>Style Presets</CardTitle>
          <CardDescription>Apply a consistent layout and button style across every form.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Select value={presetKey} onValueChange={(value) => setPresetKey(value as UiPresetKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UI_PRESET_OPTIONS.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {selectedPreset?.description || "Choose a preset to apply."}
            </p>
          </div>
          <Button variant="outline" onClick={handleApplyPresetAll} disabled={applyingPreset}>
            {applyingPreset ? "Applying..." : "Apply to all forms"}
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardHeader>
            <CardTitle>Loading forms…</CardTitle>
            <CardDescription>Pulling the latest form definitions.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        seasonFolders.map(([year, entry]) => (
          <Card key={year} className="border-muted/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg border bg-muted p-2">
                  <Folder className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-xl">Season {year}</CardTitle>
                  <CardDescription>
                    Match, pit, and drive team scouting forms live in this season folder.
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openSeasonDbModal(year)}
                disabled={!/(19|20)\d{2}/.test(year)}
              >
                Season DB Config
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              {[
                { type: "match" as FormType, label: "Normal scouting", form: entry.match, count: entry.matchCount },
                { type: "pit" as FormType, label: "Pit scouting", form: entry.pit, count: entry.pitCount },
                { type: "drive" as FormType, label: "Drive Team scouting", form: entry.drive, count: entry.driveCount },
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
                    {form && ((type === "match" && activeForms.match === form.id) || (type === "pit" && activeForms.pit === form.id) || (type === "drive" && activeForms.drive === form.id)) ? (
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

      <Dialog
        open={seasonDbDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setSeasonDbDialog({ open: false, year: "" })
            setSeasonDbUpdatedAt(null)
          } else {
            setSeasonDbDialog((prev) => ({ ...prev, open: true }))
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Season {seasonDbDialog.year} DB Config</DialogTitle>
            <DialogDescription>
              Shared database config for every form in this season folder.
            </DialogDescription>
          </DialogHeader>

          {seasonDbLoading ? (
            <p className="text-sm text-muted-foreground">Loading DB config…</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Host</label>
                <Input
                  value={seasonDbConfig.host}
                  onChange={(e) =>
                    setSeasonDbConfig((prev) => ({ ...prev, host: e.target.value }))
                  }
                  placeholder="db.example.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Database Name</label>
                <Input
                  value={seasonDbConfig.name}
                  onChange={(e) =>
                    setSeasonDbConfig((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="team1676_maneuver_2026"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">User</label>
                <Input
                  value={seasonDbConfig.user}
                  onChange={(e) =>
                    setSeasonDbConfig((prev) => ({ ...prev, user: e.target.value }))
                  }
                  placeholder="db_user"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  value={seasonDbConfig.pass}
                  onChange={(e) =>
                    setSeasonDbConfig((prev) => ({ ...prev, pass: e.target.value }))
                  }
                  placeholder="Leave blank to keep existing password"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Engine</label>
                <Input
                  value={seasonDbConfig.engine}
                  onChange={(e) =>
                    setSeasonDbConfig((prev) => ({ ...prev, engine: e.target.value || "mysql" }))
                  }
                  placeholder="mysql"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {seasonDbUpdatedAt
                  ? `Last updated ${formatDate(seasonDbUpdatedAt)}`
                  : "No saved season DB config yet."}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSeasonDbDialog({ open: false, year: "" })}
              disabled={seasonDbSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSeasonDbConfig} disabled={seasonDbLoading || seasonDbSaving}>
              {seasonDbSaving ? "Saving…" : "Save Shared Config"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
