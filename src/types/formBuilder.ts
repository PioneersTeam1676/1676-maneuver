export type FormStatus = "draft" | "published" | "archived"
export type FormType = "match" | "pit" | "drive"

export type FormFieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "select"
  | "multi_select"
  | "radio"
  | "checkbox"
  | "rating"
  | "slider"
  | "date"
  | "time"
  | "image"

export type FormField = {
  id: string
  type: FormFieldType
  label: string
  key?: string
  helpText?: string
  exclusiveGroup?: string
  required?: boolean
  placeholder?: string
  options?: string[]
  min?: number
  max?: number
  step?: number
  conditionalNavigation?: Record<string, string> // Maps option value to target page ID
}

export type FormSection = {
  id: string
  title: string
  description?: string
  imageUrl?: string
  fields: FormField[]
}

export type FormFloatingImage = {
  id: string
  src: string
  alt?: string
  x: number
  y: number
  width: number
  opacity?: number
  rotation?: number
  zIndex?: number
  showOnMobile?: boolean
}

export type FormPage = {
  id: string
  title: string
  description?: string
  floatingImages?: FormFloatingImage[]
  sections: FormSection[]
}

export type FormDbConfig = {
  host: string
  name: string
  user: string
  pass: string
  engine: string
}

export type FormWebhookMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type FormWebhookConfig = {
  url: string
  method: FormWebhookMethod
  authHeader?: string
}

export type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link"

export type FormUiConfig = {
  layout?: "auto" | "single" | "paged"
  pagePaddingClass?: string
  pageSpacingClass?: string
  sectionSpacingClass?: string
  fieldSpacingClass?: string
  sectionCardClassName?: string
  sectionHeaderClassName?: string
  pageHeaderClassName?: string
  nav?: {
    showProgress?: boolean
    backLabel?: string
    nextLabel?: string
    submitLabel?: string
    backVariant?: ButtonVariant
    nextVariant?: ButtonVariant
    submitVariant?: ButtonVariant
    backClassName?: string
    nextClassName?: string
    submitClassName?: string
  }
}

export type FormSchema = {
  sections?: FormSection[]
  pages?: FormPage[]
  ui?: FormUiConfig
}

export type FormDefinition = {
  id: string
  name: string
  year: string
  description?: string
  type: FormType
  status: FormStatus
  db: FormDbConfig
  webhook?: FormWebhookConfig
  schema: FormSchema
  createdAt?: string | null
  updatedAt?: string | null
}

export type FormSummary = {
  id: string
  name: string
  year: string
  description?: string | null
  type: FormType
  status: FormStatus
  createdAt?: string | null
  updatedAt?: string | null
}
