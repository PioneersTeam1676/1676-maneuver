import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { CircleHelp } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberStepper } from "@/components/ui/number-stepper"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SpecialMultipleChoice } from "@/components/ui/special-multiple-choice"

import matchScoutFormData from "@/data/matchScoutForm.json"
import { addIdsToScoutingData } from "@/lib/scoutingDataUtils"
import { saveScoutingEntry } from "@/lib/dexieDB"
import { splitSpecialChoiceOption } from "@/lib/specialChoiceOptions"
import { cn } from "@/lib/utils"
import { coercePages, flattenFields, getPageFields, normalizeUiConfig } from "@/lib/formSchema"
import type { FormDefinition, FormField, FormFloatingImage, FormPage } from "@/types/formBuilder"

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
  if ((field.type === "radio" || field.type === "radio_cards") && field.multiSelect) return [] as string[]
  if (field.type === "image") return ""
  if (field.type === "rating" || field.type === "number" || field.type === "slider") return field.min ?? 0
  if (isStratChoiceField(field)) {
    const nonFuncOption = (field.options || []).find((opt) =>
      hasKeyword(splitSpecialChoiceOption(opt).title, NON_FUNCTIONING_KEYWORDS)
    )
    return nonFuncOption ?? ""
  }
  return ""
}

const normalizeExclusiveGroup = (value?: string) =>
  typeof value === "string" ? value.trim().toLowerCase() : ""

const isAutoCollectionField = (label: string) =>
  label.trim().toLowerCase().includes("where did they collect in auto")

const isGenericCollectionPrompt = (label: string) =>
  label.trim().toLowerCase().includes("where did they collect")

const CLIMB_SPECIAL_MCQ_OPTIONS = ["Yes", "Attempted but failed", "No"]

const isClimbSpecialField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const options = field.options || []
  if (label !== "climb?") return false
  if (options.length !== CLIMB_SPECIAL_MCQ_OPTIONS.length) return false
  const normalized = options.map((option) => splitSpecialChoiceOption(option).title.trim().toLowerCase())
  return CLIMB_SPECIAL_MCQ_OPTIONS.every((option) => normalized.includes(option.toLowerCase()))
}

const isAutoInteractionField = (field?: FormField) => {
  if (!field) return false
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  return (
    isAutoCollectionField(label) ||
    isClimbSpecialField(field) ||
    label.includes("auto") ||
    key.includes("auto")
  )
}

const isAutoStrategyField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  if (isAutoCollectionField(label)) return false
  return label.includes("auto") && (label.includes("strat") || label.includes("strategy"))
}

const STATUS_KEYWORDS = [
  "did not show",
]

const NON_FUNCTIONING_KEYWORDS = ["non-functioning", "non functioning", "not functioning"]

const normalizeOptionTitle = (value: string) => splitSpecialChoiceOption(value).title.trim().toLowerCase()

const normalizeOptionDisplayText = (value: string) => {
  const parsed = splitSpecialChoiceOption(value)
  const normalizedTitle =
    parsed.title.trim().toLowerCase() === "hybrid scoring" ? "Hybrid" : parsed.title
  if (normalizedTitle === parsed.title) return value
  return parsed.description ? `${normalizedTitle} | ${parsed.description}` : normalizedTitle
}

const isAutoPageLike = (page: FormPage) => {
  const title = (page.title || "").trim().toLowerCase()
  const pageId = (page.id || "").trim().toLowerCase()
  return title.includes("auto") || pageId.includes("auto")
}

const normalizeAutoCollectionField = (field: FormField, onAutoPage: boolean): FormField => {
  const label = field.label || ""
  const shouldConvert =
    isAutoCollectionField(label) ||
    (onAutoPage && isGenericCollectionPrompt(label))
  if (!shouldConvert) return field
  return {
    ...field,
    type: "radio_cards",
    label: "Climb?",
    options: CLIMB_SPECIAL_MCQ_OPTIONS,
    multiSelect: false,
    allowDeselect: false,
  }
}

const normalizeFieldOptionLabels = (field: FormField): FormField => {
  if (!Array.isArray(field.options) || field.options.length === 0) return field
  const nextOptions = field.options.map((option) => normalizeOptionDisplayText(option))
  const changed = nextOptions.some((option, index) => option !== field.options?.[index])
  if (!changed) return field
  return { ...field, options: nextOptions }
}

const normalizePagesOptionLabels = (pages: FormPage[]): FormPage[] =>
  pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      fields: (section.fields || [])
        .map((field) => normalizeAutoCollectionField(field, isAutoPageLike(page)))
        .map((field) => normalizeFieldOptionLabels(field)),
    })),
  }))

const hasKeyword = (value: string, keywords: string[]) => {
  const normalized = value.trim().toLowerCase()
  return keywords.some((keyword) => normalized.includes(keyword))
}

const isNonFunctioningLabel = (value: string) => hasKeyword(value, NON_FUNCTIONING_KEYWORDS)

const isStatusField = (field: FormField) => {
  const label = field.label || ""
  if (hasKeyword(label, STATUS_KEYWORDS)) return true
  return (field.options || []).some((option) => hasKeyword(normalizeOptionTitle(option), STATUS_KEYWORDS))
}

const isPredictionField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  return label.includes("prediction") || (label.includes("winner") && label.includes("alliance"))
}

const isRedOption = (option: string) => {
  const title = normalizeOptionTitle(option)
  return title === "red" || title.startsWith("red ") || title.includes("red alliance")
}

const isBlueOption = (option: string) => {
  const title = normalizeOptionTitle(option)
  return title === "blue" || title.startsWith("blue ") || title.includes("blue alliance")
}

const hasRedBlueOptions = (field: FormField) => {
  const options = field.options || []
  return options.some((option) => isRedOption(option)) && options.some((option) => isBlueOption(option))
}

const isAllianceWonAutoField = (field: FormField) => {
  const label = (field.label || "").toLowerCase()
  return field.type === "checkbox" && label.includes("alliance") && label.includes("won") && label.includes("auto")
}

const hasEstimateOrRatingValue = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  return (
    label.includes("rate") ||
    label.includes("rating") ||
    label.includes("estimate") ||
    key.includes("rating") ||
    key.includes("estimate")
  )
}

const isStratRateField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  return (
    hasEstimateOrRatingValue(field) &&
    (
      label.includes("strat") ||
      label.includes("strategy") ||
      label.includes("shift") ||
      label.includes("auto") ||
      label.includes("endgame") ||
      key.includes("rating") ||
      key.includes("estimate")
    )
  )
}

const isTransitionRatingField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  return hasEstimateOrRatingValue(field) && (label.includes("transition") || key.includes("transition"))
}

const isWideRatingField = (field: FormField) =>
  isStratRateField(field) || isTransitionRatingField(field)

const isStratChoiceField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  const strategyContext =
    label.includes("strat") ||
    label.includes("strategy") ||
    key.includes("strat") ||
    key.includes("strategy")
  const roleContext = label.includes("role") || key.includes("role")
  if (!(strategyContext || roleContext)) return false
  return !label.includes("rate") && !label.includes("rating")
}

const isSecondaryStratRoleField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  return isStratChoiceField(field) && (label.includes("secondary") || key.includes("secondary"))
}

const withSecondaryDefenseOption = (field: FormField, options: string[]) => {
  if (!isSecondaryStratRoleField(field)) return options
  let result = options.map((opt) => {
    if (splitSpecialChoiceOption(opt).title.trim().toLowerCase() === "defense") return "Was Defending"
    return opt
  })
  const hasDefense = result.some((option) => {
    const t = splitSpecialChoiceOption(option).title.trim().toLowerCase()
    return t === "was defending" || t === "defense"
  })
  if (!hasDefense) result = [...result, "Was Defending"]
  const hasNonFunc = result.some((option) =>
    hasKeyword(splitSpecialChoiceOption(option).title, NON_FUNCTIONING_KEYWORDS)
  )
  if (!hasNonFunc) result = [...result, "Non-Functioning"]
  return result
}

const normalizeStratRoleSignature = (value: string) =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\b(primary|secondary|first|second|1st|2nd)\b/g, " ")
    .replace(/\b(role|scorer)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

const getStratRoleSignature = (field: FormField) => {
  const keySignature = normalizeStratRoleSignature(field.key || "")
  const labelSignature = normalizeStratRoleSignature(field.label || "")
  return keySignature || labelSignature || "__strat_role__"
}

const mergeStratRoleOptions = (optionGroups: string[][]) => {
  const merged: string[] = []
  const seen = new Set<string>()

  optionGroups.forEach((options) => {
    options.forEach((option) => {
      const signature = normalizeOptionTitle(option)
      if (!signature || seen.has(signature)) return
      seen.add(signature)
      merged.push(option)
    })
  })

  return merged
}

const normalizeMergedStratRoleLabel = (label: string) => {
  const normalized = String(label || "")
    .replace(/\(([^)]*(primary|secondary)[^)]*)\)/gi, " ")
    .replace(/\b(primary|secondary)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  return normalized || "Strategy Role"
}

const mergeStratRolesForPages = (pages: FormPage[]): FormPage[] =>
  pages.map((page) => {
    const pageFields = page.sections.flatMap((section) => section.fields || [])
    const primaryFields = pageFields.filter(
      (field) => isStratChoiceField(field) && !isSecondaryStratRoleField(field)
    )
    const primarySignatures = new Set(primaryFields.map((field) => getStratRoleSignature(field)))
    const firstPrimaryFieldId = primaryFields[0]?.id || ""

    const secondaryBySignature = new Map<string, FormField[]>()
    pageFields.forEach((field) => {
      if (!isSecondaryStratRoleField(field)) return
      const signature = getStratRoleSignature(field)
      const existing = secondaryBySignature.get(signature) || []
      existing.push(field)
      secondaryBySignature.set(signature, existing)
    })
    const unmatchedSecondaryOptions = Array.from(secondaryBySignature.entries())
      .filter(([signature]) => !primarySignatures.has(signature))
      .flatMap(([, fields]) =>
        fields.flatMap((secondaryField) =>
          withSecondaryDefenseOption(secondaryField, secondaryField.options || [])
        )
      )

    return {
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        fields: (section.fields || []).flatMap((field) => {
          if (isSecondaryStratRoleField(field)) {
            const signature = getStratRoleSignature(field)
            if (primarySignatures.has(signature) || primaryFields.length > 0) return []
            return [
              {
                ...field,
                label: normalizeMergedStratRoleLabel(field.label || ""),
                options: withSecondaryDefenseOption(field, field.options || []),
              },
            ]
          }

          if (!isStratChoiceField(field)) return [field]

          const signature = getStratRoleSignature(field)
          const secondaryFields = secondaryBySignature.get(signature) || []
          if (secondaryFields.length === 0) return [field]

          const secondaryOptions = secondaryFields.flatMap((secondaryField) =>
            withSecondaryDefenseOption(secondaryField, secondaryField.options || [])
          )
          const fallbackOptions = field.id === firstPrimaryFieldId ? unmatchedSecondaryOptions : []

          return [
            {
              ...field,
              label: normalizeMergedStratRoleLabel(field.label || ""),
              required: Boolean(field.required || secondaryFields.some((secondaryField) => secondaryField.required)),
              options: mergeStratRoleOptions([field.options || [], secondaryOptions, fallbackOptions]),
            },
          ]
        }),
      })),
    }
  })

const normalizeStratDefenseLabels = (pages: FormPage[]): FormPage[] =>
  pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      fields: (section.fields || []).map((field) => {
        const label = (field.label || "").trim().toLowerCase()
        let newLabel = field.label
        if (label === "defended") newLabel = "Was Defended"
        if (label === "defense") newLabel = "Was Defending"

        if (isStratChoiceField(field)) {
          const options = (field.options || []).map((opt) => {
            if (splitSpecialChoiceOption(opt).title.trim().toLowerCase() === "defense") return "Was Defending"
            if (splitSpecialChoiceOption(opt).title.trim().toLowerCase() === "defended") return "Was Defended"
            return opt
          })
          const hasNonFunc = options.some((opt) =>
            hasKeyword(splitSpecialChoiceOption(opt).title, NON_FUNCTIONING_KEYWORDS)
          )
          const finalOptions = hasNonFunc ? options : [...options, "Non-Functioning"]
          return { ...field, label: newLabel, options: finalOptions }
        }

        if (newLabel !== field.label) return { ...field, label: newLabel }
        return field
      }),
    })),
  }))

const isAutoWhereDidTheyCollectField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  return isAutoCollectionField(label)
}

const isClimbField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  if (isAutoCollectionField(label)) return false
  return label.includes("where did they collect") || label.includes("climb")
}

const isMiscField = (field: FormField) => (field.label || "").trim().toLowerCase().includes("misc")

const isDefendedField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  return label.includes("defended") || label.includes("defense") || label.includes("defending")
}

const isNotesField = (field: FormField) => (field.label || "").trim().toLowerCase().includes("note")

const CLIMB_LEVEL_OPTIONS = ["Level 1", "Level 2", "Level 3"]

const getFieldPriority = (field: FormField, onTransitionPage = false) => {
  if (onTransitionPage && isAllianceWonAutoField(field)) return -1
  if (onTransitionPage && isTransitionRatingField(field)) return 0
  if (onTransitionPage && isDefendedField(field)) return 2.1
  if (isStatusField(field)) return 1
  return 0
}

const isTransitionPhasePageId = (pageId: string) => /^(won|lost)_s\d+$/i.test(pageId.trim())

const FieldLabel = ({
  field,
  isRequired,
  hideDescription = false,
}: {
  field: FormField
  isRequired: boolean
  hideDescription?: boolean
}) => {
  const description =
    hideDescription || typeof field.helpText !== "string" ? "" : field.helpText.trim()
  return (
    <div className="flex items-center gap-1">
      <Label className="flex-1 text-sm leading-tight">
        {field.label} {isRequired ? "*" : ""}
      </Label>
      {description ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`${field.label} description`}
            >
              <CircleHelp className="h-3.5 w-3.5" />
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

const HARDCODED_MATCH_FORM = (() => {
  const raw = matchScoutFormData as unknown as FormDefinition
  const pages = normalizeStratDefenseLabels(
    mergeStratRolesForPages(
      normalizePagesOptionLabels(
        coercePages(raw.schema)
      )
    )
  )
  return {
    ...raw,
    schema: {
      ...raw.schema,
      pages,
    },
  }
})()

const buildInitialMatchValues = () => {
  const nextValues: Record<string, unknown> = {}
  HARDCODED_MATCH_FORM.schema.pages.forEach((page) => {
    page.sections.forEach((section) => {
      section.fields.forEach((field) => {
        nextValues[field.id] = getInitialValue(field)
      })
    })
  })
  return nextValues
}

const toggleOptionValue = (current: unknown, option: string) => {
  const selected = Array.isArray(current) ? current.filter((value): value is string => typeof value === "string") : []
  return selected.includes(option)
    ? selected.filter((value) => value !== option)
    : [...selected, option]
}

export default function DynamicScoutFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null
  const inputs = state?.inputs
  const form = HARDCODED_MATCH_FORM
  const [values, setValues] = useState<Record<string, unknown>>(buildInitialMatchValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)

  useEffect(() => {
    if (!inputs) {
      navigate("/game-start", { replace: true })
      return
    }
  }, [inputs, navigate])

  const pages = useMemo(() => coercePages(form?.schema), [form])
  const uiConfig = useMemo(() => normalizeUiConfig(form?.schema?.ui), [form])
  const compactFieldSpacingClass = useMemo(
    () => (uiConfig.fieldSpacingClass || "").replace(/\bspace-y-\d+\b/g, "").trim(),
    [uiConfig.fieldSpacingClass]
  )
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

  const isTransitionPage = currentPage.id === "page_transition" || (currentPage.title || "").toLowerCase().includes("transition")
  const isAutoPage = (currentPage.title || "").toLowerCase().includes("auto") || currentPage.id.toLowerCase().includes("auto")
  const isTransitionOrPhasePage = isTransitionPage || isTransitionPhasePageId(currentPage.id)
  const isEndgamePage = (currentPage.title || "").toLowerCase().includes("endgame") || currentPage.id.toLowerCase().includes("endgame")
  const isPostMatchPage = (currentPage.title || "").toLowerCase().includes("post") || currentPage.id.toLowerCase().includes("post_match") || currentPage.id.toLowerCase().includes("post-match")

  // Auto = 0, Transition = 1, Shifts 1-4 = 2-5, Endgame = 6
  const logicalPageNumber = useMemo(() => {
    const id = currentPage.id
    if (isAutoPage) return 0
    const shiftMatch = id.match(/^(?:won|lost)_s(\d+)$/)
    if (shiftMatch) return 1 + parseInt(shiftMatch[1])
    if (isEndgamePage) return 6
    // Transition or other pre-shift page
    return 1
  }, [currentPage, isAutoPage, isEndgamePage])

  const logicalPageCount = 6

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, displayPageCount - 1))
  }, [displayPageCount])

  const handleValueChange = (fieldId: string, value: unknown) => {
    setValues((prev) => {
      const changedField = allFields.find((field) => field.id === fieldId)
      const group =
        isAutoPage || isAutoInteractionField(changedField)
          ? ""
          : normalizeExclusiveGroup(changedField?.exclusiveGroup)
      const next = { ...prev, [fieldId]: value }
      if (!changedField || !group || isEmptyValue(value, changedField)) {
        return next
      }
      allFields.forEach((field) => {
        if (field.id === fieldId) return
        if (normalizeExclusiveGroup(field.exclusiveGroup) !== group) return
        if (isAutoInteractionField(field)) return
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
      const changedField = allFields.find((field) => field.id === fieldId)
      const group =
        isAutoPage || isAutoInteractionField(changedField)
          ? ""
          : normalizeExclusiveGroup(changedField?.exclusiveGroup)
      const nextValues: Record<string, unknown> = { ...prev, [fieldId]: next }
      if (!changedField || !group || isEmptyValue(next, changedField)) {
        return nextValues
      }
      allFields.forEach((field) => {
        if (field.id === fieldId) return
        if (normalizeExclusiveGroup(field.exclusiveGroup) !== group) return
        if (isAutoInteractionField(field)) return
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
      const rawCustomKey = typeof field.key === "string" ? field.key.trim() : ""
      const customKey = rawCustomKey ? normalizeKey(rawCustomKey) : ""
      const baseKey = customKey || `field_${normalizeKey(baseLabel)}`
      let key = baseKey
      if (usedKeys.has(key)) {
        const fallbackBase = customKey || `field_${normalizeKey(baseLabel)}`
        key = `${fallbackBase}_${field.id.slice(0, 6)}`
      }
      usedKeys.add(key)

      let value = effectiveValues[field.id]
      if (field.type === "number" || field.type === "rating" || field.type === "slider") {
        const num = Number(value)
        value = Number.isFinite(num) ? num : 0
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

    // On endgame: back to shift 4 of whichever path (won/lost) was taken
    const isEndgame = currentPage.title?.toLowerCase().includes("endgame") || currentPage.id?.toLowerCase().includes("endgame")
    if (isEndgame) {
      const wonAutoField = allFields.find(f => f.type === "checkbox" && f.label.toLowerCase().includes("alliance") && f.label.toLowerCase().includes("won"))
      const path = wonAutoField && values[wonAutoField.id] === true ? "won" : "lost"
      const lastShift = displayPages.find(p => p.id === `${path}_s4`) ?? displayPages.find(p => p.id === `${path}_s3`)
      if (lastShift) {
        setPageIndex(displayPages.findIndex(p => p.id === lastShift.id))
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
    }

    setPageIndex((prev) => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleSubmit = async () => {
    if (!form || !inputs) return
    const didNotShow = values["field_did_not_show"] === true

    if (!didNotShow) {
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
    }

    setSaving(true)
    try {
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
            selectTeam: "",
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
        "container mx-auto max-w-4xl animate-in fade-in-0 duration-300 relative overflow-hidden px-2 pb-0 !pt-2",
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

      <div className={cn("relative z-10 text-sm", uiConfig.pageSpacingClass)}>
      {isPaged ? (
        <div className="absolute left-0 top-0 z-20 text-xs font-medium text-muted-foreground">
          {logicalPageNumber}/{logicalPageCount}
        </div>
      ) : null}
      <div className="pointer-events-none absolute right-0 top-0 z-20">
        <Button
          variant="outline"
          className="pointer-events-auto"
          onClick={() => navigate("/game-start", { state })}
        >
          Back
        </Button>
      </div>


      <div
        key={currentPage.id}
        className={cn(
          "animate-in fade-in-0 slide-in-from-bottom-2 duration-300 !mt-0",
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
              <CardTitle className="text-sm leading-tight">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className={cn("grid grid-cols-2 items-start gap-x-1.5 gap-y-1", compactFieldSpacingClass)}>
              {(() => {
                const sortedFields = [...section.fields].sort(
                  (a, b) => getFieldPriority(a, isTransitionOrPhasePage) - getFieldPriority(b, isTransitionOrPhasePage)
                )
                const primaryEndgameClimbFieldId = isEndgamePage ? sortedFields.find(isClimbField)?.id || "" : ""
                const sectionFields = sortedFields.filter((field) => {
                  if (isMiscField(field)) return false
                  if (field.type === "checkbox" && isNonFunctioningLabel(field.label || "")) {
                    return false
                  }
                  if (isEndgamePage && primaryEndgameClimbFieldId && isClimbField(field) && field.id !== primaryEndgameClimbFieldId) {
                    return false
                  }
                  return true
                })

                return sectionFields.map((field) => {
                const fieldValue = values[field.id]
                const isRequired = Boolean(field.required)
                const fieldError = errors[field.id]
                const group = normalizeExclusiveGroup(field.exclusiveGroup)
                const activeFieldId = group ? activeExclusiveByGroup[group] : ""
                const isGrayedOut = false
                const activeFieldLabel = activeFieldId ? fieldMap[activeFieldId]?.label || "another field" : ""
                const showMergedClimbControl =
                  isEndgamePage && primaryEndgameClimbFieldId === field.id
                const normalizedClimbField = showMergedClimbControl ? { ...field, label: "Climb?" } : field

              if (showMergedClimbControl) {
                return (
                  <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={normalizedClimbField} isRequired={isRequired} />
                    <SpecialMultipleChoice
                      ariaLabel={normalizedClimbField.label}
                      options={CLIMB_LEVEL_OPTIONS}
                      value={typeof fieldValue === "string" ? fieldValue : ""}
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

              if (field.type === "long_text") {
                const isEndgameNotesField = isEndgamePage && isNotesField(field)
                return (
                  <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <Textarea
                      value={String(fieldValue ?? "")}
                      onChange={(event) => handleValueChange(field.id, event.target.value)}
                      placeholder={field.placeholder || ""}
                      className={cn(
                        "w-full",
                        (isPostMatchPage || isEndgameNotesField) && "min-h-80"
                      )}
                    />
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "select") {
                const selectOptions = withSecondaryDefenseOption(field, field.options || [])
                const isTransitionDefended =
                  isTransitionOrPhasePage && isDefendedField(field)
                const showStatusChecks = !isTransitionDefended && isStatusField(field) && selectOptions.length > 0
                const showPredictionButtons = isPredictionField(field) && hasRedBlueOptions(field)
                const selectedStatuses = Array.isArray(fieldValue)
                  ? fieldValue.filter((value): value is string => typeof value === "string")
                  : typeof fieldValue === "string" && fieldValue
                    ? [fieldValue]
                    : []

                if (showStatusChecks) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="space-y-1">
                        {selectOptions.map((option) => {
                          const isChecked = selectedStatuses.includes(option)
                          return (
                            <label
                              key={option}
                              className="flex items-center gap-1.5 rounded-xl border border-border/60 px-2 py-1 text-sm leading-tight"
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => handleValueChange(field.id, toggleOptionValue(selectedStatuses, option))}
                                disabled={isGrayedOut}
                              />
                              <span className="font-medium">{splitSpecialChoiceOption(option).title}</span>
                            </label>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (showPredictionButtons) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="grid grid-cols-2 gap-1">
                        {selectOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          const red = isRedOption(option)
                          const blue = isBlueOption(option)

                          return (
                            <Button
                              key={option}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-7 rounded-xl px-2 text-sm font-semibold leading-tight",
                                red &&
                                  (isSelected
                                    ? "border-red-700 bg-red-600 text-white hover:bg-red-600"
                                    : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"),
                                blue &&
                                  (isSelected
                                    ? "border-blue-700 bg-blue-600 text-white hover:bg-blue-600"
                                    : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"),
                                !red && !blue && isSelected && "border-primary/80 bg-primary/20 text-white hover:bg-primary/25"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                            >
                              {splitSpecialChoiceOption(option).title}
                            </Button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (isStratChoiceField(field)) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-1">
                        {selectOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          return (
                            <button
                              key={option}
                              type="button"
                              aria-pressed={isSelected}
                              className={cn(
                                "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                isSelected
                                  ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              {splitSpecialChoiceOption(option).title}
                            </button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                return (
                  <div
                    key={field.id}
                    className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}
                  >
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="grid grid-cols-2 gap-1">
                      {(field.options || []).map((option) => {
                        const isSelected = String(fieldValue ?? "") === option
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={isSelected}
                            className={cn(
                              "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                              isSelected
                                ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                : "border-border/70 bg-card hover:bg-muted/30"
                            )}
                            onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                            disabled={isGrayedOut}
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            {splitSpecialChoiceOption(option).title}
                          </button>
                        )
                      })}
                    </div>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "radio") {
                if (field.multiSelect) {
                  const selected = Array.isArray(fieldValue) ? (fieldValue as string[]) : []
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-0.5">
                        {(field.options || []).map((option) => (
                          <label key={option} className="flex items-center gap-1 text-xs cursor-pointer leading-tight">
                            <Checkbox
                              checked={selected.includes(option)}
                              onCheckedChange={() => handleToggleOption(field.id, option)}
                              disabled={isGrayedOut}
                            />
                            <span className="font-medium">{option}</span>
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
                const isAutoCollectField = isAutoWhereDidTheyCollectField(field)
                const isAutoStratField = isAutoStrategyField(field)
                const radioOptions = withSecondaryDefenseOption(field, field.options || [])
                const isTransitionDefended =
                  isTransitionOrPhasePage && isDefendedField(field)
                const showStatusChecks = !isTransitionDefended && isStatusField(field) && radioOptions.length > 0
                const showPredictionButtons = isPredictionField(field) && hasRedBlueOptions(field)
                const showStratRole = isStratChoiceField(field)
                const selectedStatuses = Array.isArray(fieldValue)
                  ? fieldValue.filter((value): value is string => typeof value === "string")
                  : typeof fieldValue === "string" && fieldValue
                    ? [fieldValue]
                    : []
                const showTwoColumnRadioGrid =
                  !isAutoStratField &&
                  !showStatusChecks &&
                  !showPredictionButtons &&
                  !showStratRole &&
                  radioOptions.length > 0 &&
                  radioOptions.length <= 4

                if (isAutoCollectField) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="grid grid-cols-2 gap-1">
                        {(field.options || []).map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          return (
                            <Button
                              key={option}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-5 rounded-xl border px-1 py-0 text-xs font-semibold leading-tight text-white",
                                isSelected
                                  ? "border-primary/80 bg-primary/10"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                            >
                              {option}
                            </Button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (showStatusChecks) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="space-y-1">
                        {radioOptions.map((option) => {
                          const isChecked = selectedStatuses.includes(option)
                          return (
                            <label
                              key={option}
                              className="flex items-center gap-1.5 rounded-xl border border-border/60 px-2 py-1 text-sm leading-tight"
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => handleValueChange(field.id, toggleOptionValue(selectedStatuses, option))}
                                disabled={isGrayedOut}
                              />
                              <span className="font-medium">{option}</span>
                            </label>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (showPredictionButtons) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="grid grid-cols-2 gap-1">
                        {radioOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          const red = isRedOption(option)
                          const blue = isBlueOption(option)
                          return (
                            <Button
                              key={option}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-7 rounded-xl px-2 text-sm font-semibold leading-tight",
                                red &&
                                  (isSelected
                                    ? "border-red-700 bg-red-600 text-white hover:bg-red-600"
                                    : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"),
                                blue &&
                                  (isSelected
                                    ? "border-blue-700 bg-blue-600 text-white hover:bg-blue-600"
                                    : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"),
                                !red && !blue && isSelected && "border-primary/80 bg-primary/20 text-white hover:bg-primary/25"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                            >
                              {option}
                            </Button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (showStratRole) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-1">
                        {radioOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          return (
                            <button
                              key={option}
                              type="button"
                              aria-pressed={isSelected}
                              className={cn(
                                "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                isSelected
                                  ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              {option}
                            </button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (showTwoColumnRadioGrid) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-1">
                        {radioOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          return (
                            <Button
                              key={option}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-6 px-1.5 py-0.5 text-sm font-medium leading-tight text-white",
                                isSelected
                                  ? "border-primary/80 bg-primary/20 hover:bg-primary/25"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                            >
                              {option}
                            </Button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                return (
                  <div
                    key={field.id}
                    className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}
                  >
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="grid grid-cols-2 gap-1">
                      {(field.options || []).map((option) => {
                        const isSelected = String(fieldValue ?? "") === option
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={isSelected}
                            className={cn(
                              "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                              isSelected
                                ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                : "border-border/70 bg-card hover:bg-muted/30"
                            )}
                            onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                            disabled={isGrayedOut}
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            {splitSpecialChoiceOption(option).title}
                          </button>
                        )
                      })}
                    </div>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "radio_cards") {
                const isMulti = Boolean(field.multiSelect)
                const isAutoCollectField = isAutoWhereDidTheyCollectField(field)
                const isClimbSpecial = isClimbSpecialField(field)
                const isStratChoice = isStratChoiceField(field)
                const parsedOptions = withSecondaryDefenseOption(field, field.options || [])
                  .map((option) => splitSpecialChoiceOption(option))
                  .filter((option) => option.title.length > 0)

                if (!isMulti && isClimbSpecial && parsedOptions.length > 0) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <SpecialMultipleChoice
                        ariaLabel={field.label}
                        options={parsedOptions.map((option) =>
                          option.description ? `${option.title} | ${option.description}` : option.title
                        )}
                        value={typeof fieldValue === "string" ? fieldValue : ""}
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

                if (isAutoCollectField && parsedOptions.length > 0) {
                  const selectedValues = Array.isArray(fieldValue) ? (fieldValue as string[]) : []
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="grid grid-cols-2 gap-0.5">
                        {parsedOptions.map((option) => {
                          const isSelected = isMulti
                            ? selectedValues.includes(option.value)
                            : String(fieldValue ?? "") === option.value
                          return (
                            <Button
                              key={option.value}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-5 rounded-xl border px-1 py-0 text-xs font-semibold leading-tight text-white",
                                isSelected
                                  ? "border-primary/80 bg-primary/10"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => {
                                if (isMulti) {
                                  handleToggleOption(field.id, option.value)
                                  return
                                }
                                handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option.value)
                              }}
                              disabled={isGrayedOut}
                            >
                              {option.title}
                            </Button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (!isMulti && isStratChoice && parsedOptions.length > 0) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-1">
                        {parsedOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={isSelected}
                              className={cn(
                                "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                isSelected
                                  ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option.value)}
                              disabled={isGrayedOut}
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              {option.title}
                            </button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (!isMulti) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-1">
                        {parsedOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={isSelected}
                              className={cn(
                                "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                isSelected
                                  ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option.value)}
                              disabled={isGrayedOut}
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              {option.title}
                            </button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                return (
                  <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <SpecialMultipleChoice
                      ariaLabel={field.label}
                      options={field.options}
                      multiSelect={isMulti}
                      value={isMulti ? "" : String(fieldValue ?? "")}
                      values={isMulti ? (Array.isArray(fieldValue) ? (fieldValue as string[]) : []) : undefined}
                      onValueChange={(value) => handleValueChange(field.id, value)}
                      onValuesChange={(vals) => handleValueChange(field.id, vals)}
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
                  <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="grid grid-cols-2 gap-1">
                      {(field.options || []).map((option) => (
                        <label key={option} className="flex items-center gap-1 text-xs leading-tight">
                          <Checkbox
                            checked={selected.includes(option)}
                            onCheckedChange={() => handleToggleOption(field.id, option)}
                          />
                          <span className="font-medium">{option}</span>
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
                const isAllianceWonFull = isTransitionPage && isAllianceWonAutoField(field)
                const isStatusCheckbox = isStatusField(field)
                const isTransitionDefended =
                  isTransitionOrPhasePage && isDefendedField(field)
                return (
                  <div
                    key={field.id}
                    className={cn(
                      "space-y-1",
                      (isAllianceWonFull || (isStatusCheckbox && !isTransitionDefended)) && "col-span-2",
                      isGrayedOut && "opacity-50"
                    )}
                  >
                    <label className="flex items-center gap-1 text-sm leading-tight">
                      <Checkbox
                        checked={Boolean(fieldValue)}
                        onCheckedChange={(value) => handleValueChange(field.id, Boolean(value))}
                      />
                      <span className="font-medium">
                        {field.label} {isRequired ? "*" : ""}
                      </span>
                      {field.helpText ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                              aria-label={`${field.label} description`}
                            >
                              <CircleHelp className="h-3.5 w-3.5" />
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
                  <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="flex flex-wrap items-center gap-2">
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
                          className="w-full max-h-40 object-contain"
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

              if (field.type === "number" && Array.isArray(field.stepperButtons) && field.stepperButtons.length > 0) {
                const min = field.min ?? 0
                const max = typeof field.max === "number" ? field.max : undefined
                const step = field.step ?? 1
                const numericValue = toFiniteNumber(fieldValue, min)
                return (
                  <div
                    key={field.id}
                    className={cn("space-y-1", isWideRatingField(field) && "col-span-2", isGrayedOut && "opacity-50")}
                  >
                    <FieldLabel field={field} isRequired={isRequired} />
                    <NumberStepper
                      value={numericValue}
                      onChange={(value) => handleValueChange(field.id, value)}
                      adjustments={field.stepperButtons}
                      min={min}
                      max={max}
                      step={step}
                      disabled={isGrayedOut}
                    />
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
                const isFullWidthSlider = isWideRatingField(field) || isTransitionOrPhasePage
                return (
                  <div
                    key={field.id}
                    className={cn("space-y-1", isFullWidthSlider && "col-span-2", isGrayedOut && "opacity-50")}
                  >
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="space-y-1">
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={numericValue}
                        onChange={(event) => handleValueChange(field.id, event.target.value)}
                        className="w-full"
                        style={{ touchAction: "none" }}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                      />
                      <div className="text-right text-xs font-medium">{numericValue}</div>
                    </div>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "rating") {
                const min = field.min ?? 0
                const max = field.max ?? 5
                const options = Array.from({ length: max - min + 1 }, (_, idx) => String(min + idx))
                return (
                  <div
                    key={field.id}
                    className={cn("space-y-1", isWideRatingField(field) && "col-span-2", isGrayedOut && "opacity-50")}
                  >
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="flex gap-1">
                      {options.map((option) => {
                        const isSelected = String(fieldValue ?? "") === option
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={isSelected}
                            className={cn(
                              "flex-1 h-6 rounded-xl border text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                              isSelected
                                ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                : "border-border/70 bg-card hover:bg-muted/30"
                            )}
                            onClick={() => handleValueChange(field.id, isSelected ? "" : option)}
                            disabled={isGrayedOut}
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
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
                <div
                  key={field.id}
                  className={cn("space-y-1", isWideRatingField(field) && "col-span-2", isGrayedOut && "opacity-50")}
                >
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
                })
              })()}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={cn("flex flex-wrap items-center gap-2", isPaged ? "justify-between" : "justify-end")}>
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
        <div className="flex items-center gap-2">
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
