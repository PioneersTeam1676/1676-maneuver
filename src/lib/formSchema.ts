import type {
  ButtonVariant,
  FormField,
  FormPage,
  FormSchema,
  FormSection,
  FormUiConfig,
} from "@/types/formBuilder"

export const BUTTON_VARIANTS: ButtonVariant[] = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
]

export const DEFAULT_UI_CONFIG: FormUiConfig = {
  layout: "auto",
  pagePaddingClass: "py-8",
  pageSpacingClass: "space-y-6",
  sectionSpacingClass: "space-y-6",
  fieldSpacingClass: "space-y-4",
  sectionCardClassName: "",
  sectionHeaderClassName: "space-y-2",
  pageHeaderClassName: "",
  nav: {
    showProgress: true,
    backLabel: "Back",
    nextLabel: "Next",
    submitLabel: "Submit",
    backVariant: "outline",
    nextVariant: "default",
    submitVariant: "default",
    backClassName: "",
    nextClassName: "",
    submitClassName: "",
  },
}

export type UiPresetKey = "default" | "compact" | "cards"

export const UI_PRESETS: Record<UiPresetKey, FormUiConfig> = {
  default: DEFAULT_UI_CONFIG,
  compact: {
    layout: "auto",
    pagePaddingClass: "py-4",
    pageSpacingClass: "space-y-4",
    sectionSpacingClass: "space-y-4",
    fieldSpacingClass: "space-y-2",
    sectionCardClassName: "border-muted/60",
    sectionHeaderClassName: "space-y-1",
    pageHeaderClassName: "text-sm",
    nav: {
      showProgress: false,
      backLabel: "Back",
      nextLabel: "Next",
      submitLabel: "Submit",
      backVariant: "ghost",
      nextVariant: "default",
      submitVariant: "default",
      backClassName: "px-3",
      nextClassName: "px-4",
      submitClassName: "px-4",
    },
  },
  cards: {
    layout: "paged",
    pagePaddingClass: "py-10",
    pageSpacingClass: "space-y-8",
    sectionSpacingClass: "space-y-8",
    fieldSpacingClass: "space-y-4",
    sectionCardClassName: "bg-card/80 shadow-sm",
    sectionHeaderClassName: "space-y-1 border-b pb-3",
    pageHeaderClassName: "space-y-2 border-b pb-4",
    nav: {
      showProgress: true,
      backLabel: "Back",
      nextLabel: "Continue",
      submitLabel: "Submit",
      backVariant: "outline",
      nextVariant: "secondary",
      submitVariant: "default",
      backClassName: "min-w-[120px]",
      nextClassName: "min-w-[140px]",
      submitClassName: "min-w-[140px]",
    },
  },
}

export const UI_PRESET_OPTIONS: Array<{
  key: UiPresetKey
  label: string
  description: string
}> = [
  {
    key: "default",
    label: "Default",
    description: "Balanced spacing with standard navigation styling.",
  },
  {
    key: "compact",
    label: "Compact",
    description: "Tighter spacing and lighter navigation controls.",
  },
  {
    key: "cards",
    label: "Carded",
    description: "Roomy pages with card emphasis and strong CTA buttons.",
  },
]

export const normalizeUiConfig = (config?: Partial<FormUiConfig> | null): FormUiConfig => {
  const nav = {
    ...DEFAULT_UI_CONFIG.nav,
    ...(config?.nav ?? {}),
  }
  return {
    ...DEFAULT_UI_CONFIG,
    ...(config ?? {}),
    nav,
  }
}

export const getUiPreset = (key: UiPresetKey): FormUiConfig =>
  normalizeUiConfig(UI_PRESETS[key] || DEFAULT_UI_CONFIG)

const normalizeSections = (sections?: FormSection[] | null): FormSection[] =>
  Array.isArray(sections) ? sections : []

export const coercePages = (schema?: FormSchema | null): FormPage[] => {
  const rawPages = Array.isArray(schema?.pages) ? schema?.pages : []
  if (rawPages.length > 0) {
    return rawPages.map((page, index) => ({
      id: page.id || `page_${index + 1}`,
      title: page.title || `Page ${index + 1}`,
      description: page.description || "",
      sections: normalizeSections(page.sections),
    }))
  }

  const legacySections = normalizeSections(schema?.sections)
  return [
    {
      id: "page_1",
      title: "Page 1",
      description: "",
      sections: legacySections,
    },
  ]
}

export const flattenSections = (schema?: FormSchema | null): FormSection[] =>
  coercePages(schema).flatMap((page) => normalizeSections(page.sections))

export const flattenFields = (schema?: FormSchema | null): FormField[] =>
  flattenSections(schema).flatMap((section) => Array.isArray(section.fields) ? section.fields : [])

export const getPageFields = (page?: FormPage | null): FormField[] =>
  normalizeSections(page?.sections).flatMap((section) =>
    Array.isArray(section.fields) ? section.fields : []
  )
