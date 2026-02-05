import { apiGet, apiPut } from "./apiClient"

export const STORAGE_EVENTS_KEY = "eventsList"
export const STORAGE_EVENT_NAME_KEY = "eventName"
export const EVENT_UPDATED_EVENT = "eventNameUpdated"

export interface EventSettingsPayload {
  currentEvent?: string | null
  events?: string[]
}

export interface EventSettingsResponse {
  currentEvent: string
  events: string[]
  updatedAt: number
}

const sanitizeEventName = (value: unknown): string => {
  if (typeof value !== "string") return ""
  return value.trim()
}

const sanitizeEventList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return []
  }
  const unique = new Map<string, string>()
  for (const value of values) {
    const candidate = sanitizeEventName(value)
    if (!candidate) continue
    const key = candidate.toLowerCase()
    if (!unique.has(key)) {
      unique.set(key, candidate)
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
}

const broadcastUpdate = () => {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(EVENT_UPDATED_EVENT))
}

export const applyEventSettingsToStorage = (settings: EventSettingsResponse) => {
  if (typeof window === "undefined") return

  const events = sanitizeEventList(settings.events)
  const currentEvent = sanitizeEventName(settings.currentEvent)

  try {
    if (events.length > 0) {
      localStorage.setItem(STORAGE_EVENTS_KEY, JSON.stringify(events))
    } else {
      localStorage.removeItem(STORAGE_EVENTS_KEY)
    }

    if (currentEvent) {
      localStorage.setItem(STORAGE_EVENT_NAME_KEY, currentEvent)
    } else {
      localStorage.removeItem(STORAGE_EVENT_NAME_KEY)
    }
  } catch (error) {
    console.warn("Failed to persist event settings", error)
  }

  broadcastUpdate()
}

export const fetchEventSettings = async (): Promise<EventSettingsResponse> => {
  const response = await apiGet<EventSettingsResponse>("/events/settings")
  return {
    currentEvent: sanitizeEventName(response.currentEvent),
    events: sanitizeEventList(response.events),
    updatedAt: response.updatedAt ?? 0,
  }
}

export const syncEventSettings = async (): Promise<EventSettingsResponse> => {
  const settings = await fetchEventSettings()
  applyEventSettingsToStorage(settings)
  return settings
}

export const updateEventSettings = async (payload: EventSettingsPayload): Promise<EventSettingsResponse> => {
  const response = await apiPut<EventSettingsResponse>("/events/settings", payload)
  const sanitized = {
    currentEvent: sanitizeEventName(response.currentEvent),
    events: sanitizeEventList(response.events),
    updatedAt: response.updatedAt ?? 0,
  }
  applyEventSettingsToStorage(sanitized)
  return sanitized
}
