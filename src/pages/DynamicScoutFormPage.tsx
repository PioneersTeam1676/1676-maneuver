import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { getForm } from "@/lib/formBuilderApi"
import { ACTIVE_FORM_UPDATED_EVENT, getActiveFormId, syncActiveFormConfig } from "@/lib/activeForm"
import { addIdsToScoutingData } from "@/lib/scoutingDataUtils"
import { saveScoutingEntry } from "@/lib/dexieDB"
import { cn } from "@/lib/utils"
import { coercePages, flattenFields, getPageFields, normalizeUiConfig } from "@/lib/formSchema"
import type { FormDefinition, FormField } from "@/types/formBuilder"

type ScoutInputs = {
  matchNumber: string
  alliance: string
  scoutName: string
  selectTeam: string
  eventName: string
}

type LocationState = {
  inputs?: ScoutInputs
}

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field"

const isEmptyValue = (value: unknown, field: FormField) => {
  if (value === undefined || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "string") return value.trim() === ""
  if (field.type === "checkbox") return value !== true
  return false
}

const getInitialValue = (field: FormField) => {
  if (field.type === "checkbox") return false
  if (field.type === "multi_select") return [] as string[]
  if (field.type === "image") return ""
  return ""
}

export default function DynamicScoutFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null
  const inputs = state?.inputs
  const [activeFormId, setActiveFormIdState] = useState(() => getActiveFormId("match"))

  const [form, setForm] = useState<FormDefinition | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)

  useEffect(() => {
    if (!inputs) {
      navigate("/game-start", { replace: true })
      return
    }
  }, [inputs, navigate])

  useEffect(() => {
    let cancelled = false
    syncActiveFormConfig()
      .then((config) => {
        if (!cancelled) {
          setActiveFormIdState(config.match || "")
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
      setActiveFormIdState(getActiveFormId("match"))
    }
    window.addEventListener(ACTIVE_FORM_UPDATED_EVENT, handleActiveUpdate)
    return () => {
      window.removeEventListener(ACTIVE_FORM_UPDATED_EVENT, handleActiveUpdate)
    }
  }, [])

  useEffect(() => {
    if (!activeFormId) {
      toast.error("No active scout form is set.")
      navigate("/game-start", { replace: true })
      return
    }

    setLoading(true)
    getForm(activeFormId)
      .then((data) => {
        const pages = coercePages(data.schema)
        setForm({
          ...data,
          schema: {
            ...data.schema,
            pages,
          },
        })
        const nextValues: Record<string, unknown> = {}
        pages.forEach((page) => {
          page.sections.forEach((section) => {
            section.fields.forEach((field) => {
              nextValues[field.id] = getInitialValue(field)
            })
          })
        })
        setValues(nextValues)
        setPageIndex(0)
      })
      .catch((error) => {
        console.error("Failed to load scout form", error)
        toast.error("Could not load the active scout form.")
        navigate("/game-start", { replace: true })
      })
      .finally(() => setLoading(false))
  }, [activeFormId, navigate])

  const pages = useMemo(() => coercePages(form?.schema), [form])
  const uiConfig = useMemo(() => normalizeUiConfig(form?.schema?.ui), [form])
  const layoutMode = uiConfig.layout || "auto"
  const isPaged = layoutMode === "paged" || (layoutMode === "auto" && pages.length > 1)
  const displayPages = useMemo(() => {
    if (isPaged) return pages
    const allSections = pages.flatMap((page) => page.sections)
    return [
      {
        id: "page_all",
        title: "",
        description: "",
        sections: allSections,
      },
    ]
  }, [isPaged, pages])
  const displayPageCount = displayPages.length
  const currentPage = displayPages[Math.min(pageIndex, displayPageCount - 1)] || displayPages[0]
  const currentPageFields = useMemo(() => getPageFields(currentPage), [currentPage])
  const allFields = useMemo(() => flattenFields(form?.schema), [form])

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, displayPageCount - 1))
  }, [displayPageCount])

  const handleValueChange = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
    setErrors((prev) => {
      if (!prev[fieldId]) return prev
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  const handleToggleOption = (fieldId: string, option: string) => {
    setValues((prev) => {
      const current = Array.isArray(prev[fieldId]) ? (prev[fieldId] as string[]) : []
      const exists = current.includes(option)
      const next = exists ? current.filter((item) => item !== option) : [...current, option]
      return { ...prev, [fieldId]: next }
    })
  }

  const buildSubmission = (currentForm: FormDefinition, scoutInputs: ScoutInputs) => {
    const usedKeys = new Set<string>()
    const responseData: Record<string, unknown> = {}

    flattenFields(currentForm.schema).forEach((field) => {
      const baseLabel = field.label || field.id
      const customKey = typeof field.key === "string" ? normalizeKey(field.key) : ""
      const baseKey = customKey || `field_${normalizeKey(baseLabel)}`
      let key = baseKey
      if (usedKeys.has(key)) {
        const fallbackBase = customKey || `field_${normalizeKey(baseLabel)}`
        key = `${fallbackBase}_${field.id.slice(0, 6)}`
      }
      usedKeys.add(key)

      let value = values[field.id]
      if (field.type === "number" || field.type === "rating" || field.type === "slider") {
        if (value !== "" && value !== undefined && value !== null) {
          const num = Number(value)
          value = Number.isNaN(num) ? value : num
        }
      }
      responseData[key] = value
    })

    return {
      ...scoutInputs,
      formId: currentForm.id,
      formName: currentForm.name,
      formYear: currentForm.year,
      formType: currentForm.type,
      formVersion: currentForm.updatedAt || currentForm.createdAt || null,
      recordedAt: new Date().toISOString(),
      ...responseData,
    }
  }

  const handleImageUpload = (fieldId: string, file?: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      if (!result) {
        toast.error("Failed to read image.")
        return
      }
      handleValueChange(fieldId, result)
    }
    reader.onerror = () => {
      toast.error("Failed to upload image.")
    }
    reader.readAsDataURL(file)
  }

  const handleNextPage = () => {
    if (!isPaged) return
    const nextErrors: Record<string, string> = {}
    currentPageFields.forEach((field) => {
      if (field.required && isEmptyValue(values[field.id], field)) {
        nextErrors[field.id] = "Required"
      }
    })
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      toast.error("Please fill out all required fields.")
      return
    }
    setPageIndex((prev) => Math.min(prev + 1, displayPageCount - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleBackPage = () => {
    if (!isPaged) return
    setPageIndex((prev) => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleSubmit = async () => {
    if (!form || !inputs) return
    const nextErrors: Record<string, string> = {}

    allFields.forEach((field) => {
      if (field.required && isEmptyValue(values[field.id], field)) {
        nextErrors[field.id] = "Required"
      }
    })

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      toast.error("Please fill out all required fields.")
      return
    }

    setSaving(true)
    try {
      const submission = buildSubmission(form, inputs)
      const [entry] = addIdsToScoutingData([submission])
      if (entry) {
        await saveScoutingEntry(entry)
      }
      toast.success("Scouting entry saved.")

      const nextMatchNumber = Number(inputs.matchNumber) + 1
      navigate("/game-start", {
        state: {
          inputs: {
            ...inputs,
            matchNumber: Number.isNaN(nextMatchNumber) ? inputs.matchNumber : String(nextMatchNumber),
          },
        },
      })
    } catch (error) {
      console.error("Failed to save scouting entry", error)
      toast.error("Failed to save scouting entry.")
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return (
      <div className="container mx-auto max-w-4xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Loading scout form…</CardTitle>
            <CardDescription>Preparing the active scouting form.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "container mx-auto max-w-5xl animate-in fade-in-0 duration-300",
        uiConfig.pagePaddingClass,
        uiConfig.pageSpacingClass
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{form.name}</h1>
          <p className="text-muted-foreground">
            {inputs?.eventName} • Match {inputs?.matchNumber} • Team {inputs?.selectTeam}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/game-start", { state })}>
          Back
        </Button>
      </div>

      {(currentPage?.title || currentPage?.description || (uiConfig.nav?.showProgress && isPaged)) && (
        <div
          className={cn(
            "rounded-lg border bg-muted/30 p-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
            uiConfig.pageHeaderClassName
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {currentPage?.title ? (
                <h2 className="text-xl font-semibold">{currentPage.title}</h2>
              ) : null}
              {currentPage?.description ? (
                <p className="text-sm text-muted-foreground">{currentPage.description}</p>
              ) : null}
            </div>
            {uiConfig.nav?.showProgress && isPaged ? (
              <span className="text-xs text-muted-foreground">
                Page {pageIndex + 1} of {displayPageCount}
              </span>
            ) : null}
          </div>
        </div>
      )}

      <div
        key={currentPage.id}
        className={cn(
          "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
          uiConfig.sectionSpacingClass
        )}
      >
        {currentPage.sections.map((section) => (
          <Card
            key={section.id}
            className={cn(
              "border-muted/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
              uiConfig.sectionCardClassName
            )}
          >
            <CardHeader className={cn("space-y-2", uiConfig.sectionHeaderClassName)}>
              <CardTitle className="text-xl">{section.title}</CardTitle>
              {section.description ? (
                <CardDescription>{section.description}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className={cn(uiConfig.fieldSpacingClass)}>
              {section.fields.map((field) => {
                const fieldValue = values[field.id]
                const isRequired = Boolean(field.required)
                const fieldError = errors[field.id]

              if (field.type === "long_text") {
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <Textarea
                      value={String(fieldValue ?? "")}
                      onChange={(event) => handleValueChange(field.id, event.target.value)}
                      placeholder={field.placeholder || ""}
                    />
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "select" || field.type === "radio") {
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <Select
                      value={String(fieldValue ?? "")}
                      onValueChange={(value) => handleValueChange(field.id, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={field.placeholder || "Select an option"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options || []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "multi_select") {
                const selected = Array.isArray(fieldValue) ? (fieldValue as string[]) : []
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <div className="space-y-2">
                      {(field.options || []).map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selected.includes(option)}
                            onCheckedChange={() => handleToggleOption(field.id, option)}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "checkbox") {
                return (
                  <div key={field.id} className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={Boolean(fieldValue)}
                        onCheckedChange={(value) => handleValueChange(field.id, Boolean(value))}
                      />
                      <span>
                        {field.label} {isRequired ? "*" : ""}
                      </span>
                    </label>
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "image") {
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="outline" type="button" className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 cursor-pointer opacity-0"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            handleImageUpload(field.id, file)
                            event.target.value = ""
                          }}
                        />
                        Upload image
                      </Button>
                      {fieldValue ? (
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => handleValueChange(field.id, "")}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                    {typeof fieldValue === "string" && fieldValue ? (
                      <div className="overflow-hidden rounded-lg border bg-muted">
                        <img
                          src={fieldValue}
                          alt={field.label}
                          className="h-48 w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "slider") {
                const min = field.min ?? 0
                const max = field.max ?? 5
                const step = field.step ?? 1
                const numericValue = Number(fieldValue || min)
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={numericValue}
                        onChange={(event) => handleValueChange(field.id, event.target.value)}
                        className="w-full"
                      />
                      <span className="text-sm font-medium w-10 text-right">{numericValue}</span>
                    </div>
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "rating") {
                const min = field.min ?? 1
                const max = field.max ?? 5
                const options = Array.from({ length: max - min + 1 }, (_, idx) => String(min + idx))
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <Select
                      value={String(fieldValue ?? "")}
                      onValueChange={(value) => handleValueChange(field.id, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={field.placeholder || "Select rating"} />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              const inputType =
                field.type === "number"
                  ? "number"
                  : field.type === "date"
                    ? "date"
                    : field.type === "time"
                      ? "time"
                      : "text"

              return (
                <div key={field.id} className="space-y-2">
                  <Label>
                    {field.label} {isRequired ? "*" : ""}
                  </Label>
                  <Input
                    type={inputType}
                    value={String(fieldValue ?? "")}
                    onChange={(event) => handleValueChange(field.id, event.target.value)}
                    placeholder={field.placeholder || ""}
                  />
                  {field.helpText ? (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  ) : null}
                  {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                </div>
              )
            })}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={cn("flex flex-wrap items-center gap-3", isPaged ? "justify-between" : "justify-end")}>
        {isPaged ? (
          <Button
            variant={uiConfig.nav?.backVariant}
            className={cn("transition-transform hover:-translate-y-0.5", uiConfig.nav?.backClassName)}
            onClick={handleBackPage}
            disabled={pageIndex === 0}
          >
            {uiConfig.nav?.backLabel}
          </Button>
        ) : null}
        <div className="flex items-center gap-3">
          {isPaged && pageIndex < displayPageCount - 1 ? (
            <Button
              variant={uiConfig.nav?.nextVariant}
              className={cn("transition-transform hover:-translate-y-0.5", uiConfig.nav?.nextClassName)}
              onClick={handleNextPage}
            >
              {uiConfig.nav?.nextLabel}
            </Button>
          ) : (
            <Button
              variant={uiConfig.nav?.submitVariant}
              className={cn("transition-transform hover:-translate-y-0.5", uiConfig.nav?.submitClassName)}
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? "Saving…" : uiConfig.nav?.submitLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
