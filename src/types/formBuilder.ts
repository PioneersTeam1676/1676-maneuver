export type FormStatus = "draft" | "published" | "archived"
export type FormType = "match" | "pit"

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

export type FormField = {
  id: string
  type: FormFieldType
  label: string
  key?: string
  helpText?: string
  required?: boolean
  placeholder?: string
  options?: string[]
  min?: number
  max?: number
  step?: number
}

export type FormSection = {
  id: string
  title: string
  description?: string
  imageUrl?: string
  fields: FormField[]
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

export type FormDefinition = {
  id: string
  name: string
  year: string
  description?: string
  type: FormType
  status: FormStatus
  db: FormDbConfig
  webhook?: FormWebhookConfig
  schema: {
    sections: FormSection[]
  }
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
