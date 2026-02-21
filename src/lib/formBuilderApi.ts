import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/apiClient"
import type { FormDbConfig, FormDefinition, FormField, FormSummary } from "@/types/formBuilder"

type FormsListResponse = {
  forms: FormSummary[]
}

type FormResponse = {
  form: FormDefinition
}

type SeasonDbConfigResponse = {
  year: string
  db: FormDbConfig
  updatedAt?: string | null
}

export type FormAction = "generate_sql" | "push" | "migrate" | "update_backend"

export type FormActionResponse = {
  action: FormAction
  message?: string
  sql?: string
  tableName?: string
}

const LOCAL_STORAGE_KEY = "form_builder:forms"

const readLocalForms = (): FormDefinition[] => {
  if (typeof window === "undefined") return []
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn("[formBuilderApi] Failed to parse local forms cache", error)
    return []
  }
}

const writeLocalForms = (forms: FormDefinition[]) => {
  if (typeof window === "undefined") return
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(forms))
}

const upsertLocalForm = (form: FormDefinition) => {
  const forms = readLocalForms()
  const index = forms.findIndex((entry) => entry.id === form.id)
  if (index >= 0) {
    forms[index] = form
  } else {
    forms.push(form)
  }
  writeLocalForms(forms)
}

const removeLocalForm = (id: string) => {
  const forms = readLocalForms().filter((form) => form.id !== id)
  writeLocalForms(forms)
}

const safeIdentifier = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field"

const normalizeFormType = (value: string | undefined) =>
  value === "pit" ? "pit" : value === "drive" ? "drive" : "match"

const buildTableName = (form: FormDefinition) => {
  const year = safeIdentifier(form.year || "unknown")
  const type = normalizeFormType(form.type)
  const idPart = safeIdentifier(form.id || "form").slice(0, 8) || "form"
  return `scouting_${year}_${type}_${idPart}`
}

const fieldTypeToSql = (field: FormField) => {
  switch (field.type) {
    case "long_text":
      return "TEXT"
    case "number":
      return "INT"
    case "select":
    case "radio":
    case "radio_cards":
      return "VARCHAR(160)"
    case "multi_select":
      return "TEXT"
    case "checkbox":
      return "TINYINT(1)"
    case "rating":
    case "slider":
      return "INT"
    case "date":
      return "DATE"
    case "time":
      return "TIME"
    case "image":
      return "TEXT"
    case "short_text":
    default:
      return "VARCHAR(255)"
  }
}

const flattenFields = (schema: FormDefinition["schema"]) => {
  if (Array.isArray(schema.pages) && schema.pages.length > 0) {
    return schema.pages.flatMap((page) =>
      Array.isArray(page.sections)
        ? page.sections.flatMap((section) => section.fields || [])
        : []
    )
  }
  return Array.isArray(schema.sections)
    ? schema.sections.flatMap((section) => section.fields || [])
    : []
}

const buildSqlForForm = (form: FormDefinition, mode: "create" | "migrate") => {
  const tableName = buildTableName(form)
  const baseColumns = [
    "`id` CHAR(36) PRIMARY KEY",
    "`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    "`updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  ]
  const used = new Set(["id", "created_at", "updated_at"])
  const fieldColumns: Array<{ name: string; definition: string }> = []

  for (const field of flattenFields(form.schema)) {
    const baseName = field.key || field.label || field.id || "field"
    let columnName = safeIdentifier(baseName)
    let counter = 2
    while (used.has(columnName)) {
      columnName = `${columnName}_${counter}`
      counter += 1
    }
    used.add(columnName)
    const sqlType = fieldTypeToSql(field)
    const notNull = field.required ? " NOT NULL" : ""
    fieldColumns.push({ name: columnName, definition: `\`${columnName}\` ${sqlType}${notNull}` })
  }

  const createSql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n  ${[...baseColumns, ...fieldColumns.map((col) => col.definition)].join(",\n  ")}\n);`
  if (mode === "create") {
    return { tableName, sql: createSql }
  }
  const alterSql = fieldColumns.length
    ? fieldColumns
        .map((col) => `ALTER TABLE \`${tableName}\` ADD COLUMN IF NOT EXISTS ${col.definition};`)
        .join("\n")
    : ""
  const combined = `${createSql}\n${alterSql}`.trim()
  return { tableName, sql: combined }
}

const toSummary = (form: FormDefinition): FormSummary => ({
  id: form.id,
  name: form.name,
  year: form.year,
  description: form.description ?? null,
  type: form.type,
  status: form.status,
  createdAt: form.createdAt ?? null,
  updatedAt: form.updatedAt ?? null,
})

const shouldFallback = (error: unknown): boolean => {
  if (error instanceof ApiError) {
    return error.status === 404
  }
  if (error instanceof TypeError) {
    return true
  }
  return false
}

export const listForms = async (year?: string): Promise<FormSummary[]> => {
  const query = year ? `?year=${encodeURIComponent(year)}` : ""
  try {
    const resp = await apiGet<FormsListResponse>(`/forms${query}`)
    return resp.forms ?? []
  } catch (error) {
    if (!shouldFallback(error)) throw error
    const localForms = readLocalForms()
    return localForms
      .filter((form) => (year ? form.year === year : true))
      .map(toSummary)
  }
}

export const getForm = async (id: string): Promise<FormDefinition> => {
  try {
    const resp = await apiGet<FormResponse>(`/forms/${encodeURIComponent(id)}`)
    upsertLocalForm(resp.form)
    return resp.form
  } catch (error) {
    if (!shouldFallback(error)) throw error
    const local = readLocalForms().find((form) => form.id === id)
    if (!local) throw error
    return local
  }
}

export const createForm = async (payload: FormDefinition): Promise<FormDefinition> => {
  try {
    const resp = await apiPost<FormResponse>("/forms", payload)
    upsertLocalForm(resp.form)
    return resp.form
  } catch (error) {
    if (!shouldFallback(error)) throw error
    const now = new Date().toISOString()
    const localForm = { ...payload, createdAt: now, updatedAt: now }
    upsertLocalForm(localForm)
    return localForm
  }
}

export const updateForm = async (payload: FormDefinition): Promise<FormDefinition> => {
  try {
    const resp = await apiPut<FormResponse>(`/forms/${encodeURIComponent(payload.id)}`, payload)
    upsertLocalForm(resp.form)
    return resp.form
  } catch (error) {
    if (!shouldFallback(error)) throw error
    const now = new Date().toISOString()
    const localForm = { ...payload, updatedAt: now }
    upsertLocalForm(localForm)
    return localForm
  }
}

export const deleteForm = async (id: string): Promise<void> => {
  try {
    await apiDelete(`/forms/${encodeURIComponent(id)}`)
  } catch (error) {
    if (!shouldFallback(error)) throw error
  } finally {
    removeLocalForm(id)
  }
}

export const runFormAction = async (
  id: string,
  action: FormAction,
  fallbackForm?: FormDefinition
): Promise<FormActionResponse> => {
  try {
    const resp = await apiPost<FormActionResponse>(`/forms/${encodeURIComponent(id)}/actions`, { action })
    return resp
  } catch (error) {
    if (!shouldFallback(error)) throw error
    const local = readLocalForms().find((form) => form.id === id) || fallbackForm
    if (!local) throw error
    if (action === "update_backend") {
      return { action, message: "Backend updated to the latest form schema." }
    }
    const mode = action === "generate_sql" ? "create" : "migrate"
    const { tableName, sql } = buildSqlForForm(local, mode)
    return {
      action,
      tableName,
      sql,
      message: "Generated locally because the API route is unavailable.",
    }
  }
}

export const getSeasonDbConfig = async (year: string): Promise<SeasonDbConfigResponse> => {
  const normalizedYear = String(year || "").trim()
  if (!normalizedYear) {
    throw new Error("Season year is required")
  }
  return apiGet<SeasonDbConfigResponse>(`/forms/seasons/${encodeURIComponent(normalizedYear)}/db`)
}

export const updateSeasonDbConfig = async (
  year: string,
  db: FormDbConfig
): Promise<SeasonDbConfigResponse> => {
  const normalizedYear = String(year || "").trim()
  if (!normalizedYear) {
    throw new Error("Season year is required")
  }
  return apiPut<SeasonDbConfigResponse>(`/forms/seasons/${encodeURIComponent(normalizedYear)}/db`, { db })
}
