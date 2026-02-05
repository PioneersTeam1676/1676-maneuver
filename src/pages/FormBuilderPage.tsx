import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { createForm, deleteForm, getForm, runFormAction, updateForm, type FormAction } from "@/lib/formBuilderApi"
import type {
  FormDefinition,
  FormField,
  FormFieldType,
  FormSection,
  FormType,
  FormWebhookConfig,
  FormWebhookMethod,
} from "@/types/formBuilder"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `id_${Math.random().toString(36).slice(2, 10)}`
}

const isDataUrl = (value?: string | null) => typeof value === "string" && value.startsWith("data:")

const fieldTypeLabels: Record<FormFieldType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  select: "Dropdown",
  multi_select: "Multi-select",
  radio: "Multiple choice",
  checkbox: "Checkbox",
  rating: "Rating",
  slider: "Slider",
  date: "Date",
  time: "Time",
}

const optionFieldTypes = new Set<FormFieldType>(["select", "multi_select", "radio"])
const numericFieldTypes = new Set<FormFieldType>(["number", "rating", "slider"])
const webhookMethods: FormWebhookMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

const normalizeFormType = (value?: string | null): FormType => (value === "pit" ? "pit" : "match")
const normalizeWebhookMethod = (value?: string | null): FormWebhookMethod => {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() : ""
  return webhookMethods.includes(candidate as FormWebhookMethod) ? (candidate as FormWebhookMethod) : "GET"
}
const normalizeWebhook = (value?: Partial<FormWebhookConfig> | null): FormWebhookConfig => ({
  url: typeof value?.url === "string" ? value.url : "",
  method: normalizeWebhookMethod(value?.method),
  authHeader: typeof value?.authHeader === "string" ? value.authHeader : "",
})

const buildEmptyForm = (): FormDefinition => ({
  id: createId(),
  name: "",
  year: new Date().getFullYear().toString(),
  description: "",
  type: "match",
  status: "draft",
  db: {
    host: (import.meta.env.VITE_FORM_DB_HOST as string | undefined) || "",
    name: "",
    user: "",
    pass: "",
    engine: "mysql",
  },
  webhook: normalizeWebhook(),
  schema: {
    sections: [],
  },
})

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  if (toIndex < 0 || toIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

export default function FormBuilderPage() {
  const { formId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState<FormDefinition>(buildEmptyForm())
  const [loading, setLoading] = useState(Boolean(formId))
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<FormAction | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sqlDialog, setSqlDialog] = useState<{
    open: boolean
    title: string
    description: string
    sql: string
  }>({ open: false, title: "", description: "", sql: "" })

  const isNew = !formId

  useEffect(() => {
    if (!formId) return
    setLoading(true)
    getForm(formId)
      .then((data) => {
        if (!data) {
          throw new Error("Form not found")
        }
        setForm({
          ...data,
          type: data.type || "match",
          webhook: normalizeWebhook(data.webhook),
        })
      })
      .catch((error) => {
        console.error("Failed to load form", error)
        toast.error("Could not load this form.")
        navigate("/form-maker", { replace: true })
      })
      .finally(() => setLoading(false))
  }, [formId])

  useEffect(() => {
    if (formId) return
    const yearParam = searchParams.get("year")
    const typeParam = searchParams.get("type")
    if (!yearParam && !typeParam) return
    setForm((prev) => {
      if (prev.name || prev.schema.sections.length > 0) {
        return prev
      }
      return {
        ...prev,
        year: yearParam?.trim() || prev.year,
        type: normalizeFormType(typeParam),
      }
    })
  }, [formId, searchParams])

  const sectionCount = form.schema.sections.length
  const fieldCount = form.schema.sections.reduce((sum, section) => sum + section.fields.length, 0)

  const updateSection = (sectionId: string, updater: (section: FormSection) => FormSection) => {
    setForm((prev) => ({
      ...prev,
      schema: {
        ...prev.schema,
        sections: prev.schema.sections.map((section) =>
          section.id === sectionId ? updater(section) : section
        ),
      },
    }))
  }

  const updateField = (
    sectionId: string,
    fieldId: string,
    updater: (field: FormField) => FormField
  ) => {
    updateSection(sectionId, (section) => ({
      ...section,
      fields: section.fields.map((field) => (field.id === fieldId ? updater(field) : field)),
    }))
  }

  const handleAddSection = () => {
    const nextSection: FormSection = {
      id: createId(),
      title: `Section ${sectionCount + 1}`,
      description: "",
      imageUrl: "",
      fields: [],
    }
    setForm((prev) => ({
      ...prev,
      schema: {
        ...prev.schema,
        sections: [...prev.schema.sections, nextSection],
      },
    }))
  }

  const handleRemoveSection = (sectionId: string) => {
    setForm((prev) => ({
      ...prev,
      schema: {
        ...prev.schema,
        sections: prev.schema.sections.filter((section) => section.id !== sectionId),
      },
    }))
  }

  const handleMoveSection = (index: number, delta: number) => {
    setForm((prev) => ({
      ...prev,
      schema: {
        ...prev.schema,
        sections: moveItem(prev.schema.sections, index, index + delta),
      },
    }))
  }

  const handleAddField = (sectionId: string) => {
    const nextField: FormField = {
      id: createId(),
      type: "short_text",
      label: "New field",
      key: "",
      helpText: "",
      required: false,
      placeholder: "",
      options: [],
      min: 1,
      max: 5,
      step: 1,
    }
    updateSection(sectionId, (section) => ({
      ...section,
      fields: [...section.fields, nextField],
    }))
  }

  const handleRemoveField = (sectionId: string, fieldId: string) => {
    updateSection(sectionId, (section) => ({
      ...section,
      fields: section.fields.filter((field) => field.id !== fieldId),
    }))
  }

  const handleMoveField = (sectionId: string, index: number, delta: number) => {
    updateSection(sectionId, (section) => ({
      ...section,
      fields: moveItem(section.fields, index, index + delta),
    }))
  }

  const handleSectionImageUpload = (sectionId: string, file?: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      if (!result) {
        toast.error("Failed to read image.")
        return
      }
      updateSection(sectionId, (current) => ({ ...current, imageUrl: result }))
    }
    reader.onerror = () => {
      toast.error("Failed to upload image.")
    }
    reader.readAsDataURL(file)
  }

  const handleFieldTypeChange = (sectionId: string, fieldId: string, nextType: FormFieldType) => {
    updateField(sectionId, fieldId, (field) => {
      const needsOptions = optionFieldTypes.has(nextType)
      const needsNumeric = numericFieldTypes.has(nextType)
      return {
        ...field,
        type: nextType,
        options: needsOptions ? (field.options?.length ? field.options : ["Option 1"]) : [],
        min: needsNumeric ? field.min ?? 1 : undefined,
        max: needsNumeric ? field.max ?? 5 : undefined,
        step: needsNumeric ? field.step ?? 1 : undefined,
      }
    })
  }

  const isSaveDisabled = useMemo(() => {
    return !form.name.trim() || !form.year.trim() || saving
  }, [form.name, form.year, saving])

  const handleDbAction = async (action: FormAction) => {
    if (isNew) {
      toast.error("Save this form before running database actions.")
      return
    }
    setActionLoading(action)
    try {
      const response = await runFormAction(form.id, action, form)
      if (response.sql) {
        const titleMap: Record<FormAction, string> = {
          generate_sql: "Generated SQL",
          push: "Push to DB SQL",
          migrate: "Migration SQL",
          update_backend: "Backend Update",
        }
        const descriptionMap: Record<FormAction, string> = {
          generate_sql: "Review or copy this SQL before running it against your database.",
          push: "Run this SQL to create or update the database table for this form.",
          migrate: "Run these statements to safely migrate your table without dropping data.",
          update_backend: "Backend update completed.",
        }
        setSqlDialog({
          open: true,
          title: titleMap[action],
          description: response.message || descriptionMap[action],
          sql: response.sql,
        })
      } else {
        toast.success(response.message || "Action completed.")
      }
    } catch (error) {
      console.error("Database action failed", error)
      toast.error("Database action failed. Check the API logs.")
    } finally {
      setActionLoading(null)
    }
  }

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(sqlDialog.sql)
      toast.success("SQL copied to clipboard.")
    } catch (error) {
      console.error("Failed to copy SQL", error)
      toast.error("Could not copy SQL to clipboard.")
    }
  }

  const handleSave = async () => {
    if (isSaveDisabled) return
    setSaving(true)
    try {
      const normalizedWebhook = normalizeWebhook(form.webhook)
      const payload = {
        ...form,
        name: form.name.trim(),
        year: form.year.trim(),
        description: form.description?.trim() || "",
        webhook: {
          ...normalizedWebhook,
          url: normalizedWebhook.url.trim(),
          authHeader: normalizedWebhook.authHeader?.trim() || "",
        },
      }
      const saved = isNew ? await createForm(payload) : await updateForm(payload)
      setForm(saved)
      toast.success(isNew ? "Form created." : "Form updated.")
      if (isNew) {
        navigate(`/form-maker/${saved.id}`, { replace: true })
      }
    } catch (error) {
      console.error("Failed to save form", error)
      toast.error("Could not save form.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!form.id) return
    try {
      await deleteForm(form.id)
      toast.success("Form deleted.")
      navigate("/form-maker", { replace: true })
    } catch (error) {
      console.error("Failed to delete form", error)
      toast.error("Could not delete form.")
    } finally {
      setDeleteOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Loading form…</CardTitle>
            <CardDescription>Preparing the builder.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{isNew ? "Create Form" : `Edit: ${form.name}`}</h1>
          <p className="text-muted-foreground">
            {sectionCount} sections • {fieldCount} fields
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/form-maker")}>
            Back to list
          </Button>
          {!isNew ? (
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          ) : null}
          <Button onClick={handleSave} disabled={isSaveDisabled}>
            {saving ? "Saving…" : "Save form"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Form details</CardTitle>
          <CardDescription>Name, year, and publishing status.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="form-name">Form name</Label>
            <Input
              id="form-name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="2026 Match Scouting"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="form-year">Year</Label>
            <Input
              id="form-year"
              value={form.year}
              onChange={(event) => setForm((prev) => ({ ...prev, year: event.target.value }))}
              placeholder="2026"
            />
          </div>
          <div className="space-y-2">
            <Label>Form type</Label>
            <Select
              value={form.type}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, type: normalizeFormType(value) }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick form type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="match">Normal scouting</SelectItem>
                <SelectItem value="pit">Pit scouting</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="form-description">Description</Label>
            <Textarea
              id="form-description"
              value={form.description || ""}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="What this form is used for and when."
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, status: value as FormDefinition["status"] }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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

      <Card>
        <CardHeader>
          <CardTitle>Database configuration (MySQL default)</CardTitle>
          <CardDescription>Stored with the form for downstream integrations.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="db-host">DB_HOST</Label>
            <Input
              id="db-host"
              value={form.db.host}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, db: { ...prev.db, host: event.target.value } }))
              }
              placeholder="localhost"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-name">DB_NAME</Label>
            <Input
              id="db-name"
              value={form.db.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, db: { ...prev.db, name: event.target.value } }))
              }
              placeholder="maneuver_scouting"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-user">DB_USER</Label>
            <Input
              id="db-user"
              value={form.db.user}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, db: { ...prev.db, user: event.target.value } }))
              }
              placeholder="scouting_admin"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-pass">DB_PASS</Label>
            <Input
              id="db-pass"
              type="password"
              value={form.db.pass}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, db: { ...prev.db, pass: event.target.value } }))
              }
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-engine">DB Engine</Label>
            <Input id="db-engine" value={form.db.engine} disabled />
          </div>
        </CardContent>
        <CardContent className="border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Save after updating credentials or schema settings.
            </div>
            <Button onClick={handleSave} disabled={isSaveDisabled}>
              {saving ? "Saving…" : "Save form"}
            </Button>
          </div>
        </CardContent>
        <CardContent className="space-y-4 border-t pt-6">
          <div>
            <h3 className="text-lg font-semibold">Database actions</h3>
            <p className="text-sm text-muted-foreground">
              Use these to synchronize the current form schema with your database or backend services.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-4">
              <div className="font-medium">Push schema to DB</div>
              <p className="text-sm text-muted-foreground">
                Creates or updates tables and columns in your database to match this form.
              </p>
              <Button
                variant="secondary"
                onClick={() => handleDbAction("push")}
                disabled={actionLoading === "push"}
              >
                {actionLoading === "push" ? "Pushing…" : "Push to DB"}
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <div className="font-medium">Generate SQL</div>
              <p className="text-sm text-muted-foreground">
                Produces a SQL script you can review and run manually on your database.
              </p>
              <Button
                variant="secondary"
                onClick={() => handleDbAction("generate_sql")}
                disabled={actionLoading === "generate_sql"}
              >
                {actionLoading === "generate_sql" ? "Generating…" : "Generate SQL"}
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <div className="font-medium">Run migrations</div>
              <p className="text-sm text-muted-foreground">
                Applies safe, incremental updates without dropping existing data.
              </p>
              <Button
                variant="secondary"
                onClick={() => handleDbAction("migrate")}
                disabled={actionLoading === "migrate"}
              >
                {actionLoading === "migrate" ? "Migrating…" : "Migrate DB"}
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <div className="font-medium">Update backend</div>
              <p className="text-sm text-muted-foreground">
                Syncs the API and backend services to recognize the latest form schema.
              </p>
              <Button
                variant="secondary"
                onClick={() => handleDbAction("update_backend")}
                disabled={actionLoading === "update_backend"}
              >
                {actionLoading === "update_backend" ? "Updating…" : "Update backend"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook integration</CardTitle>
          <CardDescription>
            Configure the webhook used by Scouting Ops sync actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <Input
              id="webhook-url"
              value={form.webhook?.url || ""}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  webhook: normalizeWebhook({ ...prev.webhook, url: event.target.value }),
                }))
              }
              placeholder="https://example.com/webhook"
            />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select
              value={form.webhook?.method || "GET"}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  webhook: normalizeWebhook({ ...prev.webhook, method: value as FormWebhookMethod }),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a method" />
              </SelectTrigger>
              <SelectContent>
                {webhookMethods.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-auth">Authorization header value</Label>
            <Input
              id="webhook-auth"
              type="password"
              value={form.webhook?.authHeader || ""}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  webhook: normalizeWebhook({ ...prev.webhook, authHeader: event.target.value }),
                }))
              }
              placeholder="Bearer YOUR_TOKEN"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Sent as the `Authorization` header when the webhook runs.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Sections</h2>
          <p className="text-muted-foreground">Organize the form into logical blocks.</p>
        </div>
        <Button onClick={handleAddSection}>Add section</Button>
      </div>

      {form.schema.sections.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No sections yet</CardTitle>
            <CardDescription>Add sections to start building the form.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleAddSection}>Create first section</Button>
          </CardContent>
        </Card>
      ) : (
        form.schema.sections.map((section, sectionIndex) => (
          <Card key={section.id} className="border-muted/60">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Section {sectionIndex + 1}</CardTitle>
                  <CardDescription>Configure layout, copy, and imagery.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMoveSection(sectionIndex, -1)}
                    disabled={sectionIndex === 0}
                  >
                    Move up
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMoveSection(sectionIndex, 1)}
                    disabled={sectionIndex === form.schema.sections.length - 1}
                  >
                    Move down
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleRemoveSection(section.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Section title</Label>
                  <Input
                    value={section.title}
                    onChange={(event) =>
                      updateSection(section.id, (current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder="Auto phase"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Section image</Label>
                    {section.imageUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateSection(section.id, (current) => ({ ...current, imageUrl: "" }))}
                      >
                        Clear image
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <Input
                      value={isDataUrl(section.imageUrl) ? "" : section.imageUrl || ""}
                      onChange={(event) =>
                        updateSection(section.id, (current) => ({ ...current, imageUrl: event.target.value }))
                      }
                      placeholder="https://example.com/auto.png"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const input = document.getElementById(`section-image-${section.id}`) as HTMLInputElement | null
                        input?.click()
                      }}
                    >
                      Upload image
                    </Button>
                  </div>
                  {isDataUrl(section.imageUrl) ? (
                    <p className="text-xs text-muted-foreground">
                      Uploaded image stored in this form.
                    </p>
                  ) : null}
                  <input
                    id={`section-image-${section.id}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      handleSectionImageUpload(section.id, file)
                      event.target.value = ""
                    }}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    value={section.description || ""}
                    onChange={(event) =>
                      updateSection(section.id, (current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Instructions for scouts."
                  />
                </div>
              </div>

              {section.imageUrl ? (
                <div className="overflow-hidden rounded-lg border bg-muted">
                  <img
                    src={section.imageUrl}
                    alt={section.title}
                    className="h-48 w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : null}

              <Separator />

              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Fields</h3>
                <Button variant="secondary" size="sm" onClick={() => handleAddField(section.id)}>
                  Add field
                </Button>
              </div>

              {section.fields.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No fields yet. Add your first question to this section.
                </div>
              ) : (
                <div className="space-y-4">
                  {section.fields.map((field, fieldIndex) => {
                    const showsOptions = optionFieldTypes.has(field.type)
                    const showsNumeric = numericFieldTypes.has(field.type)
                    const isTextType = field.type === "short_text" || field.type === "long_text"
                    return (
                      <Card key={field.id} className="border-muted/60">
                        <CardHeader className="space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base">
                                Field {fieldIndex + 1}
                              </CardTitle>
                              <CardDescription>{fieldTypeLabels[field.type]}</CardDescription>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMoveField(section.id, fieldIndex, -1)}
                                disabled={fieldIndex === 0}
                              >
                                Move up
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMoveField(section.id, fieldIndex, 1)}
                                disabled={fieldIndex === section.fields.length - 1}
                              >
                                Move down
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemoveField(section.id, field.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Label</Label>
                              <Input
                                value={field.label}
                                onChange={(event) =>
                                  updateField(section.id, field.id, (current) => ({
                                    ...current,
                                    label: event.target.value,
                                  }))
                                }
                                placeholder="Question prompt"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Field type</Label>
                              <Select
                                value={field.type}
                                onValueChange={(value) =>
                                  handleFieldTypeChange(section.id, field.id, value as FormFieldType)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Pick a type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(fieldTypeLabels).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label>Field name (data key)</Label>
                              <Input
                                value={field.key || ""}
                                onChange={(event) =>
                                  updateField(section.id, field.id, (current) => ({
                                    ...current,
                                    key: event.target.value,
                                  }))
                                }
                                placeholder="auto_start_position"
                              />
                              <p className="text-xs text-muted-foreground">
                                Used for exports and database columns. Leave blank to auto-generate.
                              </p>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label>Help text</Label>
                              <Input
                                value={field.helpText || ""}
                                onChange={(event) =>
                                  updateField(section.id, field.id, (current) => ({
                                    ...current,
                                    helpText: event.target.value,
                                  }))
                                }
                                placeholder="Optional guidance"
                              />
                            </div>
                            {isTextType ? (
                              <div className="space-y-2 md:col-span-2">
                                <Label>Placeholder</Label>
                                <Input
                                  value={field.placeholder || ""}
                                  onChange={(event) =>
                                    updateField(section.id, field.id, (current) => ({
                                      ...current,
                                      placeholder: event.target.value,
                                    }))
                                  }
                                  placeholder="Type here…"
                                />
                              </div>
                            ) : null}
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={Boolean(field.required)}
                                onCheckedChange={(value) =>
                                  updateField(section.id, field.id, (current) => ({
                                    ...current,
                                    required: Boolean(value),
                                  }))
                                }
                              />
                              <Label>Required</Label>
                            </div>
                          </div>

                          {showsNumeric ? (
                            <div className="grid gap-4 md:grid-cols-3">
                              <div className="space-y-2">
                                <Label>Min</Label>
                                <Input
                                  type="number"
                                  value={field.min ?? ""}
                                  onChange={(event) =>
                                    updateField(section.id, field.id, (current) => ({
                                      ...current,
                                      min: event.target.value === "" ? undefined : Number(event.target.value),
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Max</Label>
                                <Input
                                  type="number"
                                  value={field.max ?? ""}
                                  onChange={(event) =>
                                    updateField(section.id, field.id, (current) => ({
                                      ...current,
                                      max: event.target.value === "" ? undefined : Number(event.target.value),
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Step</Label>
                                <Input
                                  type="number"
                                  value={field.step ?? ""}
                                  onChange={(event) =>
                                    updateField(section.id, field.id, (current) => ({
                                      ...current,
                                      step: event.target.value === "" ? undefined : Number(event.target.value),
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          ) : null}

                          {showsOptions ? (
                            <div className="space-y-3">
                              <Label>Options</Label>
                              <div className="space-y-2">
                                {(field.options || []).map((option, optionIndex) => (
                                  <div key={`${field.id}-option-${optionIndex}`} className="flex gap-2">
                                    <Input
                                      value={option}
                                      onChange={(event) => {
                                        const value = event.target.value
                                        updateField(section.id, field.id, (current) => {
                                          const next = [...(current.options || [])]
                                          next[optionIndex] = value
                                          return { ...current, options: next }
                                        })
                                      }}
                                      placeholder={`Option ${optionIndex + 1}`}
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        updateField(section.id, field.id, (current) => {
                                          const next = (current.options || []).filter((_, idx) => idx !== optionIndex)
                                          return { ...current, options: next }
                                        })
                                      }
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                ))}
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  updateField(section.id, field.id, (current) => ({
                                    ...current,
                                    options: [...(current.options || []), `Option ${(current.options || []).length + 1}`],
                                  }))
                                }
                              >
                                Add option
                              </Button>
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog
        open={sqlDialog.open}
        onOpenChange={(open) => setSqlDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{sqlDialog.title}</DialogTitle>
            <DialogDescription>{sqlDialog.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea value={sqlDialog.sql} readOnly className="min-h-[240px] font-mono text-xs" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleCopySql}>
                Copy SQL
              </Button>
              <Button onClick={() => setSqlDialog((prev) => ({ ...prev, open: false }))}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
