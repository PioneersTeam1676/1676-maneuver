import type { FormType } from "@/types/formBuilder"
import { apiGet, apiPut, ApiError } from "@/lib/apiClient"

export const ACTIVE_FORM_STORAGE_KEY = "form_builder:active"
export const ACTIVE_FORM_UPDATED_EVENT = "formBuilderActiveUpdated"
const ACTIVE_FORM_API_PATH = "/forms/active"

export type ActiveFormConfig = {
  match?: string
  pit?: string
  updatedAt?: string
}

type ActiveFormResponse = {
  active?: ActiveFormConfig
}

const sanitizeId = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const coerceUpdatedAt = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Date.parse(trimmed)
    if (Number.isNaN(parsed)) return trimmed
    return new Date(parsed).toISOString()
  }
  if (typeof value === "number") {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    const date = new Date(ms)
    if (Number.isNaN(date.getTime())) return undefined
    return date.toISOString()
  }
  return undefined
}

const normalizeConfig = (config?: Partial<ActiveFormConfig> | null): ActiveFormConfig => ({
  match: sanitizeId(config?.match),
  pit: sanitizeId(config?.pit),
  updatedAt: coerceUpdatedAt(config?.updatedAt),
})

const extractActiveConfig = (
  payload: ActiveFormResponse | ActiveFormConfig | null | undefined
): Partial<ActiveFormConfig> | null => {
  if (!payload) return null
  if (typeof payload === "object" && "active" in payload) {
    return (payload as ActiveFormResponse).active ?? null
  }
  return payload as ActiveFormConfig
}

const getConfigStamp = (config: ActiveFormConfig): number => {
  if (!config.updatedAt) return 0
  const parsed = Date.parse(config.updatedAt)
  return Number.isNaN(parsed) ? 0 : parsed
}

const shouldFallback = (error: unknown): boolean => {
  if (error instanceof ApiError) {
    return error.status === 404
  }
  if (error instanceof TypeError) {
    return true
  }
  return false
}

export const readActiveFormConfig = (): ActiveFormConfig => {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(ACTIVE_FORM_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<ActiveFormConfig>
    return normalizeConfig(parsed)
  } catch (error) {
    console.warn("[activeForm] Failed to read active form config", error)
    return {}
  }
}

const writeActiveFormConfig = (config: ActiveFormConfig) => {
  if (typeof window === "undefined") return
  try {
    const normalized = normalizeConfig(config)
    const payload: ActiveFormConfig = {
      match: normalized.match,
      pit: normalized.pit,
      updatedAt: normalized.updatedAt || new Date().toISOString(),
    }
    if (!payload.match && !payload.pit) {
      localStorage.removeItem(ACTIVE_FORM_STORAGE_KEY)
    } else {
      localStorage.setItem(ACTIVE_FORM_STORAGE_KEY, JSON.stringify(payload))
    }
    window.dispatchEvent(new Event(ACTIVE_FORM_UPDATED_EVENT))
  } catch (error) {
    console.warn("[activeForm] Failed to persist active form config", error)
  }
}

export const fetchActiveFormConfig = async (): Promise<ActiveFormConfig> => {
  const resp = await apiGet<ActiveFormResponse | ActiveFormConfig>(ACTIVE_FORM_API_PATH)
  return normalizeConfig(extractActiveConfig(resp))
}

const pushActiveFormConfig = async (config: ActiveFormConfig): Promise<ActiveFormConfig> => {
  const payload = {
    match: config.match ?? null,
    pit: config.pit ?? null,
  }
  const resp = await apiPut<ActiveFormResponse | ActiveFormConfig>(ACTIVE_FORM_API_PATH, payload)
  return normalizeConfig(extractActiveConfig(resp))
}

export const syncActiveFormConfig = async (): Promise<ActiveFormConfig> => {
  const local = readActiveFormConfig()
  try {
    const remote = await fetchActiveFormConfig()
    const remoteStamp = getConfigStamp(remote)
    const localStamp = getConfigStamp(local)
    if (remoteStamp >= localStamp && (remoteStamp > 0 || remote.match || remote.pit)) {
      writeActiveFormConfig(remote)
      return remote
    }
    if (localStamp > remoteStamp && (local.match || local.pit)) {
      void pushActiveFormConfig(local).catch((error) => {
        if (!shouldFallback(error)) {
          console.warn("[activeForm] Failed to push local config", error)
        }
      })
    }
    return local
  } catch (error) {
    if (!shouldFallback(error)) throw error
    return local
  }
}

export const getActiveFormId = (type: FormType): string => {
  const config = readActiveFormConfig()
  return type === "pit" ? config.pit || "" : config.match || ""
}

export const setActiveFormId = (type: FormType, id: string | null) => {
  const config = readActiveFormConfig()
  const next: ActiveFormConfig = {
    ...config,
    [type === "pit" ? "pit" : "match"]: id ? id.trim() : undefined,
    updatedAt: new Date().toISOString(),
  }
  writeActiveFormConfig(next)
  void pushActiveFormConfig(next).catch((error) => {
    if (!shouldFallback(error)) {
      console.warn("[activeForm] Failed to sync active form config", error)
    }
  })
}
