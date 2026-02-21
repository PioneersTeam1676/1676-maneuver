import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { CircleHelp } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SpecialMultipleChoice } from "@/components/ui/special-multiple-choice"

import { getForm } from "@/lib/formBuilderApi"
import { ACTIVE_FORM_UPDATED_EVENT, getActiveFormId, syncActiveFormConfig } from "@/lib/activeForm"
import { addIdsToScoutingData } from "@/lib/scoutingDataUtils"
import { saveScoutingEntry } from "@/lib/dexieDB"
import { cn } from "@/lib/utils"
import { coercePages, flattenFields, getPageFields, normalizeUiConfig } from "@/lib/formSchema"
import type { FormDefinition, FormField, FormFloatingImage } from "@/types/formBuilder"

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

const normalizeExclusiveGroup = (value?: string) =>
  typeof value === "string" ? value.trim().toLowerCase() : ""

const FieldLabel = ({ field, isRequired }: { field: FormField; isRequired: boolean }) => {
  const description = typeof field.helpText === "string" ? field.helpText.trim() : ""
  return (
    <div className="flex items-center gap-1.5">
      <Label className="flex-1">
        {field.label} {isRequired ? "*" : ""}
      </Label>
      {description ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`${field.label} description`}
            >
              <CircleHelp className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {description}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

const toFiniteNumber = (value: unknown, fallback: number) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const normalizeFloatingImage = (image: FormFloatingImage): FormFloatingImage => ({
  ...image,
  x: toFiniteNumber(image.x, 50),
  y: toFiniteNumber(image.y, 50),
  width: toFiniteNumber(image.width, 200),
  opacity: toFiniteNumber(image.opacity, 100),
  rotation: toFiniteNumber(image.rotation, 0),
  zIndex: toFiniteNumber(image.zIndex, 0),
  showOnMobile: image.showOnMobile !== false,
})

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
    const allFloatingImages = pages.flatMap((page) => page.floatingImages || [])
    return [
      {
        id: "page_all",
        title: "",
        description: "",
        floatingImages: allFloatingImages,
        sections: allSections,
      },
    ]
  }, [isPaged, pages])
  const displayPageCount = displayPages.length
  const currentPage = displayPages[Math.min(pageIndex, displayPageCount - 1)] || displayPages[0]
  const currentPageFields = useMemo(() => getPageFields(currentPage), [currentPage])
  const allFields = useMemo(() => flattenFields(form?.schema), [form])
  const fieldMap = useMemo(
    () => Object.fromEntries(allFields.map((field) => [field.id, field])),
    [allFields]
  )
  const didNotShowActive = currentPageFields.some(f => f.id === "field_did_not_show") && values["field_did_not_show"] === true
  const activeExclusiveByGroup = useMemo(() => {
    const next: Record<string, string> = {}
    allFields.forEach((field) => {
      const group = normalizeExclusiveGroup(field.exclusiveGroup)
      if (!group || next[group]) return
      if (!isEmptyValue(values[field.id], field)) {
        next[group] = field.id
      }
    })
    return next
  }, [allFields, values])
  const floatingImages = useMemo(
    () =>
      (currentPage?.floatingImages || [])
        .filter((image) => typeof image.src === "string" && image.src.trim().length > 0)
        .map(normalizeFloatingImage),
    [currentPage]
  )

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, displayPageCount - 1))
  }, [displayPageCount])

  const handleValueChange = (fieldId: string, value: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [fieldId]: value }
      const changedField = allFields.find((field) => field.id === fieldId)
      const group = normalizeExclusiveGroup(changedField?.exclusiveGroup)
      if (!changedField || !group || isEmptyValue(value, changedField)) {
        return next
      }
      allFields.forEach((field) => {
        if (field.id === fieldId) return
        if (normalizeExclusiveGroup(field.exclusiveGroup) !== group) return
        next[field.id] = getInitialValue(field)
      })
      return next
    })
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
      const nextValues: Record<string, unknown> = { ...prev, [fieldId]: next }
      const changedField = allFields.find((field) => field.id === fieldId)
      const group = normalizeExclusiveGroup(changedField?.exclusiveGroup)
      if (!changedField || !group || isEmptyValue(next, changedField)) {
        return nextValues
      }
      allFields.forEach((field) => {
        if (field.id === fieldId) return
        if (normalizeExclusiveGroup(field.exclusiveGroup) !== group) return
        nextValues[field.id] = getInitialValue(field)
      })
      return nextValues
    })
    setErrors((prev) => {
      if (!prev[fieldId]) return prev
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  const buildSubmission = (currentForm: FormDefinition, scoutInputs: ScoutInputs, valueOverrides?: Record<string, unknown>) => {
    const effectiveValues = valueOverrides ?? values
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

      let value = effectiveValues[field.id]
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

    // Did Not Show: skip all remaining pages and go straight to endgame
    const didNotShowField = currentPageFields.find(f => f.id === "field_did_not_show")
    if (didNotShowField && values[didNotShowField.id] === true) {
      const endgamePage = displayPages.find(p => p.title.toLowerCase().includes("endgame"))
      setPageIndex(endgamePage
        ? displayPages.findIndex(p => p.id === endgamePage.id)
        : displayPageCount - 1)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    // Shift page routing: stay within same won/lost path, jump to endgame after shift 4
    const shiftMatch = currentPage.id.match(/^(won|lost)_s(\d+)$/)
    if (shiftMatch) {
      const path = shiftMatch[1]
      const shiftNum = parseInt(shiftMatch[2])
      const nextShiftPage = displayPages.find(p => p.id === `${path}_s${shiftNum + 1}`)
      if (nextShiftPage) {
        setPageIndex(displayPages.findIndex(p => p.id === nextShiftPage.id))
      } else {
        const endgamePage = displayPages.find(p => p.title.toLowerCase().includes("endgame"))
        setPageIndex(endgamePage
          ? displayPages.findIndex(p => p.id === endgamePage.id)
          : Math.min(pageIndex + 1, displayPageCount - 1))
      }
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    // Alliance Won Auto checkbox: route to correct shift path
    for (const field of currentPageFields) {
      const label = field.label.toLowerCase()
      if (field.type === "checkbox" && label.includes("alliance") && label.includes("won") && label.includes("auto")) {
        const path = values[field.id] === true ? "won" : "lost"
        const targetPage = displayPages.find(p => p.id === `${path}_s1`)
        if (targetPage) {
          setPageIndex(displayPages.findIndex(p => p.id === targetPage.id))
          window.scrollTo({ top: 0, behavior: "smooth" })
          return
        }
      }
    }

    // Default: sequential navigation
    setPageIndex((prev) => Math.min(prev + 1, displayPageCount - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleBackPage = () => {
    if (!isPaged) return
    const shiftMatch = currentPage.id.match(/^(won|lost)_s(\d+)$/)
    if (shiftMatch) {
      const path = shiftMatch[1]
      const shiftNum = parseInt(shiftMatch[2])
      if (shiftNum > 1) {
        const prevPage = displayPages.find(p => p.id === `${path}_s${shiftNum - 1}`)
        if (prevPage) {
          setPageIndex(displayPages.findIndex(p => p.id === prevPage.id))
          window.scrollTo({ top: 0, behavior: "smooth" })
          return
        }
      } else {
        const transitionPage = displayPages.find(p => p.id === "page_transition")
        if (transitionPage) {
          setPageIndex(displayPages.findIndex(p => p.id === transitionPage.id))
          window.scrollTo({ top: 0, behavior: "smooth" })
          return
        }
      }
    }
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
      const didNotShow = values["field_did_not_show"] === true
      let submissionValues: Record<string, unknown> | undefined
      if (didNotShow) {
        submissionValues = { field_did_not_show: true }
        allFields.forEach((field) => {
          if (field.id === "field_did_not_show") return
          if (field.type === "number" || field.type === "slider" || field.type === "rating") {
            submissionValues![field.id] = 0
          } else if (field.type === "checkbox") {
            submissionValues![field.id] = false
          } else {
            submissionValues![field.id] = null
          }
        })
      }
      const submission = buildSubmission(form, inputs, submissionValues)
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
        "container mx-auto max-w-5xl animate-in fade-in-0 duration-300 relative overflow-hidden",
        uiConfig.pagePaddingClass
      )}
    >
      {floatingImages.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {floatingImages.map((image) => (
            <img
              key={image.id}
              src={image.src}
              alt={image.alt || ""}
              loading="lazy"
              className={cn(
                "absolute select-none rounded-md object-contain",
                image.showOnMobile === false && "hidden md:block"
              )}
              style={{
                left: `${image.x}%`,
                top: `${image.y}%`,
                width: `${image.width}px`,
                opacity: Math.max(0, Math.min(100, image.opacity ?? 100)) / 100,
                transform: `translate(-50%, -50%) rotate(${image.rotation ?? 0}deg)`,
                zIndex: image.zIndex ?? 0,
              }}
            />
          ))}
        </div>
      ) : null}

      <div className={cn("relative z-10", uiConfig.pageSpacingClass)}>
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
                const group = normalizeExclusiveGroup(field.exclusiveGroup)
                const activeFieldId = group ? activeExclusiveByGroup[group] : ""
                const isGrayedOut = Boolean(group && activeFieldId && activeFieldId !== field.id)
                const activeFieldLabel = activeFieldId ? fieldMap[activeFieldId]?.label || "another field" : ""

              if (field.type === "long_text") {
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <Textarea
                      value={String(fieldValue ?? "")}
                      onChange={(event) => handleValueChange(field.id, event.target.value)}
                      placeholder={field.placeholder || ""}
                    />
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "select") {
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
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
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "radio") {
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="space-y-2">
                      {(field.options || []).map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name={field.id}
                            value={option}
                            checked={String(fieldValue ?? "") === option}
                            onChange={() => {
                              // Allow deselect: if clicking the same option, clear it
                              if (String(fieldValue ?? "") === option) {
                                handleValueChange(field.id, "")
                              } else {
                                handleValueChange(field.id, option)
                              }
                            }}
                            className="accent-primary h-4 w-4"
                          />
                          <span className="font-semibold">{option}</span>
                        </label>
                      ))}
                    </div>
                    {typeof fieldValue === "string" && fieldValue.length > 0 ? (
                      <Button
                        variant="ghost"
                        type="button"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleValueChange(field.id, "")}
                        disabled={isGrayedOut}
                      >
                        Clear selection
                      </Button>
                    ) : null}
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "radio_cards") {
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <SpecialMultipleChoice
                      ariaLabel={field.label}
                      options={field.options}
                      value={String(fieldValue ?? "")}
                      onValueChange={(value) => handleValueChange(field.id, value)}
                      allowDeselect={Boolean(field.allowDeselect)}
                      disabled={isGrayedOut}
                    />
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "multi_select") {
                const selected = Array.isArray(fieldValue) ? (fieldValue as string[]) : []
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="space-y-2">
                      {(field.options || []).map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selected.includes(option)}
                            onCheckedChange={() => handleToggleOption(field.id, option)}
                          />
                          <span className="font-semibold">{option}</span>
                        </label>
                      ))}
                    </div>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "checkbox") {
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={Boolean(fieldValue)}
                        onCheckedChange={(value) => handleValueChange(field.id, Boolean(value))}
                      />
                      <span className="font-semibold">
                        {field.label} {isRequired ? "*" : ""}
                      </span>
                      {field.helpText ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                              aria-label={`${field.label} description`}
                            >
                              <CircleHelp className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {field.helpText}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </label>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "image") {
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
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
                          className="w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
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
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
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
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "rating") {
                const min = field.min ?? 1
                const max = field.max ?? 5
                const options = Array.from({ length: max - min + 1 }, (_, idx) => String(min + idx))
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
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
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
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
                <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                  <FieldLabel field={field} isRequired={isRequired} />
                  <Input
                    type={inputType}
                    value={String(fieldValue ?? "")}
                    onChange={(event) => handleValueChange(field.id, event.target.value)}
                    placeholder={field.placeholder || ""}
                  />
                  {isGrayedOut ? (
                    <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
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
          {isPaged && pageIndex < displayPageCount - 1 && !didNotShowActive ? (
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
    </div>
  )
}
