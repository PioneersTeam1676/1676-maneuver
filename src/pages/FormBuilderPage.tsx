import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { motion } from "motion/react"
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Type,
  Hash,
  List,
  CheckSquare,
  Calendar,
  Clock,
  GripVertical,
  Plus,
  Trash2,
  Save,
  ArrowUp,
  ArrowDown,
  Copy
} from "lucide-react"

import { createForm, deleteForm, getForm, runFormAction, updateForm, type FormAction } from "@/lib/formBuilderApi"
import type {
  FormDefinition,
  FormField,
  FormFieldType,
  FormFloatingImage,
  FormPage,
  FormSection,
  FormType,
  FormUiConfig,
  FormWebhookConfig,
  FormWebhookMethod,
} from "@/types/formBuilder"
import {
  BUTTON_VARIANTS,
  DEFAULT_UI_CONFIG,
  UI_PRESET_OPTIONS,
  coercePages,
  getUiPreset,
  normalizeUiConfig,
  type UiPresetKey,
} from "@/lib/formSchema"
import { DRIVE_FORM_TEMPLATES } from "@/lib/formTemplates"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { cn } from "@/lib/utils"

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `id_${Math.random().toString(36).slice(2, 10)}`
}

const layoutTransition = { bounce: 0.2, duration: 0.4 }

const isDataUrl = (value?: string | null) => typeof value === "string" && value.startsWith("data:")
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const toFiniteNumber = (value: unknown, fallback: number) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}
const createFloatingImage = (): FormFloatingImage => ({
  id: createId(),
  src: "",
  alt: "",
  x: 50,
  y: 50,
  width: 200,
  opacity: 100,
  rotation: 0,
  zIndex: 0,
  showOnMobile: true,
})
const normalizeFloatingImage = (image: FormFloatingImage): FormFloatingImage => ({
  ...image,
  alt: image.alt || "",
  x: clamp(toFiniteNumber(image.x, 50), 0, 100),
  y: clamp(toFiniteNumber(image.y, 50), 0, 100),
  width: clamp(toFiniteNumber(image.width, 200), 40, 1200),
  opacity: clamp(toFiniteNumber(image.opacity, 100), 0, 100),
  rotation: clamp(toFiniteNumber(image.rotation, 0), -180, 180),
  zIndex: clamp(toFiniteNumber(image.zIndex, 0), -10, 50),
  showOnMobile: image.showOnMobile !== false,
})

const fieldTypeConfig: Record<FormFieldType, { label: string; icon: React.ElementType; group: string }> = {
  short_text: { label: "Short text", icon: Type, group: "Text" },
  long_text: { label: "Long text", icon: Type, group: "Text" },
  number: { label: "Number", icon: Hash, group: "Numeric" },
  rating: { label: "Rating", icon: Hash, group: "Numeric" },
  slider: { label: "Slider", icon: Hash, group: "Numeric" },
  select: { label: "Dropdown", icon: List, group: "Selection" },
  multi_select: { label: "Multi-select", icon: List, group: "Selection" },
  radio: { label: "Multiple choice", icon: CheckSquare, group: "Selection" },
  checkbox: { label: "Checkbox", icon: CheckSquare, group: "Selection" },
  date: { label: "Date", icon: Calendar, group: "Date/Time" },
  time: { label: "Time", icon: Clock, group: "Date/Time" },
  image: { label: "Image / Camera", icon: ImageIcon, group: "Media" },
}

const optionFieldTypes = new Set<FormFieldType>(["select", "multi_select", "radio"])
const numericFieldTypes = new Set<FormFieldType>(["number", "rating", "slider"])
const webhookMethods: FormWebhookMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

const normalizeFormType = (value?: string | null): FormType =>
  value === "pit" ? "pit" : value === "drive" ? "drive" : "match"
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
    pages: [
      {
        id: createId(),
        title: "Page 1",
        description: "",
        floatingImages: [],
        sections: [],
      },
    ],
    ui: DEFAULT_UI_CONFIG,
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [dbOpen, setDbOpen] = useState(false)
  const [presetKey, setPresetKey] = useState<UiPresetKey>("default")
  const [templateId, setTemplateId] = useState(DRIVE_FORM_TEMPLATES[0]?.id ?? "")
  const [templateConfirm, setTemplateConfirm] = useState<{ open: boolean; templateId: string }>({
    open: false,
    templateId: "",
  })
  const [sqlDialog, setSqlDialog] = useState<{
    open: boolean
    title: string
    description: string
    sql: string
  }>({ open: false, title: "", description: "", sql: "" })
  const [floatingDrag, setFloatingDrag] = useState<{
    pageId: string
    imageId: string
    rect: DOMRect
  } | null>(null)

  const isNew = !formId

  useEffect(() => {
    if (!formId) return
    setLoading(true)
    getForm(formId)
      .then((data) => {
        if (!data) {
          throw new Error("Form not found")
        }
        const pages = coercePages(data.schema)
        setForm({
          ...data,
          type: data.type || "match",
          webhook: normalizeWebhook(data.webhook),
          schema: {
            ...data.schema,
            pages,
            ui: normalizeUiConfig(data.schema?.ui),
          },
        })
        // Open first section by default
        if (pages[0]?.sections?.length) {
          setOpenSections({ [pages[0].sections[0].id]: true })
        }
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
      const existingPages = coercePages(prev.schema)
      if (prev.name || existingPages.some((page) => page.sections.length > 0)) {
        return prev
      }
      return {
        ...prev,
        year: yearParam?.trim() || prev.year,
        type: normalizeFormType(typeParam),
      }
    })
  }, [formId, searchParams])

  useEffect(() => {
    if (form.type !== "drive") return
    if (!templateId && DRIVE_FORM_TEMPLATES.length > 0) {
      setTemplateId(DRIVE_FORM_TEMPLATES[0].id)
    }
  }, [form.type, templateId])

  useEffect(() => {
    if (!floatingDrag) return

    const handleMove = (event: PointerEvent) => {
      setForm((prev) => {
        const nextPages = coercePages(prev.schema).map((page) => {
          if (page.id !== floatingDrag.pageId) return page
          return {
            ...page,
            floatingImages: (page.floatingImages || []).map((image) =>
              image.id === floatingDrag.imageId
                ? normalizeFloatingImage({
                    ...image,
                    x: ((event.clientX - floatingDrag.rect.left) / Math.max(floatingDrag.rect.width, 1)) * 100,
                    y: ((event.clientY - floatingDrag.rect.top) / Math.max(floatingDrag.rect.height, 1)) * 100,
                  })
                : image
            ),
          }
        })
        return {
          ...prev,
          schema: {
            ...prev.schema,
            pages: nextPages,
            sections: undefined,
          },
        }
      })
    }

    const handleUp = () => setFloatingDrag(null)

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
    }
  }, [floatingDrag])

  const pages = useMemo(() => coercePages(form.schema), [form.schema])
  const pageCount = pages.length
  const sectionCount = useMemo(
    () => pages.reduce((sum, page) => sum + page.sections.length, 0),
    [pages]
  )
  const fieldCount = useMemo(
    () =>
      pages.reduce(
        (sum, page) => sum + page.sections.reduce((inner, section) => inner + section.fields.length, 0),
        0
      ),
    [pages]
  )
  const uiConfig = useMemo(() => normalizeUiConfig(form.schema.ui), [form.schema.ui])
  const selectedTemplate = useMemo(
    () => DRIVE_FORM_TEMPLATES.find((template) => template.id === templateId),
    [templateId]
  )
  const selectedPreset = useMemo(
    () => UI_PRESET_OPTIONS.find((option) => option.key === presetKey),
    [presetKey]
  )

  const setPages = (updater: (pages: FormPage[]) => FormPage[]) => {
    setForm((prev) => {
      const nextPages = updater(coercePages(prev.schema))
      return {
        ...prev,
        schema: {
          ...prev.schema,
          pages: nextPages,
          sections: undefined,
        },
      }
    })
  }

  const updatePage = (pageId: string, updater: (page: FormPage) => FormPage) => {
    setPages((current) => current.map((page) => (page.id === pageId ? updater(page) : page)))
  }

  const handleAddPage = () => {
    const id = createId()
    setPages((current) => [
      ...current,
      {
        id,
        title: `Page ${current.length + 1}`,
        description: "",
        floatingImages: [],
        sections: [],
      },
    ])
  }

  const handleRemovePage = (pageId: string) => {
    setPages((current) => current.filter((page) => page.id !== pageId))
  }

  const handleMovePage = (index: number, delta: number) => {
    setPages((current) => moveItem(current, index, index + delta))
  }

  const updateSection = (
    pageId: string,
    sectionId: string,
    updater: (section: FormSection) => FormSection
  ) => {
    updatePage(pageId, (page) => ({
      ...page,
      sections: page.sections.map((section) =>
        section.id === sectionId ? updater(section) : section
      ),
    }))
  }

  const updateField = (
    pageId: string,
    sectionId: string,
    fieldId: string,
    updater: (field: FormField) => FormField
  ) => {
    updateSection(pageId, sectionId, (section) => ({
      ...section,
      fields: section.fields.map((field) => (field.id === fieldId ? updater(field) : field)),
    }))
  }

  const updateFloatingImage = (
    pageId: string,
    imageId: string,
    updater: (image: FormFloatingImage) => FormFloatingImage
  ) => {
    updatePage(pageId, (page) => ({
      ...page,
      floatingImages: (page.floatingImages || []).map((image) =>
        image.id === imageId ? normalizeFloatingImage(updater(image)) : image
      ),
    }))
  }

  const handleAddFloatingImage = (pageId: string) => {
    updatePage(pageId, (page) => ({
      ...page,
      floatingImages: [...(page.floatingImages || []), createFloatingImage()],
    }))
  }

  const handleRemoveFloatingImage = (pageId: string, imageId: string) => {
    updatePage(pageId, (page) => ({
      ...page,
      floatingImages: (page.floatingImages || []).filter((image) => image.id !== imageId),
    }))
  }

  const handleFloatingImageUpload = (pageId: string, imageId: string, file?: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      if (!result) {
        toast.error("Failed to read image.")
        return
      }
      updateFloatingImage(pageId, imageId, (image) => ({ ...image, src: result }))
    }
    reader.onerror = () => {
      toast.error("Failed to upload image.")
    }
    reader.readAsDataURL(file)
  }

  const handleStartFloatingImageDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    pageId: string,
    imageId: string
  ) => {
    const canvas = event.currentTarget.closest("[data-floating-canvas='true']") as HTMLElement | null
    if (!canvas) return
    setFloatingDrag({
      pageId,
      imageId,
      rect: canvas.getBoundingClientRect(),
    })
  }

  const handleAddSection = (pageId: string) => {
    const id = createId()
    const nextSection: FormSection = {
      id,
      title: "New section",
      description: "",
      imageUrl: "",
      fields: [],
    }
    updatePage(pageId, (page) => ({
      ...page,
      sections: [...page.sections, nextSection],
    }))
    setOpenSections((prev) => ({ ...prev, [id]: true }))
  }

  const handleRemoveSection = (pageId: string, sectionId: string) => {
    updatePage(pageId, (page) => ({
      ...page,
      sections: page.sections.filter((section) => section.id !== sectionId),
    }))
  }

  const handleMoveSection = (pageId: string, index: number, delta: number) => {
    updatePage(pageId, (page) => ({
      ...page,
      sections: moveItem(page.sections, index, index + delta),
    }))
  }

  const handleAddField = (
    pageId: string,
    sectionId: string,
    type: FormFieldType = "short_text"
  ) => {
    const nextField: FormField = {
      id: createId(),
      type,
      label: type === "image" ? "Robot Photo" : "New question",
      key: "",
      helpText: "",
      exclusiveGroup: "",
      required: false,
      placeholder: "",
      options: type === "select" || type === "radio" || type === "multi_select" ? ["Option 1"] : [],
      min: 1,
      max: 5,
      step: 1,
    }
    updateSection(pageId, sectionId, (section) => ({
      ...section,
      fields: [...section.fields, nextField],
    }))
  }

  const handleRemoveField = (pageId: string, sectionId: string, fieldId: string) => {
    updateSection(pageId, sectionId, (section) => ({
      ...section,
      fields: section.fields.filter((field) => field.id !== fieldId),
    }))
  }

  const handleMoveField = (pageId: string, sectionId: string, index: number, delta: number) => {
    updateSection(pageId, sectionId, (section) => ({
      ...section,
      fields: moveItem(section.fields, index, index + delta),
    }))
  }

  const handleSectionImageUpload = (pageId: string, sectionId: string, file?: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      if (!result) {
        toast.error("Failed to read image.")
        return
      }
      updateSection(pageId, sectionId, (current) => ({ ...current, imageUrl: result }))
    }
    reader.onerror = () => {
      toast.error("Failed to upload image.")
    }
    reader.readAsDataURL(file)
  }

  const handleFieldTypeChange = (
    pageId: string,
    sectionId: string,
    fieldId: string,
    nextType: FormFieldType
  ) => {
    updateField(pageId, sectionId, fieldId, (field) => {
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

  const updateUiConfig = (updater: (config: FormUiConfig) => FormUiConfig) => {
    setForm((prev) => ({
      ...prev,
      schema: {
        ...prev.schema,
        ui: updater(normalizeUiConfig(prev.schema.ui)),
      },
    }))
  }

  const applyTemplate = (nextTemplateId: string) => {
    const template = DRIVE_FORM_TEMPLATES.find((entry) => entry.id === nextTemplateId)
    if (!template) {
      toast.error("Template not found.")
      return
    }
    const built = template.build(createId)
    const nextPages = built.pages
    const firstSectionId = nextPages[0]?.sections?.[0]?.id
    setForm((prev) => ({
      ...prev,
      type: template.type,
      name: prev.name.trim() ? prev.name : built.name || prev.name,
      description: prev.description?.trim() ? prev.description : built.description || prev.description || "",
      schema: {
        ...prev.schema,
        pages: nextPages,
        sections: undefined,
        ui: normalizeUiConfig(prev.schema.ui),
      },
    }))
    setOpenSections(firstSectionId ? { [firstSectionId]: true } : {})
    toast.success(`Applied "${template.label}".`)
  }

  const handleApplyTemplate = () => {
    if (!templateId) return
    const hasContent = pages.some((page) => page.sections.length > 0)
    if (hasContent) {
      setTemplateConfirm({ open: true, templateId })
      return
    }
    applyTemplate(templateId)
  }

  const handleConfirmTemplate = () => {
    const nextId = templateConfirm.templateId
    if (nextId) {
      applyTemplate(nextId)
    }
    setTemplateConfirm({ open: false, templateId: "" })
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
        setSqlDialog({
          open: true,
          title: titleMap[action],
          description: response.message || "Review the generated SQL.",
          sql: response.sql,
        })
      } else {
        toast.success(response.message || "Action completed.")
      }
    } catch (error) {
      console.error("Database action failed", error)
      toast.error("Database action failed. Check logs.")
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
      toast.error("Could not copy SQL.")
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
      const savedPages = coercePages(saved.schema)
      setForm({
        ...saved,
        schema: {
          ...saved.schema,
          pages: savedPages,
          ui: normalizeUiConfig(saved.schema?.ui),
        },
      })
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

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl pb-10 pt-0">
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
    <div className="container mx-auto max-w-6xl space-y-3 pb-24 pt-0 animate-in fade-in-0 duration-300">
      {/* Header */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur animate-in fade-in-0 slide-in-from-bottom-1 duration-300 sm:rounded-b-lg sm:border sm:border-t-0">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-tight">{isNew ? "Create Form" : form.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {pageCount} pages • {sectionCount} sections • {fieldCount} fields •{" "}
            {form.type === "pit"
              ? "Pit Scouting"
              : form.type === "drive"
                ? "Drive Team Scouting"
                : "Match Scouting"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8 min-w-20" onClick={() => navigate("/form-maker")}>
            Exit
          </Button>
          {!isNew && (
            <Button variant="outline" size="sm" className="h-8 min-w-20" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
          <Button size="sm" className="h-8 min-w-20" onClick={handleSave} disabled={isSaveDisabled}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save Form"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Pages</h2>
              <p className="text-sm text-muted-foreground">
                Organize sections across multiple pages and control navigation.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleAddPage}>
              <Plus className="mr-2 h-4 w-4" /> Add Page
            </Button>
          </div>

          <div className="space-y-8">
            {pages.map((page, pageIndex) => (
              <motion.div
                key={page.id}
                layout="position"
                transition={layoutTransition}
                className="space-y-4"
              >
                <div className="rounded-lg border bg-muted/30 p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">Page {pageIndex + 1}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {page.sections.length} sections
                        </span>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Page title</Label>
                        <Input
                          value={page.title}
                          onChange={(e) =>
                            updatePage(page.id, (current) => ({ ...current, title: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Page description</Label>
                        <Textarea
                          value={page.description || ""}
                          onChange={(e) =>
                            updatePage(page.id, (current) => ({
                              ...current,
                              description: e.target.value,
                            }))
                          }
                          placeholder="Optional helper copy for this page."
                          rows={2}
                        />
                      </div>

                      <div className="space-y-3 rounded-md border border-dashed bg-background/80 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label className="text-xs text-muted-foreground">Floating Screen Images</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => handleAddFloatingImage(page.id)}
                          >
                            <Plus className="mr-1 h-3 w-3" /> Add Image
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Drag images in the preview to position them. Scouts will see these in the live form.
                        </p>

                        <div
                          data-floating-canvas="true"
                          className="relative h-44 overflow-hidden rounded-md border bg-muted/40"
                        >
                          {(page.floatingImages || []).length === 0 ? (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              No floating images yet.
                            </div>
                          ) : (
                            (page.floatingImages || []).map((image, imageIndex) =>
                              image.src ? (
                                <button
                                  key={image.id}
                                  type="button"
                                  className={cn(
                                    "absolute cursor-grab select-none touch-none rounded-md border border-primary/30 shadow-sm transition hover:border-primary/80",
                                    floatingDrag?.imageId === image.id && "ring-2 ring-primary"
                                  )}
                                  style={{
                                    left: `${image.x}%`,
                                    top: `${image.y}%`,
                                    width: `${image.width}px`,
                                    transform: `translate(-50%, -50%) rotate(${image.rotation ?? 0}deg)`,
                                    opacity: (image.opacity ?? 100) / 100,
                                    zIndex: image.zIndex ?? 0,
                                  }}
                                  onPointerDown={(event) =>
                                    handleStartFloatingImageDrag(event, page.id, image.id)
                                  }
                                >
                                  <img
                                    src={image.src}
                                    alt={image.alt || `Floating image ${imageIndex + 1}`}
                                    draggable={false}
                                    className="pointer-events-none max-h-24 w-full rounded-md object-contain select-none"
                                  />
                                </button>
                              ) : null
                            )
                          )}
                        </div>

                        {(page.floatingImages || []).map((image, imageIndex) => (
                          <div key={image.id} className="space-y-3 rounded-md border bg-card p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium">Image {imageIndex + 1}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => handleRemoveFloatingImage(page.id, image.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                              <Input
                                value={isDataUrl(image.src) ? "(Image Data)" : image.src}
                                onChange={(event) =>
                                  updateFloatingImage(page.id, image.id, (current) => ({
                                    ...current,
                                    src: event.target.value,
                                  }))
                                }
                                placeholder="Image URL or upload file"
                              />
                              <Button variant="outline" size="icon" className="relative">
                                <input
                                  type="file"
                                  className="absolute inset-0 cursor-pointer opacity-0"
                                  accept="image/*"
                                  onChange={(event) =>
                                    handleFloatingImageUpload(page.id, image.id, event.target.files?.[0])
                                  }
                                />
                                <ImageIcon className="h-4 w-4" />
                              </Button>
                            </div>

                            <Input
                              value={image.alt || ""}
                              onChange={(event) =>
                                updateFloatingImage(page.id, image.id, (current) => ({
                                  ...current,
                                  alt: event.target.value,
                                }))
                              }
                              placeholder="Alt text (optional)"
                            />

                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">X (%)</Label>
                                <Input
                                  type="number"
                                  value={image.x}
                                  onChange={(event) =>
                                    updateFloatingImage(page.id, image.id, (current) => ({
                                      ...current,
                                      x: Number(event.target.value),
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Y (%)</Label>
                                <Input
                                  type="number"
                                  value={image.y}
                                  onChange={(event) =>
                                    updateFloatingImage(page.id, image.id, (current) => ({
                                      ...current,
                                      y: Number(event.target.value),
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Width (px)</Label>
                                <Input
                                  type="number"
                                  value={image.width}
                                  onChange={(event) =>
                                    updateFloatingImage(page.id, image.id, (current) => ({
                                      ...current,
                                      width: Number(event.target.value),
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Opacity (%)</Label>
                                <Input
                                  type="number"
                                  value={image.opacity ?? 100}
                                  onChange={(event) =>
                                    updateFloatingImage(page.id, image.id, (current) => ({
                                      ...current,
                                      opacity: Number(event.target.value),
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Rotation (deg)</Label>
                                <Input
                                  type="number"
                                  value={image.rotation ?? 0}
                                  onChange={(event) =>
                                    updateFloatingImage(page.id, image.id, (current) => ({
                                      ...current,
                                      rotation: Number(event.target.value),
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Layer</Label>
                                <Input
                                  type="number"
                                  value={image.zIndex ?? 0}
                                  onChange={(event) =>
                                    updateFloatingImage(page.id, image.id, (current) => ({
                                      ...current,
                                      zIndex: Number(event.target.value),
                                    }))
                                  }
                                />
                              </div>
                            </div>

                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Checkbox
                                checked={image.showOnMobile !== false}
                                onCheckedChange={(value) =>
                                  updateFloatingImage(page.id, image.id, (current) => ({
                                    ...current,
                                    showOnMobile: Boolean(value),
                                  }))
                                }
                              />
                              Show on mobile
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMovePage(pageIndex, -1)}
                        disabled={pageIndex === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMovePage(pageIndex, 1)}
                        disabled={pageIndex === pageCount - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleRemovePage(page.id)}
                        disabled={pageCount <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {page.sections.map((section, sectionIndex) => (
                    <motion.div
                      key={section.id}
                      layout="position"
                      transition={layoutTransition}
                    >
                      <Collapsible
                        open={openSections[section.id]}
                        onOpenChange={() => toggleSection(section.id)}
                        className="rounded-lg border bg-card text-card-foreground shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
                      >
                      <div className="flex items-center gap-2 border-b p-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                          {sectionIndex + 1}
                        </div>
                        <div className="flex-1">
                          <Input
                            value={section.title}
                            onChange={(e) =>
                              updateSection(page.id, section.id, (s) => ({
                                ...s,
                                title: e.target.value,
                              }))
                            }
                            className="border-none bg-transparent px-2 text-lg font-semibold hover:bg-muted/50 focus-visible:ring-0"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMoveSection(page.id, sectionIndex, -1)}
                            disabled={sectionIndex === 0}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMoveSection(page.id, sectionIndex, 1)}
                            disabled={sectionIndex === page.sections.length - 1}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => handleRemoveSection(page.id, section.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon">
                              {openSections[section.id] ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>

                      <CollapsibleContent>
                        <div className="space-y-6 p-4 pt-6">
                          {/* Section Metadata */}
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Description</Label>
                              <Textarea
                                value={section.description || ""}
                                onChange={(e) =>
                                  updateSection(page.id, section.id, (s) => ({
                                    ...s,
                                    description: e.target.value,
                                  }))
                                }
                                placeholder="Instructions for the scout..."
                                rows={2}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Reference Image</Label>
                              <div className="flex gap-2">
                                <Input
                                  value={isDataUrl(section.imageUrl) ? "(Image Data)" : section.imageUrl || ""}
                                  onChange={(e) =>
                                    updateSection(page.id, section.id, (s) => ({
                                      ...s,
                                      imageUrl: e.target.value,
                                    }))
                                  }
                                  placeholder="URL..."
                                  className="flex-1"
                                />
                                <Button variant="outline" size="icon" className="relative">
                                  <input
                                    type="file"
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                    accept="image/*"
                                    onChange={(e) =>
                                      handleSectionImageUpload(page.id, section.id, e.target.files?.[0])
                                    }
                                  />
                                  <ImageIcon className="h-4 w-4" />
                                </Button>
                              </div>
                              {section.imageUrl && (
                                <div className="relative mt-2 h-20 w-full overflow-hidden rounded bg-muted">
                                  <img src={section.imageUrl} alt="Ref" className="h-full w-full object-contain" />
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    className="absolute right-1 top-1 h-6 w-6"
                                    onClick={() =>
                                      updateSection(page.id, section.id, (s) => ({ ...s, imageUrl: "" }))
                                    }
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>

                          <Separator />

                          {/* Fields List */}
                          <div className="space-y-4">
                            {section.fields.map((field, fieldIndex) => {
                              const Icon = fieldTypeConfig[field.type]?.icon || Type
                              const showsOptions = optionFieldTypes.has(field.type)
                              const showsNumeric = numericFieldTypes.has(field.type)

                              return (
                                <motion.div
                                  key={field.id}
                                  layout="position"
                                  transition={layoutTransition}
                                  className="group relative rounded-lg border bg-card p-4 transition-all hover:shadow-md"
                                >
                                  <div className="absolute -left-3 top-4 hidden cursor-grab rounded-md border bg-background p-1 text-muted-foreground shadow-sm group-hover:block">
                                    <GripVertical className="h-4 w-4" />
                                  </div>

                                  <div className="mb-4 flex items-start gap-4">
                                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 space-y-4">
                                      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                                        <div className="space-y-2">
                                          <Label className="text-xs text-muted-foreground">Question Label</Label>
                                          <Input
                                            value={field.label}
                                            onChange={(e) =>
                                              updateField(page.id, section.id, field.id, (f) => ({
                                                ...f,
                                                label: e.target.value,
                                              }))
                                            }
                                            className="font-medium"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-xs text-muted-foreground">Type</Label>
                                          <Select
                                            value={field.type}
                                            onValueChange={(v) =>
                                              handleFieldTypeChange(page.id, section.id, field.id, v as FormFieldType)
                                            }
                                          >
                                            <SelectTrigger className="w-[140px]">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {Object.entries(fieldTypeConfig).map(([key, conf]) => (
                                                <SelectItem key={key} value={key}>
                                                  {conf.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>

                                      {/* Options for Select/Radio */}
                                      {showsOptions && (
                                        <div className="rounded-md border border-dashed p-3">
                                          <Label className="mb-2 block text-xs font-medium">Options</Label>
                                          <div className="space-y-2">
                                            {field.options?.map((opt, idx) => (
                                              <div key={idx} className="flex gap-2">
                                                <Input
                                                  value={opt}
                                                  onChange={(e) =>
                                                    updateField(page.id, section.id, field.id, (f) => {
                                                      const next = [...(f.options || [])]
                                                      next[idx] = e.target.value
                                                      return { ...f, options: next }
                                                    })
                                                  }
                                                  className="h-8 text-sm"
                                                />
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-8 w-8"
                                                  onClick={() =>
                                                    updateField(page.id, section.id, field.id, (f) => ({
                                                      ...f,
                                                      options: (f.options || []).filter((_, i) => i !== idx),
                                                    }))
                                                  }
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            ))}
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-8 w-full border-dashed"
                                              onClick={() =>
                                                updateField(page.id, section.id, field.id, (f) => ({
                                                  ...f,
                                                  options: [...(f.options || []), 'Option ' + ((f.options || []).length + 1)],
                                                }))
                                              }
                                            >
                                              <Plus className="mr-2 h-3 w-3" /> Add Option
                                            </Button>
                                          </div>
                                        </div>
                                      )}


                                      {/* Numeric Config */}
                                      {showsNumeric && (
                                        <div className="flex gap-4 rounded-md border border-dashed p-3">
                                          <div className="flex-1">
                                            <Label className="text-xs">Min</Label>
                                            <Input
                                              type="number"
                                              className="h-8"
                                              value={field.min ?? ""}
                                              onChange={(e) =>
                                                updateField(page.id, section.id, field.id, (f) => ({
                                                  ...f,
                                                  min: Number(e.target.value),
                                                }))
                                              }
                                            />
                                          </div>
                                          <div className="flex-1">
                                            <Label className="text-xs">Max</Label>
                                            <Input
                                              type="number"
                                              className="h-8"
                                              value={field.max ?? ""}
                                              onChange={(e) =>
                                                updateField(page.id, section.id, field.id, (f) => ({
                                                  ...f,
                                                  max: Number(e.target.value),
                                                }))
                                              }
                                            />
                                          </div>
                                          <div className="flex-1">
                                            <Label className="text-xs">Step</Label>
                                            <Input
                                              type="number"
                                              className="h-8"
                                              value={field.step ?? ""}
                                              onChange={(e) =>
                                                updateField(page.id, section.id, field.id, (f) => ({
                                                  ...f,
                                                  step: Number(e.target.value),
                                                }))
                                              }
                                            />
                                          </div>
                                        </div>
                                      )}

                                      <div className="grid gap-3 rounded-md border border-dashed p-3 md:grid-cols-2">
                                        <div className="space-y-2">
                                          <Label className="text-xs">Scout Description</Label>
                                          <Textarea
                                            value={field.helpText || ""}
                                            onChange={(e) =>
                                              updateField(page.id, section.id, field.id, (f) => ({
                                                ...f,
                                                helpText: e.target.value,
                                              }))
                                            }
                                            placeholder="Shows as a ? tooltip for scouts."
                                            rows={2}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-xs">Mutual Exclusion Group</Label>
                                          <Input
                                            value={field.exclusiveGroup || ""}
                                            onChange={(e) =>
                                              updateField(page.id, section.id, field.id, (f) => ({
                                                ...f,
                                                exclusiveGroup: e.target.value,
                                              }))
                                            }
                                            placeholder="e.g. endgame_result"
                                          />
                                          <p className="text-[11px] text-muted-foreground">
                                            Fields with the same group allow only one answered value.
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-4 text-xs">
                                        <label className="flex items-center gap-1.5 text-muted-foreground">
                                          <Checkbox
                                            checked={field.required}
                                            onCheckedChange={(c) =>
                                              updateField(page.id, section.id, field.id, (f) => ({
                                                ...f,
                                                required: !!c,
                                              }))
                                            }
                                          />
                                          Required
                                        </label>
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                          <span>Key:</span>
                                          <Input
                                            value={field.key || ""}
                                            onChange={(e) =>
                                              updateField(page.id, section.id, field.id, (f) => ({
                                                ...f,
                                                key: e.target.value,
                                              }))
                                            }
                                            placeholder="Auto-generated"
                                            className="h-6 w-24 px-1 text-xs"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleMoveField(page.id, section.id, fieldIndex, -1)}
                                        disabled={fieldIndex === 0}
                                      >
                                        <ArrowUp className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleMoveField(page.id, section.id, fieldIndex, 1)}
                                        disabled={fieldIndex === section.fields.length - 1}
                                      >
                                        <ArrowDown className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive"
                                        onClick={() => handleRemoveField(page.id, section.id, field.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </motion.div>
                              )
                            })}

                            {/* Add Field Button */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full border-dashed py-6 text-muted-foreground hover:bg-muted/50"
                                >
                                  <Plus className="mr-2 h-4 w-4" /> Add Field
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="w-[300px]">
                                {["Text", "Numeric", "Selection", "Date/Time", "Media"].map((group) => (
                                  <div key={group}>
                                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                                      {group}
                                    </DropdownMenuLabel>
                                    {Object.entries(fieldTypeConfig)
                                      .filter(([, conf]) => conf.group === group)
                                      .map(([type, conf]) => (
                                        <DropdownMenuItem
                                          key={type}
                                          onClick={() => handleAddField(page.id, section.id, type as FormFieldType)}
                                        >
                                          <conf.icon className="mr-2 h-4 w-4" />
                                          {conf.label}
                                        </DropdownMenuItem>
                                      ))}
                                    <DropdownMenuSeparator />
                                  </div>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CollapsibleContent>
                      </Collapsible>
                    </motion.div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="lg"
                  className="w-full border-dashed"
                  onClick={() => handleAddSection(page.id)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Section
                </Button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Sidebar / Settings Area */}
        <div className="space-y-6">
          <Card className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Form Name</Label>
                <Input value={form.name} onChange={(e) => setForm(f => ({...f, name: e.target.value}))} placeholder="Event Scouting" />
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input value={form.year} onChange={(e) => setForm(f => ({...f, year: e.target.value}))} placeholder="2026" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                 <Select value={form.type} onValueChange={(v) => setForm(f => ({...f, type: normalizeFormType(v)}))}>
                   <SelectTrigger>
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="match">Match Scouting</SelectItem>
                     <SelectItem value="pit">Pit Scouting</SelectItem>
                     <SelectItem value="drive">Drive Team Scouting</SelectItem>
                   </SelectContent>
                 </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                 <Select value={form.status} onValueChange={(v) => setForm(f => ({...f, status: v as FormDefinition['status']}))}>
                   <SelectTrigger>
                     <SelectValue />
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

          {form.type === "drive" ? (
            <Card className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <CardHeader>
                <CardTitle>Drive Templates</CardTitle>
                <CardDescription>Start from a curated drive team layout.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DRIVE_FORM_TEMPLATES.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {selectedTemplate?.description || "Choose a template to apply."}
                  </p>
                </div>
                <Button variant="outline" className="w-full" onClick={handleApplyTemplate}>
                  Apply template
                </Button>
                <p className="text-xs text-muted-foreground">
                  Applying a template replaces all pages and sections in this form.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            <CardHeader>
              <CardTitle>Layout & UI</CardTitle>
              <CardDescription>Customize spacing, pages, and navigation buttons.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Layout mode</Label>
                <Select
                  value={uiConfig.layout || "auto"}
                  onValueChange={(value) =>
                    updateUiConfig((config) => ({ ...config, layout: value as FormUiConfig["layout"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (page when 2+)</SelectItem>
                    <SelectItem value="single">Single page</SelectItem>
                    <SelectItem value="paged">Paged</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Auto shows page navigation only when multiple pages exist.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Quick preset</Label>
                <Select
                  value={presetKey}
                  onValueChange={(value) => setPresetKey(value as UiPresetKey)}
                >
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
                  {selectedPreset?.description || "Pick a preset to restyle this form."}
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => updateUiConfig(() => getUiPreset(presetKey))}
                >
                  Apply preset to this form
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Page padding class</Label>
                <Input
                  value={uiConfig.pagePaddingClass || ""}
                  onChange={(e) =>
                    updateUiConfig((config) => ({ ...config, pagePaddingClass: e.target.value }))
                  }
                  placeholder={DEFAULT_UI_CONFIG.pagePaddingClass}
                />
              </div>
              <div className="space-y-2">
                <Label>Page spacing class</Label>
                <Input
                  value={uiConfig.pageSpacingClass || ""}
                  onChange={(e) =>
                    updateUiConfig((config) => ({ ...config, pageSpacingClass: e.target.value }))
                  }
                  placeholder={DEFAULT_UI_CONFIG.pageSpacingClass}
                />
              </div>
              <div className="space-y-2">
                <Label>Section spacing class</Label>
                <Input
                  value={uiConfig.sectionSpacingClass || ""}
                  onChange={(e) =>
                    updateUiConfig((config) => ({ ...config, sectionSpacingClass: e.target.value }))
                  }
                  placeholder={DEFAULT_UI_CONFIG.sectionSpacingClass}
                />
              </div>
              <div className="space-y-2">
                <Label>Field spacing class</Label>
                <Input
                  value={uiConfig.fieldSpacingClass || ""}
                  onChange={(e) =>
                    updateUiConfig((config) => ({ ...config, fieldSpacingClass: e.target.value }))
                  }
                  placeholder={DEFAULT_UI_CONFIG.fieldSpacingClass}
                />
              </div>

              <div className="space-y-2">
                <Label>Section card class</Label>
                <Input
                  value={uiConfig.sectionCardClassName || ""}
                  onChange={(e) =>
                    updateUiConfig((config) => ({ ...config, sectionCardClassName: e.target.value }))
                  }
                  placeholder={DEFAULT_UI_CONFIG.sectionCardClassName}
                />
              </div>
              <div className="space-y-2">
                <Label>Section header class</Label>
                <Input
                  value={uiConfig.sectionHeaderClassName || ""}
                  onChange={(e) =>
                    updateUiConfig((config) => ({ ...config, sectionHeaderClassName: e.target.value }))
                  }
                  placeholder={DEFAULT_UI_CONFIG.sectionHeaderClassName}
                />
              </div>
              <div className="space-y-2">
                <Label>Page header class</Label>
                <Input
                  value={uiConfig.pageHeaderClassName || ""}
                  onChange={(e) =>
                    updateUiConfig((config) => ({ ...config, pageHeaderClassName: e.target.value }))
                  }
                  placeholder={DEFAULT_UI_CONFIG.pageHeaderClassName}
                />
              </div>

              <Separator />

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(uiConfig.nav?.showProgress)}
                  onCheckedChange={(value) =>
                    updateUiConfig((config) => ({
                      ...config,
                      nav: { ...config.nav, showProgress: Boolean(value) },
                    }))
                  }
                />
                <Label>Show page progress</Label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Back label</Label>
                  <Input
                    value={uiConfig.nav?.backLabel || ""}
                    onChange={(e) =>
                      updateUiConfig((config) => ({
                        ...config,
                        nav: { ...config.nav, backLabel: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Next label</Label>
                  <Input
                    value={uiConfig.nav?.nextLabel || ""}
                    onChange={(e) =>
                      updateUiConfig((config) => ({
                        ...config,
                        nav: { ...config.nav, nextLabel: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Submit label</Label>
                  <Input
                    value={uiConfig.nav?.submitLabel || ""}
                    onChange={(e) =>
                      updateUiConfig((config) => ({
                        ...config,
                        nav: { ...config.nav, submitLabel: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Back variant</Label>
                  <Select
                    value={uiConfig.nav?.backVariant || "outline"}
                    onValueChange={(value) =>
                      updateUiConfig((config) => ({
                        ...config,
                        nav: { ...config.nav, backVariant: value as (typeof BUTTON_VARIANTS)[number] },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUTTON_VARIANTS.map((variant) => (
                        <SelectItem key={variant} value={variant}>
                          {variant}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Next variant</Label>
                  <Select
                    value={uiConfig.nav?.nextVariant || "default"}
                    onValueChange={(value) =>
                      updateUiConfig((config) => ({
                        ...config,
                        nav: { ...config.nav, nextVariant: value as (typeof BUTTON_VARIANTS)[number] },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUTTON_VARIANTS.map((variant) => (
                        <SelectItem key={variant} value={variant}>
                          {variant}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Submit variant</Label>
                  <Select
                    value={uiConfig.nav?.submitVariant || "default"}
                    onValueChange={(value) =>
                      updateUiConfig((config) => ({
                        ...config,
                        nav: { ...config.nav, submitVariant: value as (typeof BUTTON_VARIANTS)[number] },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUTTON_VARIANTS.map((variant) => (
                        <SelectItem key={variant} value={variant}>
                          {variant}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Back button class</Label>
                  <Input
                    value={uiConfig.nav?.backClassName || ""}
                    onChange={(e) =>
                      updateUiConfig((config) => ({
                        ...config,
                        nav: { ...config.nav, backClassName: e.target.value },
                      }))
                    }
                    placeholder="Optional Tailwind classes"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Next button class</Label>
                  <Input
                    value={uiConfig.nav?.nextClassName || ""}
                    onChange={(e) =>
                      updateUiConfig((config) => ({
                        ...config,
                        nav: { ...config.nav, nextClassName: e.target.value },
                      }))
                    }
                    placeholder="Optional Tailwind classes"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Submit button class</Label>
                  <Input
                    value={uiConfig.nav?.submitClassName || ""}
                    onChange={(e) =>
                      updateUiConfig((config) => ({
                        ...config,
                        nav: { ...config.nav, submitClassName: e.target.value },
                      }))
                    }
                    placeholder="Optional Tailwind classes"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Collapsible open={dbOpen} onOpenChange={setDbOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                Database & SQL
                <ChevronDown className={cn("h-4 w-4 transition-transform", dbOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <Card>
                <CardHeader>
                  <CardTitle>Database</CardTitle>
                  <CardDescription>Actions to sync schema with DB.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDbAction('generate_sql')}
                    disabled={actionLoading === 'generate_sql'}
                  >
                    {actionLoading === 'generate_sql' ? "Generating..." : "View SQL"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDbAction('push')}
                    disabled={actionLoading === 'push'}
                  >
                    {actionLoading === 'push' ? "Pushing..." : "Push to DB"}
                  </Button>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <Dialog open={sqlDialog.open} onOpenChange={(open) => setSqlDialog(prev => ({...prev, open}))}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{sqlDialog.title}</DialogTitle>
            <DialogDescription>{sqlDialog.description}</DialogDescription>
          </DialogHeader>
          <div className="relative">
             <Textarea value={sqlDialog.sql} readOnly className="h-[300px] w-full font-mono text-xs" />
             <Button size="icon" variant="secondary" className="absolute right-2 top-2" onClick={handleCopySql}>
               <Copy className="h-4 w-4" />
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={templateConfirm.open}
        onOpenChange={(open) =>
          setTemplateConfirm((prev) => ({ ...prev, open, templateId: open ? prev.templateId : "" }))
        }
      >
        <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Replace the current form?</AlertDialogTitle>
             <AlertDialogDescription>
               Applying a template will replace all existing pages, sections, and fields.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={handleConfirmTemplate}>
               Apply template
             </AlertDialogAction>
           </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete form?</AlertDialogTitle>
             <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
           </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
